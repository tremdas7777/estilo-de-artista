/** Stub compatível com o painel/upsell herdados do glycomg7.
 *  Nesta loja o preço real vem do carrinho + promo (ver lib/promo.ts). */

export type BundleId = "cart" | "30" | "60" | "90";

export const SENSOR_DAYS = 0;
export const SENSORS_PER_MONTH = 0;
export const FREE_SHIPPING_MIN = 0;
export const FREE_SHIPPING_LABEL = "Frete grátis para todo o Brasil";

export const isFreeShippingEligible = (_subtotal: number) => true;

export const bundleShippingLabel = (_b: { price: number }) => FREE_SHIPPING_LABEL;

export type Bundle = {
  id: BundleId;
  name: string;
  months: number;
  sensors: number;
  monitoringDays: number;
  price: number;
};

const CART_BUNDLE: Bundle = {
  id: "cart",
  name: "Pedido Estilo de Artista",
  months: 0,
  sensors: 0,
  monitoringDays: 0,
  price: 0,
};

export function parseBundleId(raw: string | undefined | null): BundleId | null {
  if (!raw) return null;
  if (raw === "cart" || raw === "30" || raw === "60" || raw === "90") return raw;
  return "cart";
}

export function getBundle(_id?: string | null): Bundle {
  return CART_BUNDLE;
}

export const BUNDLES: Bundle[] = [CART_BUNDLE];
