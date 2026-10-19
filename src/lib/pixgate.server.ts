// PixGate: pagamentos via Pix. Somente servidor.
// Chave: /admin (private_settings) ou secret PIXGATE_API_KEY do Lovable.
import {
  deletePrivateSetting,
  friendlyDbError,
  readPrivateSetting,
  upsertPrivateSetting,
} from "@/lib/private-settings.server";

export const PIXGATE_API = "https://app.pixgateip.com/api";

const KEY = "pixgate_api_key";
const CACHE_MS = 60_000;
let cache: { value: string | null; at: number } | null = null;

function envKey(): string | null {
  const v =
    process.env["PIXGATE_API_KEY"]?.trim() ||
    process.env["PIX_GATE_API_KEY"]?.trim() ||
    null;
  return v || null;
}

async function savedKey(): Promise<string | null> {
  return readPrivateSetting(KEY);
}

/** Chave em uso: a do /admin ou, sem ela, o secret do Lovable. */
export async function getPixgateKey(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = (await savedKey()) || envKey();
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
  const env = envKey();
  return { key: env, source: env ? "secret" : null };
}

export async function savePixgateKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Cole a chave da PixGate.");
  try {
    await upsertPrivateSetting(KEY, trimmed);
  } catch (e) {
    throw new Error(friendlyDbError(e));
  }
  cache = null;
}

export async function deletePixgateKey(): Promise<void> {
  try {
    await deletePrivateSetting(KEY);
  } catch (e) {
    throw new Error(friendlyDbError(e));
  }
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
  if (!key)
    return {
      ok: false,
      error: "Nenhuma chave. Secret PIXGATE_API_KEY ou cole no /admin → Gateway do Pix.",
    };
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
