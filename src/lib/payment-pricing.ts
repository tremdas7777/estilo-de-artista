/**
 * Preço do checkout Estilo de Artista.
 * O desconto de 2 pares é calculado em lib/promo.ts (não o 10% Pix do glycomg7).
 */
export const PIX_DISCOUNT = 0;
export const CARD_MAX_INSTALLMENTS = 12;

export type PayMethod = "pix" | "card";

/** Valores em centavos. `products` já vem com a promo de pares aplicada. */
export function checkoutTotals(o: {
  products: number;
  frete: number;
  method: PayMethod;
  pixDiscount: boolean;
}) {
  const products = Math.round(o.products * 100);
  const frete = Math.round(o.frete * 100);
  const discount =
    o.method === "pix" && o.pixDiscount ? Math.round(products * PIX_DISCOUNT) : 0;
  return { products, frete, discount, total: products - discount + frete };
}
