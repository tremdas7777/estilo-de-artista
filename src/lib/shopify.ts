export const SHOPIFY_EXTERNAL_CHECKOUT_URL = "https://seguro.aidexbrasil.com/api/public/shopify";
export const SHOPIFY_EXTERNAL_STORE_ID = "1230";

export function buildShopifyCheckoutUrl(productId: string): string {
  const url = new URL(SHOPIFY_EXTERNAL_CHECKOUT_URL);
  url.searchParams.set("product", productId);
  url.searchParams.set("store", SHOPIFY_EXTERNAL_STORE_ID);
  return url.toString();
}
