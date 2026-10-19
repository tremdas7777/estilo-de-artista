/** Espelho de src/checkout/promo.js da loja na Vercel — mesma conta do PIX. */

export const PROMO = {
  eligiblePriceCents: 9900,
  minQty: 2,
  num: 4900,
  den: 19800,
  label: "PROMO 2 PARES",
  handles: [] as string[],
  code: "PROMO2PARES",
} as const;

export interface PromoItem {
  priceCents: number;
  qty: number;
  handle?: string;
}

export function itemElegivel(it: PromoItem, promo = PROMO): boolean {
  if (it.priceCents !== promo.eligiblePriceCents) return false;
  const lista = promo.handles || [];
  if (!lista.length) return true;
  const h = String(it.handle || "").toLowerCase();
  if (!h) return false;
  return lista.some((p) => h.includes(p));
}

export function computeDiscount(items: PromoItem[]) {
  const { minQty, num, den, label } = PROMO;
  let eligibleQty = 0;
  let eligibleCents = 0;
  for (const it of items) {
    if (itemElegivel(it)) {
      eligibleQty += it.qty;
      eligibleCents += it.priceCents * it.qty;
    }
  }
  if (eligibleQty < minQty || eligibleCents <= 0) {
    return { discountCents: 0, applies: false, label };
  }
  const discountCents = Math.round((eligibleCents * num) / den);
  return { discountCents, applies: true, label };
}

/** Valores de vitrine: 1 par, 2 pares, economia. */
export function precoPromo() {
  const unit = PROMO.eligiblePriceCents;
  const cheio = unit * PROMO.minQty;
  const economia = Math.round((cheio * PROMO.num) / PROMO.den);
  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return {
    unitCents: unit,
    duplaCents: cheio - economia,
    economiaCents: economia,
    minQty: PROMO.minQty,
    unit: brl(unit),
    dupla: brl(cheio - economia),
    economia: brl(economia),
  };
}

export function money(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
