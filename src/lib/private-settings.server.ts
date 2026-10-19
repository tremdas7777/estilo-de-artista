/** Helpers para private_settings (chaves de gateway no /admin). */

export function friendlyDbError(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  const m = raw.toLowerCase();

  if (m.includes("supabase") && (m.includes("missing") || m.includes("service"))) {
    return "Supabase sem service role. Conecte o projeto em More → Cloud ou coloque ESTILO_SB_SERVICE_ROLE_KEY nos Secrets.";
  }
  if (m.includes("private_settings") && (m.includes("does not exist") || m.includes("não existe"))) {
    return "Tabela private_settings não existe. No Supabase → SQL Editor, rode o arquivo supabase/setup-all.sql do repo.";
  }
  if (m.includes("row-level security") || m.includes("rls") || m.includes("42501")) {
    return "Bloqueado pelo RLS. Confira se SUPABASE_SERVICE_ROLE_KEY é a chave service_role (não a anon).";
  }
  if (m.includes("não autorizado") || m.includes("unauthorized")) {
    return "Senha do admin inválida. Confira o Secret ADMIN_PASSWORD.";
  }
  return raw || "Falha ao salvar no banco.";
}

export async function upsertPrivateSetting(key: string, value: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("private_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error(friendlyDbError(error));
}

export async function deletePrivateSetting(key: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("private_settings").delete().eq("key", key);
  if (error) throw new Error(friendlyDbError(error));
}

export async function readPrivateSetting(key: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("private_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error("[private_settings]", key, error.message);
      return null;
    }
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    return v || null;
  } catch (e) {
    console.error("[private_settings]", key, e);
    return null;
  }
}
