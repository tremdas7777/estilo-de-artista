// HyperCash (FastSoft white label): pagamentos com cartão. Somente servidor.
// O cartão é tokenizado no navegador pelo SDK deles — aqui só chega o token (hash), nunca o número.
const API = "https://api.hypercashbrasil.com.br/api/user/transactions";

/** Pedidos de cartão são guardados com este prefixo para saber em qual gateway consultar o status. */
export const CARD_ORDER_PREFIX = "hc_";
export const isCardOrderId = (id: string) => id.startsWith(CARD_ORDER_PREFIX);

// Chaves cadastradas no /admin (private_settings, só service role). Secrets do Lovable servem de reserva.
const SECRET_KEY = "hypercash_secret_key";
const PUBLIC_KEY = "hypercash_public_key";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getHypercashKeys(): Promise<{
  secret: string | null;
  public: string | null;
}> {
  const { data } = await (await db())
    .from("private_settings")
    .select("key,value")
    .in("key", [SECRET_KEY, PUBLIC_KEY]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value as string | null]));
  return {
    secret: map.get(SECRET_KEY) || process.env["HYPERCASH_SECRET_KEY"] || null,
    public: map.get(PUBLIC_KEY) || process.env["HYPERCASH_PUBLIC_KEY"] || null,
  };
}

export async function saveHypercashKeys(k: { secret?: string; public?: string }): Promise<void> {
  const now = new Date().toISOString();
  const rows = [
    ...(k.secret ? [{ key: SECRET_KEY, value: k.secret, updated_at: now }] : []),
    ...(k.public ? [{ key: PUBLIC_KEY, value: k.public, updated_at: now }] : []),
  ];
  if (!rows.length) return;
  const { error } = await (await db()).from("private_settings").upsert(rows);
  if (error) throw new Error(error.message);
}

export async function deleteHypercashKeys(): Promise<void> {
  const { error } = await (await db())
    .from("private_settings")
    .delete()
    .in("key", [SECRET_KEY, PUBLIC_KEY]);
  if (error) throw new Error(error.message);
}

async function auth(secret?: string): Promise<string> {
  const key = secret ?? (await getHypercashKeys()).secret;
  if (!key) throw new Error("Pagamento com cartão indisponível no momento.");
  return `Basic ${btoa(`x:${key}`)}`;
}

/**
 * Testa a chave secreta sem criar cobrança: consulta uma transação inexistente.
 * 404 = chave aceita; 401/403 = chave inválida.
 */
export async function testHypercashSecret(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${API}/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: await auth(), Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403)
      return { ok: false, status: res.status, error: "Chave secreta recusada pela HyperCash" };
    return { ok: res.status < 500, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de conexão" };
  }
}

export type HcAddress = {
  street: string;
  streetNumber: string;
  complement?: string;
  zipCode: string;
  neighborhood: string;
  city: string;
  state: string;
  country: "BR";
};

export type HcTransaction = {
  id: string;
  status: string;
  amount: number;
  refusedReason?: string | null;
  card?: { brand?: string; lastDigits?: string } | null;
};

/** Texto legível de uma mensagem/motivo do gateway (pode vir como texto, lista ou objeto). */
export function gatewayText(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return v.map(gatewayText).filter(Boolean).join("; ") || null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      gatewayText(o["description"] ?? o["message"] ?? o["reason"] ?? o["error"]) ??
      JSON.stringify(v).slice(0, 200)
    );
  }
  return String(v);
}

function parseTx(json: any): HcTransaction | null {
  const d = json?.data ?? json;
  if (!d?.id) return null;
  return {
    id: String(d.id),
    status: String(d.status ?? "processing").toLowerCase(),
    amount: Number(d.amount ?? 0),
    refusedReason: gatewayText(d.refusedReason),
    card: d.card ? { brand: d.card.brand, lastDigits: d.card.lastDigits } : null,
  };
}

export async function createCardTransaction(o: {
  amount: number;
  cardHash: string;
  installments: number;
  customer: { name: string; email: string; phone: string; cpf: string };
  address: HcAddress;
  shippingFee: number;
  items: { title: string; unitPrice: number; quantity: number }[];
  postbackUrl: string;
  ip?: string | null;
}): Promise<HcTransaction> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: await auth(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: o.amount,
      currency: "BRL",
      paymentMethod: "CREDIT_CARD",
      card: { hash: o.cardHash },
      installments: o.installments,
      customer: {
        name: o.customer.name,
        email: o.customer.email,
        phone: o.customer.phone,
        document: { number: o.customer.cpf, type: "CPF" },
        address: o.address,
      },
      shipping: { fee: o.shippingFee, address: o.address },
      items: o.items.map((i) => ({ ...i, tangible: true })),
      postbackUrl: o.postbackUrl,
      ...(o.ip ? { ip: o.ip } : {}),
    }),
  });
  const json = (await res.json().catch(() => null)) as any;
  const tx = parseTx(json);
  if (!res.ok || !tx) {
    // Sem dados do cartão no log: só status HTTP e mensagem do gateway.
    const reason = gatewayText(json?.message ?? json?.error ?? json?.errors);
    // Resposta completa do gateway (não contém dados do cartão) para enviar ao suporte da HyperCash.
    console.error("HyperCash error", res.status, JSON.stringify(json)?.slice(0, 1500));
    // Mostra ao cliente o motivo que o gateway devolveu.
    throw new Error(
      `Não foi possível processar o cartão: ${reason ?? `erro ${res.status} no gateway`}.`,
    );
  }
  console.log("hypercash-create", tx.id, tx.status, tx.refusedReason ?? "");
  return tx;
}

export async function getCardTransaction(id: string): Promise<HcTransaction | null> {
  const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
    headers: { Authorization: await auth(), Accept: "application/json" },
  });
  const json = (await res.json().catch(() => null)) as any;
  const tx = parseTx(json);
  console.log("hypercash-status", id, res.status, tx?.status);
  return tx;
}
