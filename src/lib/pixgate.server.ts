// PixGate: pagamentos via Pix. Somente servidor.
// Chave cadastrada no /admin (private_settings, só service role). O secret PIXGATE_API_KEY do
// Lovable serve de reserva.
export const PIXGATE_API = "https://app.pixgateip.com/api";

const KEY = "pixgate_api_key";
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
export async function getPixgateKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = (await savedKey()) || process.env["PIXGATE_API_KEY"] || null;
  cache = { value, at: Date.now() };
  return value;
}

/** De onde vem a chave em uso (para mostrar no /admin). */
export async function getPixgateKeySource(): Promise<{
  key: string | null;
  source: "admin" | "secret" | null;
}> {
  const saved = await savedKey();
  if (saved) return { key: saved, source: "admin" };
  const env = process.env["PIXGATE_API_KEY"] || null;
  return { key: env, source: env ? "secret" : null };
}

export async function savePixgateKey(value: string): Promise<void> {
  const { error } = await (await db())
    .from("private_settings")
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

export async function deletePixgateKey(): Promise<void> {
  const { error } = await (await db()).from("private_settings").delete().eq("key", KEY);
  if (error) throw new Error(error.message);
  cache = null;
}

/**
 * Testa a chave sem criar cobrança: consulta um Pix inexistente.
 * 401/403 ("Client id inválido") = chave recusada; qualquer outra resposta = chave aceita.
 */
export async function testPixgateKey(): Promise<{
  ok: boolean;
  status?: number | undefined;
  error?: string | undefined;
}> {
  const key = await getPixgateKey();
  if (!key) return { ok: false, error: "Nenhuma chave cadastrada" };
  try {
    const res = await fetch(`${PIXGATE_API}/stats/00000000-0000-0000-0000-000000000000`, {
      headers: { Apikey: key, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403)
      return { ok: false, status: res.status, error: "Chave recusada pela PixGate" };
    return { ok: res.status < 500, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de conexão" };
  }
}
