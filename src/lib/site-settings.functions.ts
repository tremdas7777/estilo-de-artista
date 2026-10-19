import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const getSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabase
    .from("site_settings")
    .select("key,value")
    .in("key", ["whatsapp_enabled", "card_enabled"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    whatsappEnabled: map.get("whatsapp_enabled") === true,
    // Cartão começa desligado; só aparece para os clientes depois de ativado no admin.
    cardEnabled: map.get("card_enabled") === true,
  };
});

export const setCardEnabled = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ password: z.string().min(1).max(200), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.password !== process.env.ADMIN_PASSWORD) {
      throw new Error("Unauthorized");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert({ key: "card_enabled", value: data.enabled, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

export const setWhatsappEnabled = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ password: z.string().min(1).max(200), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.password !== process.env.ADMIN_PASSWORD) {
      throw new Error("Unauthorized");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_settings").upsert({
      key: "whatsapp_enabled",
      value: data.enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });
