import { LOJA_API, type ApiVariantDetalhe } from "@/lib/api";
import { computeDiscount, PROMO } from "@/lib/promo";

export type CartItemIn = { variantId: string; qty: number };

export type PricedLine = {
  variantId: string;
  qty: number;
  title: string;
  image: string;
  handle: string;
  priceCents: number;
  lineCents: number;
};

export type CartPricing = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  productsCents: number;
  promoApplies: boolean;
  promoLabel: string;
  orderName: string;
};

async function fetchVariants(ids: string[]): Promise<ApiVariantDetalhe[]> {
  if (!ids.length) return [];
  const qs = new URLSearchParams({ ids: ids.join(","), det: "1" });
  const res = await fetch(`${LOJA_API}/api/variants?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Não foi possível validar os itens do carrinho.");
  const json = (await res.json()) as { variants?: ApiVariantDetalhe[] } | ApiVariantDetalhe[];
  if (Array.isArray(json)) return json;
  return json.variants ?? [];
}

/** Preço do pedido no servidor (catálogo oficial + promo 2 pares). */
export async function priceCart(items: CartItemIn[]): Promise<CartPricing> {
  const qtyById = new Map<string, number>();
  for (const it of items) {
    if (!it.variantId || it.qty < 1) continue;
    qtyById.set(it.variantId, (qtyById.get(it.variantId) || 0) + Math.min(20, Math.floor(it.qty)));
  }
  const ids = [...qtyById.keys()];
  if (!ids.length) throw new Error("Carrinho vazio.");

  const details = await fetchVariants(ids);
  const byId = new Map(details.map((d) => [d.id, d]));

  const lines: PricedLine[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (!d) throw new Error("Um dos itens do carrinho não está mais disponível.");
    if (d.available === false) throw new Error(`"${d.title}" está indisponível.`);
    const qty = qtyById.get(id)!;
    lines.push({
      variantId: id,
      qty,
      title: d.title,
      image: d.image,
      handle: d.handle || "",
      priceCents: d.priceCents,
      lineCents: d.priceCents * qty,
    });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0);
  const { discountCents, applies, label } = computeDiscount(
    lines.map((l) => ({ priceCents: l.priceCents, qty: l.qty, handle: l.handle })),
  );
  const productsCents = Math.max(0, subtotalCents - discountCents);
  if (productsCents < 100) throw new Error("Valor mínimo do pedido não atingido.");

  const orderName =
    lines.length === 1
      ? `${lines[0]!.title} × ${lines[0]!.qty}`
      : `Pedido Estilo de Artista (${lines.reduce((s, l) => s + l.qty, 0)} itens)`;

  return {
    lines,
    subtotalCents,
    discountCents,
    productsCents,
    promoApplies: applies,
    promoLabel: applies ? label : PROMO.label,
    orderName,
  };
}
