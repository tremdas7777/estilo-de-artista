import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getBundle } from "@/lib/bundles";
import { priceCart } from "@/lib/cart-pricing.server";
import {
  saveOrder,
  fetchGatewayStatus,
  reportPaidOnce,
  reportPendingToUtmify,
  getOrder,
  findUpsellOf,
} from "@/lib/pix-orders.server";
import { createCardTransaction, CARD_ORDER_PREFIX, getHypercashKeys } from "@/lib/hypercash.server";
import { createPix } from "@/lib/pix-gateway.server";
import { isPaidStatus } from "@/lib/pix-status";
import { UPSELL_PRODUCTS, upsellSelection } from "@/lib/upsell";
import { getRequest } from "@tanstack/react-start/server";
import { CARD_MAX_INSTALLMENTS } from "@/lib/payment-pricing";

const utmSchema = z.record(z.string(), z.string().max(300).nullable()).optional().default({});
const GATEWAY_DESC = "Estilo de Artista";

function isValidCpf(raw: string): boolean {
  const c = raw.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(c[i]) * (t + 1 - i);
    const d = ((sum * 10) % 11) % 10;
    if (d !== Number(c[t])) return false;
  }
  return true;
}

const cartItemSchema = z.object({
  variantId: z.string().min(1).max(80),
  qty: z.number().int().min(1).max(20),
});

const customerSchema = z.object({
  /** Compat: painel/tracking ainda usam "plano". */
  plano: z.string().default("cart"),
  items: z.array(cartItemSchema).min(1).max(40),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(160),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(11)),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine(isValidCpf, "CPF inválido"),
  origin: z.string().url(),
  frete: z.enum(["gratis", "padrao", "express"]).default("gratis"),
  endereco: z.string().max(300).optional(),
  address: z
    .object({
      street: z.string().trim().min(1).max(200),
      number: z.string().trim().min(1).max(20),
      complement: z.string().trim().max(200).optional(),
      neighborhood: z.string().trim().min(1).max(120),
      city: z.string().trim().min(1).max(120),
      state: z.string().trim().length(2),
      zipcode: z.string().regex(/^\d{8}$/),
    })
    .optional(),
  bumps: z.array(z.string()).max(20).default([]),
  bump: z.boolean().default(false),
  utm: utmSchema,
});

/** Frete desta loja: grátis por padrão. */
export const FRETES = [
  { id: "gratis", name: "Frete Grátis", eta: "7 a 15 dias úteis", price: 0 },
  { id: "padrao", name: "Frete Padrão", eta: "5 a 10 dias úteis", price: 19.9 },
  { id: "express", name: "Frete Express", eta: "2 a 5 dias úteis", price: 29.9 },
] as const;
export type FreteId = (typeof FRETES)[number]["id"];
export const getFrete = (id: FreteId) => FRETES.find((f) => f.id === id) ?? FRETES[0];

export type PixCharge = { id: string; qrcode: string; amount: number; status: string };

function requestMeta() {
  const h = getRequest()?.headers;
  return {
    ip: h?.get("cf-connecting-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: h?.get("user-agent") ?? null,
  };
}

export const createPixCharge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => customerSchema.parse(d))
  .handler(async ({ data }): Promise<PixCharge> => {
    const priced = await priceCart(data.items);
    const freteOpt = getFrete(data.frete);
    const amount = priced.productsCents + Math.round(freteOpt.price * 100);
    const { ip, ua } = requestMeta();
    const charge = await createPix({
      amount,
      customer: { name: data.name, email: data.email, phone: data.phone, cpf: data.cpf },
      address: data.address,
      description: GATEWAY_DESC,
      origin: data.origin,
      ip,
    });
    const orderData = {
      createdAt: Date.now(),
      id: charge.id,
      amountCents: amount,
      customer: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        cpf: data.cpf,
        endereco: data.endereco?.replace(/\s+/g, " ").trim(),
        ...(data.address ? { address: data.address } : {}),
        qrcode: charge.qrcode,
        frete: { id: freteOpt.id, name: freteOpt.name, price: freteOpt.price },
        bumps: [],
        items: priced.lines.map((l) => ({
          variantId: l.variantId,
          title: l.title,
          qty: l.qty,
          priceCents: l.priceCents,
        })),
        method: "pix" as const,
        discount: priced.discountCents / 100,
        promoLabel: priced.promoApplies ? priced.promoLabel : undefined,
      },
      bundleId: "cart",
      bundleName: priced.orderName,
      utm: data.utm,
      ip,
      ua,
    };
    await saveOrder(orderData);
    await reportPendingToUtmify(orderData);
    return { id: charge.id, qrcode: charge.qrcode, amount, status: charge.status };
  });

export type CardCharge = { id: string; amount: number; status: string; paid: boolean };

/** Liga/desliga do cartão no admin (site_settings.card_enabled). DESLIGADO até ativar no painel. */
async function isCardEnabled(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", "card_enabled")
    .maybeSingle();
  return data?.value === true;
}

/** Com o cartão desligado, quem está logado no admin (mesmo navegador) ainda consegue testar. */
const isAdmin = (pwd?: string) => !!pwd && pwd === process.env["ADMIN_PASSWORD"];

/** Chave PÚBLICA da HyperCash (pode ir para o navegador; a secreta fica só no servidor). */
export const getCardConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ adminPassword: z.string().max(200).optional() })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Liberado aos clientes no admin = cartão para todos + desconto do Pix.
    const publicOn = await isCardEnabled().catch(() => false);
    const enabled = publicOn || isAdmin(data?.adminPassword);
    const publicKey = enabled ? (await getHypercashKeys().catch(() => null))?.public : null;
    return { enabled: enabled && !!publicKey, publicKey: publicKey ?? null, pixDiscount: publicOn };
  });

const cardSchema = customerSchema.extend({
  // Token gerado pelo SDK da HyperCash no navegador. O número do cartão nunca chega aqui.
  cardHash: z.string().min(10).max(4000),
  installments: z.number().int().min(1).max(CARD_MAX_INSTALLMENTS),
  adminPassword: z.string().max(200).optional(),
});

/** Cobra no cartão (HyperCash). Mesmo preço do Pix (promo de pares já aplicada). */
export const createCardCharge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cardSchema.parse(d))
  .handler(async ({ data }): Promise<CardCharge> => {
    if (!isAdmin(data.adminPassword) && !(await isCardEnabled()))
      throw new Error("Pagamento com cartão indisponível. Pague com Pix.");
    if (!data.address) throw new Error("Confira o CEP e o endereço de entrega.");
    const priced = await priceCart(data.items);
    const freteOpt = getFrete(data.frete);
    const freteCents = Math.round(freteOpt.price * 100);
    const amount = priced.productsCents + freteCents;
    const { ip, ua } = requestMeta();
    const a = data.address;
    const address = {
      street: a.street,
      streetNumber: a.number,
      complement: a.complement || "Sem complemento",
      zipCode: a.zipcode,
      neighborhood: a.neighborhood,
      city: a.city,
      state: a.state.toUpperCase(),
      country: "BR" as const,
    };
    const tx = await createCardTransaction({
      amount,
      cardHash: data.cardHash,
      installments: data.installments,
      customer: { name: data.name, email: data.email, phone: data.phone, cpf: data.cpf },
      address,
      shippingFee: freteCents,
      // Uma linha com o total já com promo — evita divergência com o valor cobrado.
      items: [
        {
          title: GATEWAY_DESC,
          unitPrice: priced.productsCents,
          quantity: 1,
        },
      ],
      postbackUrl: `${new URL(data.origin).origin}/api/public/pix-webhook?gw=hc`,
      ip,
    });
    if (["refused", "canceled", "cancelled", "failed"].includes(tx.status)) {
      throw new Error(
        `Pagamento recusado: ${tx.refusedReason ?? "o banco emissor não informou o motivo"}. Confira os dados do cartão ou pague com Pix.`,
      );
    }
    const id = `${CARD_ORDER_PREFIX}${tx.id}`;
    const orderData = {
      createdAt: Date.now(),
      id,
      amountCents: amount,
      customer: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        cpf: data.cpf,
        endereco: data.endereco?.replace(/\s+/g, " ").trim(),
        address: data.address,
        frete: { id: freteOpt.id, name: freteOpt.name, price: freteOpt.price },
        bumps: [],
        items: priced.lines.map((l) => ({
          variantId: l.variantId,
          title: l.title,
          qty: l.qty,
          priceCents: l.priceCents,
        })),
        method: "card" as const,
        installments: data.installments,
        discount: priced.discountCents / 100,
        promoLabel: priced.promoApplies ? priced.promoLabel : undefined,
        ...(tx.card ? { card: tx.card } : {}),
      },
      bundleId: "cart",
      bundleName: priced.orderName,
      utm: data.utm,
      ip,
      ua,
    };
    await saveOrder(orderData);
    const paid = isPaidStatus(tx.status);
    if (!paid) await reportPendingToUtmify(orderData);
    return { id, amount, status: tx.status, paid };
  });

/**
 * Etapa do pós-compra: ofertas (kit e/ou seguro) ou envio expresso, que tem página própria e cobrança
 * separada. Devolve a cobrança já feita nesta etapa, se houver.
 */
async function upsellStep(parentId: string, products: readonly string[]) {
  const express = products.includes("expresso");
  if (express && products.length > 1) throw new Error("Oferta inválida.");
  return { existing: await findUpsellOf(parentId, express) };
}

/**
 * Upsell no MESMO cartão da compra (o token do cartão volta do navegador; nada é guardado no banco).
 * Só roda quando o cliente clica em aceitar a oferta.
 */
export const createCardFollowUpCharge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        parentId: z.string().regex(/^hc_[\w-]{1,64}$/),
        origin: z.string().url(),
        cardHash: z.string().min(10).max(4000),
        // Ofertas marcadas na tela pós-compra (kit extra, seguro de entrega e envio expresso), numa cobrança só.
        products: z
          .array(z.enum(UPSELL_PRODUCTS))
          .min(1)
          .max(UPSELL_PRODUCTS.length)
          .default(["kit"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CardCharge & { refusedReason?: string | null }> => {
    const parent = await getOrder(data.parentId);
    if (
      !parent ||
      parent.customer?.upsellOf ||
      parent.customer?.testOf ||
      parent.customer?.method !== "card"
    )
      throw new Error("Pedido não encontrado.");
    if (!parent.customer.address) throw new Error("Pedido sem endereço.");
    if (!isPaidStatus(parent.status)) {
      const { status } = await fetchGatewayStatus(parent.id);
      if (!isPaidStatus(status)) throw new Error("Pedido ainda não foi pago.");
    }
    // Nunca cobra duas vezes a mesma etapa do upsell para o mesmo pedido.
    const { existing } = await upsellStep(parent.id, data.products);
    if (existing) {
      return {
        id: existing.id,
        amount: existing.amount_cents,
        status: existing.status,
        paid: isPaidStatus(existing.status),
      };
    }

    const bundle = getBundle(parent.bundle_id);
    const sel = upsellSelection(bundle, data.products);
    if (!sel.products.length) throw new Error("Escolha uma oferta.");
    const amount = Math.round(sel.total * 100);
    // Com o kit, parcela como a compra; seguro e/ou expresso, à vista.
    const installments = sel.products.includes("kit") ? (parent.customer.installments ?? 1) : 1;
    const c = parent.customer;
    const a = c.address!;
    const { ip, ua } = requestMeta();
    const tx = await createCardTransaction({
      amount,
      cardHash: data.cardHash,
      installments,
      customer: { name: c.name, email: c.email, phone: c.phone, cpf: c.cpf },
      address: {
        street: a.street,
        streetNumber: a.number,
        complement: a.complement || "Sem complemento",
        zipCode: a.zipcode,
        neighborhood: a.neighborhood,
        city: a.city,
        state: a.state.toUpperCase(),
        country: "BR",
      },
      shippingFee: 0,
      items: sel.items.map((i) => ({
        title: i.title,
        unitPrice: Math.round(i.price * 100),
        quantity: 1,
      })),
      postbackUrl: `${new URL(data.origin).origin}/api/public/pix-webhook?gw=hc`,
      ip,
    });
    const refused = ["refused", "canceled", "cancelled", "failed"].includes(tx.status);
    const id = `${CARD_ORDER_PREFIX}${tx.id}`;
    const orderData = {
      createdAt: Date.now(),
      id,
      amountCents: amount,
      customer: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        cpf: c.cpf,
        endereco: c.endereco,
        address: c.address,
        frete: { id: "junto", name: `Junto com o pedido ${parent.id}`, price: 0 },
        method: "card" as const,
        installments,
        ...(tx.card ? { card: tx.card } : {}),
        upsellOf: parent.id,
        upsellItems: sel.products,
      },
      bundleId: bundle.id,
      bundleName: `Upsell: ${sel.label}`,
      utm: parent.utm ?? undefined,
      ip,
      ua,
      fbp: parent.fbp,
      fbc: parent.fbc,
    };
    if (refused)
      throw new Error(
        `O banco não aprovou a cobrança neste cartão: ${tx.refusedReason ?? "motivo não informado"}.`,
      );
    await saveOrder(orderData);
    const paid = isPaidStatus(tx.status);
    if (!paid) await reportPendingToUtmify(orderData);
    return { id, amount, status: tx.status, paid, refusedReason: tx.refusedReason };
  });

/**
 * Upsell pós-compra no Pix: kit extra (mais 1 kit igual ao do pedido pago, com desconto) e/ou seguro de
 * entrega, num Pix só.
 * Usa os dados já salvos do pedido original — o cliente não digita nada de novo.
 */
export const createUpsellCharge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        parentId: z.string().regex(/^[\w-]{1,64}$/),
        origin: z.string().url(),
        // Ofertas marcadas na tela pós-compra (kit extra, seguro de entrega e envio expresso), numa cobrança só.
        products: z
          .array(z.enum(UPSELL_PRODUCTS))
          .min(1)
          .max(UPSELL_PRODUCTS.length)
          .default(["kit"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PixCharge> => {
    const parent = await getOrder(data.parentId);
    if (!parent || parent.customer?.upsellOf) throw new Error("Pedido não encontrado.");
    if (!isPaidStatus(parent.status)) {
      const { status } = await fetchGatewayStatus(parent.id);
      if (!isPaidStatus(status)) throw new Error("Pedido ainda não foi pago.");
    }

    // Já existe esta etapa do upsell para este pedido: reaproveita em vez de gerar outra cobrança.
    const { existing } = await upsellStep(parent.id, data.products);
    if (existing?.customer.qrcode) {
      return {
        id: existing.id,
        qrcode: existing.customer.qrcode,
        amount: existing.amount_cents,
        status: existing.status,
      };
    }

    const bundle = getBundle(parent.bundle_id);
    const sel = upsellSelection(bundle, data.products);
    if (!sel.products.length) throw new Error("Escolha uma oferta.");
    const amount = Math.round(sel.total * 100);
    const c = parent.customer;
    const { ip, ua } = requestMeta();
    const charge = await createPix({
      amount,
      customer: { name: c.name, email: c.email, phone: c.phone, cpf: c.cpf },
      address: c.address,
      description: GATEWAY_DESC,
      origin: data.origin,
      ip,
    });
    const orderData = {
      createdAt: Date.now(),
      id: charge.id,
      amountCents: amount,
      customer: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        cpf: c.cpf,
        endereco: c.endereco,
        ...(c.address ? { address: c.address } : {}),
        frete: { id: "junto", name: `Junto com o pedido ${parent.id}`, price: 0 },
        upsellOf: parent.id,
        upsellItems: sel.products,
        qrcode: charge.qrcode,
      },
      bundleId: bundle.id,
      bundleName: `Upsell: ${sel.label}`,
      utm: parent.utm ?? undefined,
      ip,
      ua,
      fbp: parent.fbp,
      fbc: parent.fbc,
    };
    await saveOrder(orderData);
    // Pix gerado → UTMify como pendente (não é conversão; só "paid" conta como venda).
    await reportPendingToUtmify(orderData);
    return { id: charge.id, qrcode: charge.qrcode, amount, status: charge.status };
  });

export const getPixStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().regex(/^[\w-]{1,64}$/),
        report: z
          .object({
            name: z.string().max(120),
            email: z.string().max(160),
            phone: z.string().max(20),
            cpf: z.string().max(14),
            bundleId: z.string().max(10),
            bundleName: z.string().max(80),
            createdAt: z.number(),
            utm: utmSchema,
            fbp: z.string().max(200).nullable().optional(),
            fbc: z.string().max(300).nullable().optional(),
            url: z.string().max(1000).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ status: string; paid: boolean }> => {
    const { status, amount } = await fetchGatewayStatus(data.id);
    const paid = isPaidStatus(status);
    // Só pagamento confirmado pelo gateway (servidor) vira conversão — reportado uma única vez.
    if (paid) {
      const h = getRequest()?.headers;
      await reportPaidOnce(data.id, amount, {
        fbp: data.report?.fbp,
        fbc: data.report?.fbc,
        url: data.report?.url,
        ip: h?.get("cf-connecting-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        ua: h?.get("user-agent") ?? null,
      });
    }
    return { status, paid };
  });
