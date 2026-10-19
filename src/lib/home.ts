import home from "@/data/home.json";
import { brl, PRECO_DUPLA, PRECO_PAR } from "@/lib/produtos";

export interface HomeVariant {
  id: string;
  option: string;
  priceCents: number;
  compareCents?: number | null;
  available: boolean;
}

export interface HomeProduct {
  id: string;
  title: string;
  handle: string;
  image: string;
  variants: HomeVariant[];
}

export interface HomeSection {
  title: string;
  handle: string;
  total: number;
  products: HomeProduct[];
}

export interface HomeMenuItem {
  title: string;
  handle: string;
  tag: string;
  count: number;
  children: HomeMenuItem[];
}

export interface HomeDestaque {
  title: string;
  subtitle?: string;
  botao?: string;
  href?: string;
  products: HomeProduct[];
}

export interface HomeData {
  menu: HomeMenuItem[];
  destaque: HomeDestaque | null;
  sections: HomeSection[];
}

export const HOME = home as HomeData;

export const LOJA_NOME = "Estilo de Artista";
export const HERO_HANDLE = "tesla-coil-pro-preto-refletivo";
export const HERO_TITULO = "Tesla Coil Pro Preto Refletivo";

export function money(cents: number): string {
  return `R$ ${brl(cents)}`;
}

export function precoPar(): string {
  return brl(PRECO_PAR);
}

export function precoDupla(): string {
  return brl(PRECO_DUPLA);
}

/** Desconto % a partir do compareCents da 1ª variante. */
export function offPercent(p: HomeProduct): number | null {
  const first = p.variants?.find((v) => v.available) || p.variants?.[0];
  if (!first?.compareCents || first.compareCents <= first.priceCents) return null;
  return Math.round((1 - first.priceCents / first.compareCents) * 100);
}

export function firstPrice(p: HomeProduct): HomeVariant | null {
  return p.variants?.find((v) => v.available) || p.variants?.[0] || null;
}
