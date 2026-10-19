// Meta Conversions API (servidor). Nunca lança: falha no Meta não quebra a loja.
import { createHash } from "crypto";

export type MetaConfig = { pixelId: string | null; accessToken: string | null; testCode: string | null };

const KEYS = ["meta_pixel_id", "meta_access_token", "meta_test_code"] as const;

export async function getMetaConfig(): Promise<MetaConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("private_settings").select("key,value").in("key", [...KEYS]);
  const m = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    pixelId: m.get("meta_pixel_id") || null,
    accessToken: m.get("meta_access_token") || null,
    testCode: m.get("meta_test_code") || null,
  };
}

export async function saveMetaConfig(c: { pixelId: string; accessToken?: string; testCode: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const rows = [
    { key: "meta_pixel_id", value: c.pixelId, updated_at: now },
    { key: "meta_test_code", value: c.testCode, updated_at: now },
  ];
  // Token só é substituído quando um novo é digitado.
  if (c.accessToken) rows.push({ key: "meta_access_token", value: c.accessToken, updated_at: now });
  const { error } = await supabaseAdmin.from("private_settings").upsert(rows);
  if (error) throw new Error(error.message);
}

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export type CapiUser = {
  email?: string;
  phone?: string; // só dígitos, com ou sem 55
  name?: string;
  cpf?: string;
  ip?: string | null;
  ua?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type CapiEvent = {
  eventName: string;
  eventId: string;
  url?: string;
  user: CapiUser;
  customData?: Record<string, unknown>;
};

export async function sendCapiEvent(ev: CapiEvent): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getMetaConfig();
    if (!cfg.pixelId || !cfg.accessToken) return { ok: false, error: "Pixel ou token não configurado" };
    const u = ev.user;
    const [fn, ...rest] = (u.name ?? "").trim().split(/\s+/);
    const ln = rest.pop();
    const phone = u.phone?.replace(/\D/g, "");
    const user_data: Record<string, unknown> = {
      client_ip_address: u.ip ?? undefined,
      client_user_agent: u.ua ?? undefined,
      fbp: u.fbp ?? undefined,
      fbc: u.fbc ?? undefined,
      em: u.email ? [sha(u.email)] : undefined,
      ph: phone ? [sha(phone.startsWith("55") ? phone : `55${phone}`)] : undefined,
      fn: fn ? [sha(fn)] : undefined,
      ln: ln ? [sha(ln)] : undefined,
      external_id: u.cpf ? [sha(u.cpf.replace(/\D/g, ""))] : undefined,
      country: [sha("br")],
    };
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: ev.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: ev.eventId,
          action_source: "website",
          event_source_url: ev.url,
          user_data,
          custom_data: ev.customData,
        },
      ],
    };
    if (cfg.testCode) body["test_event_code"] = cfg.testCode;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("Meta CAPI error", res.status, t.slice(0, 300));
      return { ok: false, error: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    console.error("Meta CAPI failed", e);
    return { ok: false, error: "Falha de conexão" };
  }
}
