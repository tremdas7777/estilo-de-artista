// Gateway Pix SagacePay. Somente servidor. Docs: https://sub.sagacepay.com/docs
// Chave (sk_live_...) cadastrada no /admin (private_settings, só service role). O secret
// SAGACEPAY_API_KEY do Lovable serve de reserva.
export const SAGACEPAY_API = "https://sagacepay.com/api";

const KEY = "sagacepay_api_key";
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
export async function getSagacePayKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = (await savedKey()) || process.env["SAGACEPAY_API_KEY"] || null;
  cache = { value, at: Date.now() };
  return value;
}

/** De onde vem a chave em uso (para mostrar no /admin). */
export async function getSagacePayKeySource(): Promise<{
  key: string | null;
  source: "admin" | "secret" | null;
}> {
  const saved = await savedKey();
  if (saved) return { key: saved, source: "admin" };
  const env = process.env["SAGACEPAY_API_KEY"] || null;
  return { key: env, source: env ? "secret" : null };
}

export async function saveSagacePayKey(value: string): Promise<void> {
  const { error } = await (await db())
    .from("private_settings")
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

export async function deleteSagacePayKey(): Promise<void> {
  const { error } = await (await db()).from("private_settings").delete().eq("key", KEY);
  if (error) throw new Error(error.message);
  cache = null;
}

async function headers(key?: string | null): Promise<Record<string, string>> {
  const k = key ?? (await getSagacePayKey());
  if (!k) throw new Error("Pagamento indisponível no momento.");
  return { "x-api-key": k, "Content-Type": "application/json", Accept: "application/json" };
}

// A API às vezes devolve a venda dentro de "data".
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
const unwrap = (json: any) => (json?.data && !json?.id ? json.data : json);

/** Gera a cobrança Pix (POST /sales). Valor em centavos; a SagacePay recebe reais (decimal). */
export async function sagaceCashin(o: {
  amountCents: number;
  customer: { name: string; cpf: string; email?: string; phone?: string };
  /** Nome genérico enviado ao gateway, sem detalhes do produto real. */
  description: string;
  postbackUrl: string;
  /** Volta nos webhooks; também é a chave de idempotência (mesma chave = mesma cobrança). */
  externalId: string;
  expiresInSeconds: number;
}): Promise<{ id: string; qrcode: string; status: string }> {
  const amount = Number((o.amountCents / 100).toFixed(2));
  const res = await fetch(`${SAGACEPAY_API}/sales`, {
    method: "POST",
    headers: { ...(await headers()), "idempotency-key": o.externalId },
    body: JSON.stringify({
      amount,
      description: o.description,
      expirationInSeconds: Math.min(86400, Math.max(300, Math.round(o.expiresInSeconds))),
      customer: {
        name: o.customer.name,
        document: o.customer.cpf,
        ...(o.customer.email ? { email: o.customer.email } : {}),
        ...(o.customer.phone ? { phone: o.customer.phone } : {}),
      },
      items: [{ description: o.description, quantity: 1, unitPrice: amount }],
      postbackUrl: o.postbackUrl,
      externalId: o.externalId,
      // Sem "tracking": Meta CAPI e UTMify já são enviados pela própria loja (evita duplicar).
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
  const sale = unwrap((await res.json().catch(() => null)) as any);
  const txId = sale?.id;
  const qrcode = sale?.pixCode;
  if (!res.ok || !txId || !qrcode) {
    console.error("SagacePay error", res.status, JSON.stringify(sale)?.slice(0, 500));
    throw new Error("Não foi possível gerar o Pix. Confira seus dados e tente novamente.");
  }
  return {
    id: String(txId),
    qrcode: String(qrcode),
    status: String(sale?.status ?? "pending").toLowerCase(),
  };
}

/**
 * Status real da venda (GET /sales/:id). Valor devolvido em centavos.
 * Status da SagacePay: pending → paid | failed | refunded | expired. Só "paid" é venda
 * (a regra única de "pago" fica em pix-status.ts).
 */
export async function sagaceStatus(id: string): Promise<{ status: string; amount: number }> {
  const res = await fetch(`${SAGACEPAY_API}/sales/${encodeURIComponent(id)}`, {
    headers: await headers(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
  const sale = unwrap((await res.json().catch(() => null)) as any);
  // Só status no log (sem dados pessoais) para auditar a regra de "pago".
  console.log("sagacepay-status", id, res.status, JSON.stringify(sale?.status));
  if (!res.ok) throw new Error(`SagacePay HTTP ${res.status}`);
  return {
    status: String(sale?.status ?? "pending").toLowerCase(),
    amount: Math.round(Number(sale?.amount ?? 0) * 100),
  };
}

/** Testa a chave sem criar cobrança (GET /sales?limit=1). */
export async function testSagacePayKey(): Promise<{
  ok: boolean;
  status?: number | undefined;
  error?: string | undefined;
}> {
  const key = await getSagacePayKey();
  if (!key) return { ok: false, error: "Nenhuma chave cadastrada" };
  try {
    const res = await fetch(`${SAGACEPAY_API}/sales?page=1&limit=1`, {
      headers: await headers(key),
    });
    if (res.ok) return { ok: true, status: res.status };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta do gateway sem tipo
    const json = (await res.json().catch(() => null)) as any;
    return {
      ok: false,
      status: res.status,
      error: String(json?.message ?? "Chave recusada pela SagacePay").slice(0, 200),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de conexão" };
  }
}
