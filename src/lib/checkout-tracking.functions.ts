import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Etapas do checkout, na ordem. "pix" = Pix gerado (o pagamento é conferido em pix_orders). */
export const CHECKOUT_STEPS = ["checkout", "dados", "entrega", "pix"] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

const stepSchema = z.object({
  sessionId: z.string().uuid(),
  step: z.enum(CHECKOUT_STEPS),
  plano: z.string().max(10),
  planoNome: z.string().max(80),
  value: z.number().min(0).max(100000),
  // Contato só para recuperar o carrinho — sem CPF.
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, "").slice(0, 13))
    .optional(),
  cidade: z.string().trim().max(80).optional(),
  uf: z.string().trim().max(2).optional(),
  frete: z.string().max(20).optional(),
  bump: z.boolean().optional(),
  bumps: z.array(z.string().max(80)).max(5).optional(),
  pixId: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
  utm: z.record(z.string(), z.string().max(300).nullable()).optional(),
});

/**
 * Registra a etapa em funnel_events (event_type "checkout_step") pelo servidor.
 * Nunca lança erro: rastreio não pode atrapalhar a compra.
 */
export const trackCheckoutStep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => stepSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sessionId, step, plano, planoNome, value, utm, ...rest } = data;
      await supabaseAdmin.from("funnel_events").insert({
        session_id: sessionId,
        event_type: "checkout_step",
        path: "/checkout",
        bundle_id: plano,
        bundle_name: planoNome,
        value,
        utm_source: utm?.["utm_source"] ?? null,
        utm_medium: utm?.["utm_medium"] ?? null,
        utm_campaign: utm?.["utm_campaign"] ?? null,
        metadata: { step, ...rest } as never,
      });
    } catch (e) {
      console.error("trackCheckoutStep failed", e);
    }
    return { ok: true };
  });
