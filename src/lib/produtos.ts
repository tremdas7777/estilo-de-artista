import raw from "@/data/produtos.json";

/** Produto do catálogo da loja (fonte: products_export.csv da Shopify). */
export interface Produto {
  handle: string;
  title: string;
  brand: string;
  type: string;
  /** Preço em centavos (o Tênis vale o preço do par definido pela promo da loja). */
  price: number;
  /** Preço "de" riscado, em centavos. null = sem desconto. */
  compare: number | null;
  img: string;
  sizeName: string | null;
  sizes: string[];
}

export const PRODUTOS: Produto[] = raw as Produto[];

export const porHandle = new Map(PRODUTOS.map((p) => [p.handle, p]));

export const TIPOS = ["Tênis", "Chinelo", "Camisa", "Blusa", "Calça", "Acessórios"];

/** Marcas com mais produtos primeiro — as fichas do catálogo da home. */
export function marcasComQtde(): { nome: string; qtde: number }[] {
  const contagem = new Map<string, number>();
  for (const p of PRODUTOS) {
    if (!p.brand) continue;
    contagem.set(p.brand, (contagem.get(p.brand) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([nome, qtde]) => ({ nome, qtde }))
    .sort((a, b) => b.qtde - a.qtde);
}

/** Contato da loja — número que já vinha configurado no checkout original. */
export const WHATSAPP = "5547997229918";
export const INSTAGRAM = "https://www.instagram.com/estilo_de_artista_/";
export const EMAIL = "suporte@exemplo.com.br";

/** 1 par R$ 99,00 (CATALOGO_PRECO_CENTS do checkout) e 2 pares R$ 149,00
 *  (desconto 19800 × 4900/19800 = R$ 49,00). Mesma conta da promo original. */
export const PRECO_PAR = 9900;
export const PRECO_DUPLA = 14900;

export const brl = (centavos: number): string =>
  (centavos / 100).toFixed(2).replace(".", ",");

export function linkWhats(texto: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

/** Busca sem acento: "camisa" acha "CamisA", "tenis" acha "Tênis". */
export function semAcento(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
