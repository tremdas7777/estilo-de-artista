// Gateway Pix PayShark. Somente servidor. Docs (só logado): https://app.gatewaypayshark.com.br/docs
// Chave (Bearer, "credencial padrão" do painel → Financeiro → Integrações) cadastrada no /admin
// (private_settings, só service role). O secret PAYSHARK_API_KEY do Lovable serve de reserva.
export const PAYSHARK_API = "https://api.gatewaypayshark.com.br/v1";

const KEY = "payshark_api_key";
// A tela do pedido consulta o status a cada poucos segundos: guarda a chave por 1 minuto.
const CACHE_MS = 60_000;
let cache: { value: string | null; at: number } | null = null;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Chave salva no /admin (se houver). */
async function savedKey(): Promise<string | null> {
  const { data } = await (await db())
    .from("private_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  return (data?.value as string | null) || null;
}

/** Chave em uso: a do /admin ou, sem ela, o secret do Lovable. */
export async function getPaySharkKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = (await savedKey()) || process.env["PAYSHARK_API_KEY"] || null;
  cache = { value, at: Date.now() };
  return value;
}

/** De onde vem a chave em uso (para mostrar no /admin). */
export async function getPaySharkKeySource(): Promise<{
  key: string | null;
  source: "admin" | "secret" | null;
}> {
  const saved = await savedKey();
  if (saved) return { key: saved, source: "admin" };
  const env = process.env["PAYSHARK_API_KEY"] || null;
  return { key: env, source: env ? "secret" : null };
}

export async function savePaySharkKey(value: string): Promise<void> {
  const { error } = await (await db())
    .from("private_settings")
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

export async function deletePaySharkKey(): Promise<void> {
  const { error } = await (await db()).from("private_settings").delete().eq("key", KEY);
  if (error) throw new Error(error.message);
  cache = null;
}

async function headers(key?: string | null): Promise<Record<string, string>> {
  const k = key ?? (await getPaySharkKey());
  if (!k) throw new Error("Pagamento indisponível no momento.");
  return {
    Authorization: `Bearer ${k}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Achata o "details" da validação em "campo.sub: motivo". */
function flatDetails(d: unknown, path = ""): string[] {
  if (typeof d === "string") return [path ? `${path}: ${d}` : d];
  if (d && typeof d === "object")
    return Object.entries(d as Record<string, unknown>).flatMap(([k, v]) =>
      flatDetails(v, path ? `${path}.${k}` : k),
    );
  return [];
}

/** Telefone do pagador: só dígitos, DDD + número (a PayShark recusa cobrança sem telefone válido). */
const payerPhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};

/**
 * Gera a cobrança Pix (POST /payment, method "PIX"). Valores em centavos (a PayShark também usa
 * centavos). O id vem em "id" e o copia e cola em "data.copypaste".
 */
export async function paysharkCashin(o: {
  amountCents: number;
  customer: { name: string; cpf: string; email: string; phone: string };
  /** Nome genérico enviado ao gateway, sem detalhes do produto real. */
  description: string;
  notificationUrl: string;
  externalRef: string;
  ip?: string | null | undefined;
  /** Endereço de entrega: a PayShark exige quando o item é físico. */
  address?:
    | {
        street: string;
        number: string;
        complement?: string | undefined;
        neighborhood: string;
        city: string;
        state: string;
        zipcode: string;
      }
    | undefined;
}): Promise<{ id: string; qrcode: string; status: string }> {
  const a = o.address;
  if (!a) throw new Error("Confira o CEP e o endereço de entrega.");
  const res = await fetch(`${PAYSHARK_API}/payment`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({
      amount: o.amountCents,
      currency: "BRL",
      method: "PIX",
      description: o.description,
      externalRef: o.externalRef,
      notificationUrl: o.notificationUrl,
      // IP é opcional; só no formato IPv4 (o IPv6 dos celulares pode ser recusado).
      ...(o.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(o.ip) ? { ip: o.ip } : {}),
      payer: {
        name: o.customer.name,
        taxId: o.customer.cpf.replace(/\D/g, ""),
        email: o.customer.email,
        phone: payerPhone(o.customer.phone),
      },
      items: [{ quantity: 1, name: o.description, price: o.amountCents, type: "PHYSICAL" }],
      // Frete já está dentro do valor (amount = itens), por isso fee 0.
      delivery: {
        fee: 0,
        address: {
          line1: `${a.street}, ${a.number}`,
          ...(a.complement ? { line2: a.complement } : {}),
          district: a.neighborhood,
          city: a.city,
          state: a.state.toUpperCase(),
          zipCode: a.zipcode.replace(/\D/g, ""),
          country: "BR",
        },
      },
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
  const json = (await res.json().catch(() => null)) as any;
  // A venda pode vir na raiz ou dentro de "data"; o copia e cola fica em "data.copypaste".
  const tx = json?.id ? json : (json?.data ?? json);
  const txId = tx?.id;
  const qrcode =
    tx?.data?.copypaste ??
    tx?.copypaste ??
    tx?.pix?.copypaste ??
    tx?.pixCode ??
    tx?.qrCode ??
    tx?.qrcode ??
    tx?.emv;
  if (!res.ok || !txId || !qrcode) {
    console.error("PayShark error", res.status, JSON.stringify(json)?.slice(0, 1500));
    // Mostra o motivo que a PayShark devolveu (sem dados pessoais) para facilitar o ajuste.
    // "details" diz qual campo foi recusado (ex.: { payer: { phone: "..." } }).
    const reason = [
      json?.message,
      ...flatDetails(json?.details),
      ...[json?.error, json?.errors].flat(),
    ]
      .filter((x) => typeof x === "string" && x.trim())
      .join("; ");
    throw new Error(
      `Não foi possível gerar o Pix (PayShark ${res.status}${reason ? `: ${reason.slice(0, 400)}` : ""}).`,
    );
  }
  console.log("payshark-create", txId, tx?.status);
  return {
    id: String(txId),
    qrcode: String(qrcode),
    status: String(tx?.status ?? "pending").toLowerCase(),
  };
}

/**
 * Status real do pagamento (GET /payment/:id). Valor em centavos.
 * Status da PayShark: PENDING, PROCESSING, PAID, REFUSED, REFUNDED, MED, CHARGEDBACK. Só "paid" é
 * venda (a regra única de "pago" fica em pix-status.ts).
 */
export async function paysharkStatus(id: string): Promise<{ status: string; amount: number }> {
  const res = await fetch(`${PAYSHARK_API}/payment/${encodeURIComponent(id)}`, {
    headers: await headers(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
  const json = (await res.json().catch(() => null)) as any;
  const tx = json?.id ? json : (json?.data ?? json);
  // Só status no log (sem dados pessoais) para auditar a regra de "pago".
  console.log("payshark-status", id, res.status, JSON.stringify(tx?.status));
  if (!res.ok) throw new Error(`PayShark HTTP ${res.status}`);
  return {
    status: String(tx?.status ?? "pending").toLowerCase(),
    amount: Math.round(Number(tx?.amount ?? 0)),
  };
}

/**
 * Testa a chave sem criar cobrança: consulta um pagamento inexistente (id no formato da PayShark,
 * senão ela recusa o id antes de olhar a chave). 404 = chave aceita; 401/403 = chave recusada.
 */
export async function testPaySharkKey(): Promise<{
  ok: boolean;
  status?: number | undefined;
  error?: string | undefined;
}> {
  const key = await getPaySharkKey();
  if (!key) return { ok: false, error: "Nenhuma chave cadastrada" };
  try {
    const res = await fetch(`${PAYSHARK_API}/payment/cpaysharkteste00000000000`, {
      headers: await headers(key),
    });
    if (res.status === 404 || res.ok) return { ok: true, status: res.status };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
    const json = (await res.json().catch(() => null)) as any;
    return {
      ok: false,
      status: res.status,
      error: String(
        json?.message ??
          (res.status === 401 || res.status === 403 ? "Chave recusada pela PayShark" : "Erro"),
      ).slice(0, 200),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de conexão" };
  }
}
