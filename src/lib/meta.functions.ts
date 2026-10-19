import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getMetaConfig, saveMetaConfig, sendCapiEvent } from "./meta.server";

function assertAdmin(password: string) {
  if (password !== process.env["ADMIN_PASSWORD"]) throw new Error("Não autorizado");
}

function reqMeta() {
  const r = getRequest();
  const h = r?.headers;
  const ip = h?.get("cf-connecting-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { ip, ua: h?.get("user-agent") ?? null };
}

/** Público: só o ID do pixel (nunca o token). */
export const getMetaPixelId = createServerFn({ method: "GET" }).handler(async () => {
  const c = await getMetaConfig().catch(() => null);
  return { pixelId: c?.pixelId ?? null };
});

export const getMetaAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    const c = await getMetaConfig();
    return {
      pixelId: c.pixelId ?? "",
      testCode: c.testCode ?? "",
      hasToken: Boolean(c.accessToken),
      tokenHint: c.accessToken ? `••••${c.accessToken.slice(-4)}` : "",
    };
  });

export const saveMetaAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        password: z.string().min(1).max(200),
        pixelId: z.string().trim().regex(/^\d{5,25}$/, "ID do pixel deve ter só números"),
        accessToken: z.string().trim().max(600).optional(),
        testCode: z.string().trim().max(40).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await saveMetaConfig({ pixelId: data.pixelId, accessToken: data.accessToken || undefined, testCode: data.testCode });
    return { ok: true };
  });

export const testMetaAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    // Teste = compra paga (Purchase), igual ao que é enviado quando o Pix cai.
    return sendCapiEvent({
      eventName: "Purchase",
      eventId: `test-purchase-${Date.now()}`,
      url: "https://aidexbrasil.com/",
      user: { ...reqMeta(), email: "maria.teste@example.com", name: "Maria Teste Silva" },
      customData: { value: 447.3, currency: "BRL", content_name: "Glycom G7 CGM", content_type: "product" },
    });
  });

/** Eventos de navegação (espelho servidor do pixel do navegador, com o mesmo event_id). */
export const trackMetaEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        eventName: z.enum(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo"]),
        eventId: z.string().min(6).max(80),
        url: z.string().url().max(1000),
        fbp: z.string().max(200).nullable().optional(),
        fbc: z.string().max(300).nullable().optional(),
        value: z.number().min(0).max(100000).optional(),
        contentName: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await sendCapiEvent({
      eventName: data.eventName,
      eventId: data.eventId,
      url: data.url,
      user: { ...reqMeta(), fbp: data.fbp, fbc: data.fbc },
      customData:
        data.value !== undefined
          ? { value: data.value, currency: "BRL", content_name: data.contentName, content_type: "product" }
          : undefined,
    });
    return { ok: true };
  });

