import { createServerFn } from "@tanstack/react-start";

/** Loja oficial (catálogo, combo, PIX). */
export const LOJA_API =
  (typeof process !== "undefined" && process.env.LOJA_API_URL) ||
  "https://estilo-de-artista.vercel.app";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${LOJA_API}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status} ${err.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

export interface ApiVariant {
  id: string;
  option: string;
  sku?: string;
  priceCents: number;
  compareCents?: number | null;
  available: boolean;
}

export interface ApiProduct {
  id: string;
  title: string;
  handle: string;
  image: string;
  images: string[];
  tags: string[];
  variants: ApiVariant[];
  bodyHtml?: string;
  vendor?: string;
}

export interface ApiCor {
  handle: string;
  title: string;
  cor: string;
  thumb: string;
  image: string;
  atual: boolean;
  elegivel: boolean;
}

export interface ApiProdutoResposta {
  product: ApiProduct;
  cores: { modelo: string; key: string; cores: ApiCor[] } | null;
  related: Array<{
    id: string;
    title: string;
    handle: string;
    image: string;
    variants: ApiVariant[];
  }>;
  giro?: { primeiro: string; frames?: string[] } | null;
}

export interface ApiVariantDetalhe {
  id: string;
  priceCents: number;
  title: string;
  image: string;
  productId: string;
  handle?: string;
  modelo?: string;
  cor?: string;
  available?: boolean;
}

export const getProduto = createServerFn({ method: "GET" })
  .validator((handle: string) => handle)
  .handler(async ({ data: handle }) => {
    return apiGet<ApiProdutoResposta>(`/api/produto/${encodeURIComponent(handle)}`);
  });

export const getColecao = createServerFn({ method: "GET" })
  .validator((data: { handle: string; limit?: number; offset?: number; sort?: string }) => data)
  .handler(async ({ data }) => {
    const q = new URLSearchParams();
    if (data.limit) q.set("limit", String(data.limit));
    if (data.offset) q.set("offset", String(data.offset));
    if (data.sort) q.set("sort", data.sort);
    const qs = q.toString();
    return apiGet<{
      title: string;
      handle: string;
      total: number;
      products: Array<{
        id: string;
        title: string;
        handle: string;
        image: string;
        variants: ApiVariant[];
      }>;
    }>(`/api/colecao/${encodeURIComponent(data.handle)}${qs ? `?${qs}` : ""}`);
  });

export const getVariants = createServerFn({ method: "GET" })
  .validator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    if (!data.ids.length) return [] as ApiVariantDetalhe[];
    const qs = new URLSearchParams({
      ids: data.ids.join(","),
      det: "1",
    });
    return apiGet<ApiVariantDetalhe[]>(`/api/variants?${qs}`);
  });

export const getCombo = createServerFn({ method: "GET" }).handler(async () => {
  return apiGet<{
    promo: {
      minQty: number;
      unitCents: number;
      cheioCents: number;
      economiaCents: number;
      totalCents: number;
      label: string;
      applies: boolean;
      freteGratis: boolean;
    };
    marcas: Array<{ nome: string; count: number }>;
    modelos: Array<{
      key: string;
      title: string;
      marca: string;
      cores: number;
      image: string;
      priceCents: number;
      compareCents?: number;
    }>;
  }>("/api/combo");
});

export const getComboModelo = createServerFn({ method: "GET" })
  .validator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    return apiGet<{
      key: string;
      title: string;
      cores: Array<{
        handle: string;
        title: string;
        cor: string;
        image: string;
        thumb: string;
        variants: ApiVariant[];
      }>;
    }>(`/api/combo/modelo/${encodeURIComponent(data.key)}`);
  });

export const criarPedido = createServerFn({ method: "POST" })
  .validator(
    (data: {
      items: Array<{ variantId: string; qty: number }>;
      customer: Record<string, string>;
      shippingId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const res = await fetch(`${LOJA_API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        items: data.items,
        customer: data.customer,
        shippingId: data.shippingId || "gratis",
      }),
    });
    const json = (await res.json()) as {
      orderId?: string;
      totalCents?: number;
      pix?: string;
      qrDataUrl?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Não foi possível gerar o PIX.");
    return json;
  });
