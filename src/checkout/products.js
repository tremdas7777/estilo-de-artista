import adminApi from '../shopify/adminApi.js';
import { listCatalog, catalogCount } from '../db.js';

// Cache curto em memória do catálogo. A FONTE agora é o banco local (import do
// CSV); a Shopify virou só reserva pra quando o catálogo local estiver vazio.
let cache = { at: 0, products: [], byVariant: new Map(), source: 'local' };
const TTL_MS = 60 * 1000;

function toCents(priceStr) {
  return Math.round(parseFloat(priceStr || '0') * 100);
}

function mapProduct(p) {
  const image = p.image?.src || p.images?.[0]?.src || '';
  const variants = (p.variants || []).map((v) => ({
    id: String(v.id),
    productId: String(p.id),
    productTitle: p.title,
    handle: p.handle,
    title: v.title === 'Default Title' ? p.title : `${p.title} — ${v.title}`,
    option: v.title,
    priceCents: toCents(v.price),
    available: v.inventory_management == null || v.inventory_quantity > 0 || v.inventory_policy === 'continue',
    image,
  }));
  return { id: String(p.id), title: p.title, handle: p.handle, image, variants };
}

// Capa escolhida à mão, por handle. Índice 1-BASED, na ordem em que as fotos
// vêm do CSV.
//
// Por que existe: a primeira foto do produto é a que o fornecedor pôs primeiro,
// e muitas vezes é a pior para uma fileira — pé calçado, caixa aberta, mão na
// frente do tênis. Quando o produto tem outra foto melhor, é aqui que se troca
// a que abre o card, sem mexer no CSV nem no banco.
//
// O que NÃO dá para resolver aqui: 634 dos 1.889 produtos têm UMA foto só, e
// as demais são fotos de revendedor (mão, caixa, chão de madeira, asfalto),
// não fotos de estúdio. Dá para escolher a menos ruim, não para uniformizar.
// Espelhar para alinhar o sentido do tênis foi descartado: quase toda foto
// mostra a etiqueta VANS ou a caixa, e o texto sairia invertido.
//
// Revisado olhando foto a foto — ver a seção "Capa do produto" no LEIA-ME.
export const CAPAS = {
  // Vans Knu Skool — revisada em 28/08/2026 (12 produtos, 28 fotos)
  'vans-knu-skool-black-white': 4,  // era mão segurando; a 4 é perfil limpo, bico à esquerda
  'vans-knu-skool-bege': 2,         // era pé calçado; a 2 mostra o par, sem gente
  'vans-knu-skool-bordo': 2,        // era pé calçado com caixas; a 2 mostra o par
};

// Troca a capa e põe a escolhida em PRIMEIRO na galeria — senão a página do
// produto abriria numa foto diferente do card em que a pessoa clicou.
// Índice que não existe mais (foto removida do CSV) é ignorado.
function comCapa(p) {
  const i = CAPAS[p.handle];
  if (!i) return p;
  const foto = (p.images || [])[i - 1];
  if (!foto || foto === p.image) return p;
  return { ...p, image: foto, images: [foto, ...(p.images || []).filter((u) => u !== foto)] };
}

function indexed(lista, source) {
  const products = lista.map(comCapa);
  const byVariant = new Map();
  for (const p of products) for (const v of p.variants) byVariant.set(v.id, v);
  return { at: Date.now(), products, byVariant, source };
}

export async function loadCatalog(force = false) {
  if (!force && Date.now() - cache.at < TTL_MS && cache.products.length) return cache;

  // 1) catálogo próprio (import do CSV) — não depende de rede nem da Shopify
  if ((await catalogCount()).products > 0) {
    cache = indexed(await listCatalog(), 'local');
    return cache;
  }

  // 2) reserva: Shopify, pra não deixar a loja sem produto se o import não rodou
  const raw = await adminApi.fetchActiveProducts();
  cache = indexed(raw.map(mapProduct), 'shopify');
  return cache;
}

// Usado pelo /admin pra mostrar de onde vêm os produtos. Devolve promessa
// porque a contagem sai do banco — quem chamar precisa de `await`.
export async function catalogSource() {
  return (await catalogCount()).products > 0 ? 'local' : 'shopify';
}

export async function getProducts() {
  return (await loadCatalog()).products;
}

// Shape enxuto pro front. O catálogo cheio tem descrição em HTML e a lista
// completa de imagens — 6,7 MB no fio pra uma grade que só precisa de
// título, foto de capa e numerações.
export function publicProduct(p) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    image: p.image,
    tags: p.tags || [],
    variants: (p.variants || []).map((v) => ({
      id: v.id, option: v.option, sku: v.sku || '', priceCents: v.priceCents,
      compareCents: v.compareCents || null, available: v.available,
    })),
  };
}

// Tira da descrição a tabela de medidas que vinha cravada nela.
//
// 1.842 produtos têm um <img> da tabela dentro do body_html — e em 1.841 deles
// a descrição é SÓ isso, nada de texto. A imagem veio assim do CSV de origem
// (data-import/products_export.csv), apontando para a arte antiga.
//
// Desde 29/08/2026 a página do produto desenha a tabela sozinha, do arquivo em
// TABELA_MEDIDAS, para TODO calçado — inclusive os 16 chinelos que nunca
// tiveram a imagem na descrição. Deixar a cópia velha no texto poria DUAS
// tabelas na mesma página, e elas não batem: a antiga vai do 34 ao 44, a nova
// do 34 ao 45, e os centímetros divergem em quase toda numeração.
//
// Some na SAÍDA, e não no banco, por dois motivos: o catálogo de produção mora
// num disco que não é re-semeado (mexer nele exigiria uma migração de 1.842
// linhas rodando no boot), e um reimport do CSV traria a imagem de volta de
// qualquer jeito. Aqui vale para os dois casos, sem migração e sem repetir.
export function semTabelaDeMedidas(html) {
  return String(html || '')
    // o caso dos 1.842: um <p> que embrulha só a imagem da tabela
    .replace(/<p>\s*<img[^>]*tabela-medidas[^>]*>\s*<\/p>/gi, '')
    // a mesma imagem solta, sem o parágrafo em volta
    .replace(/<img[^>]*tabela-medidas[^>]*>/gi, '')
    .trim();
}

// As fotos vêm do CDN da Shopify em 1024px. Um card de vitrine mostra ~200px,
// então pedir o tamanho certo corta a maior parte do peso da página. O CDN
// aceita &width= e devolve a imagem redimensionada e em cache.
export function imagemNaLargura(url, largura) {
  const u = String(url || '');
  if (!u || !u.includes('cdn.shopify.com')) return u;
  return u + (u.includes('?') ? '&' : '?') + `width=${largura}`;
}

// Shape do CARD: a vitrine e a grade só desenham foto, título e preço. Mandar
// as 11 numerações de cada produto engordava a home em ~5x sem necessidade —
// a escolha de tamanho acontece só na página do produto.
export function cardProduct(p, largura = 400) {
  const vs = p.variants || [];
  const v = vs.find((x) => x.available) || vs[0] || null;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    image: imagemNaLargura(p.image, largura),
    variants: v ? [{
      id: v.id, option: v.option, priceCents: v.priceCents,
      compareCents: v.compareCents || null, available: v.available,
    }] : [],
  };
}

export async function getProductsLight() {
  return (await loadCatalog()).products.map(publicProduct);
}

// Produtos escolhidos a dedo, na ordem em que foram pedidos (vitrine curada).
// Handle que não existe mais no catálogo é ignorado, em vez de furar a vitrine.
export async function getProductsByHandles(handles) {
  const { products } = await loadCatalog();
  const mapa = new Map(products.map((p) => [p.handle, p]));
  return (handles || []).map((h) => mapa.get(String(h))).filter(Boolean);
}

// Produto completo (com descrição e galeria) — só a página de produto usa.
export async function getProductByHandle(handle) {
  const h = String(handle || '');
  return (await loadCatalog()).products.find((p) => p.handle === h) || null;
}

// Resolve variante pela FONTE do catálogo (nunca confia no preço do front).
// Local: o preço sai do banco. Shopify (reserva): busca direto na API.
export async function resolveVariant(variantId) {
  const id = String(variantId);
  if (cache.byVariant.has(id)) return cache.byVariant.get(id);

  if ((await catalogCount()).products > 0) {
    // Só recarrega se o cache estiver frio/vencido. Com cache quente, id
    // desconhecido é id inexistente — não vale reler 1.135 produtos por
    // chute do front (viraria vetor de carga).
    if (!cache.products.length || Date.now() - cache.at >= TTL_MS) {
      return (await loadCatalog(true)).byVariant.get(id) || null;
    }
    return null;
  }

  const v = await adminApi.fetchVariant(id).catch(() => null);
  if (!v) return null;
  // busca o produto pra ter TÍTULO e IMAGEM (a rota de variante não traz)
  const p = await adminApi.fetchProduct(v.product_id).catch(() => null);
  let productTitle = (p && p.title) || '';
  let image = '';
  if (p) {
    const vImg = (p.images || []).find((im) => im.id === v.image_id);
    image = (vImg && vImg.src) || p.image?.src || p.images?.[0]?.src || '';
  }
  const optTitle = v.title && v.title !== 'Default Title'
    ? `${productTitle} — ${v.title}`.trim()
    : (productTitle || v.title);
  return {
    id: String(v.id),
    productId: String(v.product_id),
    productTitle: productTitle || v.title,
    handle: (p && p.handle) || '',
    title: optTitle,
    option: v.title,
    priceCents: toCents(v.price),
    available: true,
    image,
  };
}

export default { loadCatalog, getProducts, resolveVariant };
