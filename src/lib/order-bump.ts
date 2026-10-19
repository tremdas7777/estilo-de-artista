/** Order bumps desligados — a oferta forte é a promo 2 pares. */
export const BUMP_IDS = [] as const;
export type BumpId = string;

export type OrderBumpItem = {
  id: string;
  name: string;
  fullName: string;
  gatewayName: string;
  price: number;
  compareAt?: number;
  img: string;
};

export const ORDER_BUMPS: readonly OrderBumpItem[] = [];

export const getBumps = (_ids: readonly string[]) => [] as OrderBumpItem[];
export const bumpsTotal = (_ids: readonly string[]) => 0;
