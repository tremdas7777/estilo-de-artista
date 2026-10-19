// Coleções e menu — reproduz a navegação que existia na Shopify.
// Lá as coleções eram automáticas por TAG (ver COLECOES.md); aqui é a mesma
// regra, só que resolvida no banco local em vez da Admin API.
import { loadCatalog } from './products.js';
import { handlesMaisVendidos, TITULO as TITULO_MV, SUBTITULO as SUBTITULO_MV } from './maisVendidos.js';

export const slugTag = (t) => String(t || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Coleções combinadas: um item de menu que junta várias tags.
//
// VAZIO nesta loja. A A Fonte (de onde o código veio) tinha 'air-max-tn',
// juntando Air Max + TN + Air Max TN porque o catálogo da Nation etiquetava os
// pares desse jeito. Aqui todo TN da Drip já leva a tag 'Air Max TN' (ver
// captura-drip/gerar-extras.mjs) e a tag resolve sozinha — e um combo com o
// mesmo handle ganharia da tag e arrastaria os Air Max 95 para dentro do TN.
export const COMBOS = {};

// Coleções CURADAS: não saem de tag nenhuma, são uma lista de handles escolhida
// a dedo ou calculada. É o que sustenta o "Mais Vendidos" — a vitrine da home e
// a página /colecao/mais-vendidos lêem daqui, então mexer numa muda as duas.
//
// `handles` é um GETTER de propósito: o Mais Vendidos deixou de ser lista fixa
// e passou a sair do ranking de pedidos pagos (ver maisVendidos.js), então a
// lista precisa ser calculada na hora da leitura, não congelada no boot. Quem
// consome isto com espalhamento (`{ ...CURADAS[x] }`) tira um retrato daquele
// instante — é o comportamento certo, mas vale saber que é um retrato.
export const CURADAS = {
  'mais-vendidos': {
    title: TITULO_MV,
    subtitle: SUBTITULO_MV,
    get handles() { return handlesMaisVendidos(); },
  },
};
const noCombo = (p, combo) => (p.tags || []).some((t) => combo.tags.includes(t));

// Árvore do menu (3 níveis, igual ao tema). Nó sem produto some sozinho —
// assim o menu nunca mostra uma coleção vazia quando o catálogo muda.
//
// Primeiro nível em ordem alfabética (regra que veio da A Fonte): quem chega
// procurando uma marca acha pelo nome, não pela posição. Os submenus NÃO
// seguem a regra — lá a ordem é a da linha (New Balance 480, 550, 9060...).
//
// É o menu da A Fonte sem o que era só da Nation (Asics, Mizuno, Juliet, Shox,
// Vapormax) e com o que a Drip vende e a A Fonte não trazia dela: Air Max 95,
// NB 9060 e Numeric, camisas de seleção e acessórios.
const MENU_SPEC = [
  // Meias e impermeabilizante: Type 'Acessórios', preço da própria origem.
  { tag: 'Acessórios' },
  { tag: 'Adidas', children: [
    { tag: 'Adidas Forum' }, { tag: 'Adidas Campus' },
    { tag: 'Adidas Grand Court' }, { tag: 'Adidas Adi2000' },
  ] },
  // Jaqueta, moletom, suéter e conjunto. Nível único: são 21 peças e um
  // submenu por feitio deixaria coleções de duas ou três.
  { tag: 'Blusas' },
  { tag: 'Calças' },
  // Camisas de seleção 2026 (torcedor, jogador e feminina). Nível único: são
  // 13, e um submenu por país deixaria coleções de uma peça só.
  { tag: 'Camisas' },
  // Hocks (7) e slides Nike Mind (9). Os slides aparecem também sob Nike: o
  // menu é caminho, não classificação.
  { tag: 'Chinelos' },
  { tag: 'DC Shoes', children: [
    { tag: 'DC Manteca' }, { tag: 'DC Lynx' }, { tag: 'DC Anvil' },
    { tag: 'DC Court Graffik' }, { tag: 'DC Kalis' }, { tag: 'DC Versatile' },
    { tag: 'DC Construct' }, { tag: 'DC Kalynx' }, { tag: 'DC Metric' },
  ] },
  { tag: 'Hocks', children: [
    { tag: 'Hocks Puff' }, { tag: 'Hocks Flat' }, { tag: 'Hocks Bold' },
    { tag: 'Hocks Pop Lite' }, { tag: 'Hocks RLX Baggy' }, { tag: 'Hocks 4MIGA' },
  ] },
  { tag: 'Louis Vuitton', children: [{ tag: 'LV Trainer' }, { tag: 'LV Skate' }] },
  { tag: 'Mad Rats' },
  { tag: 'New Balance', children: [
    { tag: 'New Balance 480' }, { tag: 'New Balance 550' },
    { tag: 'New Balance 9060' }, { tag: 'New Balance Numeric' },
  ] },
  // 'Air Max TN Plus' existe como tag (o Kiss My Airs 2.0) mas fica fora do
  // submenu: seria uma coleção de um par só. Ele continua dentro de Air Max TN.
  { tag: 'Nike', children: [
    { tag: 'Air Max TN', children: [{ tag: 'Air Max TN Plus 3' }, { tag: 'Air Max TN Drift' }] },
    { tag: 'Air Max 95' },
    { tag: 'Nike Mind' },
  ] },
  { tag: 'Öus', children: [
    { tag: 'Öus Imigrante' }, { tag: 'Öus Dots' }, { tag: 'Öus Söusa' },
    { tag: 'Öus 2K' }, { tag: 'Öus Fluente' }, { tag: 'Öus Arquitetônico' },
  ] },
  { tag: 'Paper Jab' },
  { tag: 'Puma', children: [
    { tag: 'Puma CA Pro' }, { tag: 'Puma Caven' }, { tag: 'Puma Park' },
    { tag: 'Puma Suede' }, { tag: 'Puma 180' },
  ] },
  { tag: 'Qix', children: [
    { tag: 'Qix Chorão' }, { tag: 'Qix 90s' }, { tag: 'Qix AM' },
    { tag: 'Qix Combat' }, { tag: 'Qix Square' },
  ] },
  { tag: 'Stickers' },
  { tag: 'Tesla', children: [
    { tag: 'Tesla Lokal' }, { tag: 'Tesla Coil' }, { tag: 'Tesla Hertz' },
    { tag: 'Tesla Nine' }, { tag: 'Tesla Fusion' }, { tag: 'Tesla Shine' },
    { tag: 'Tesla TG' }, { tag: 'Tesla Pulse' },
  ] },
  { tag: 'Vans', children: [
    { tag: 'Vans Knu Skool' }, { tag: 'Vans Ultrarange' }, { tag: 'Vans Old Skool' },
    { tag: 'Vans SK8' }, { tag: 'Vans Crosspath' },
  ] },
];

// Conta produtos por tag uma vez e reaproveita (o catálogo já vem cacheado).
// `filtro` restringe o universo contado — é o que deixa a oferta pós-compra
// montar o mesmo menu só com o que ela pode vender.
async function tagCounts(filtro = null) {
  const { products: todos } = await loadCatalog();
  const products = filtro ? todos.filter(filtro) : todos;
  const counts = new Map();
  for (const p of products) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return { counts, products };
}

// Nó sem produto some sozinho, então passar um `filtro` já poda o menu inteiro:
// coleção que ficou sem nenhum produto elegível não é devolvida.
export async function getMenu({ filtro = null } = {}) {
  const { counts, products } = await tagCounts(filtro);
  const build = (nodes) => nodes.map((n) => {
    const children = n.children ? build(n.children) : [];
    if (n.combo) {
      const c = COMBOS[n.combo];
      const count = products.filter((p) => noCombo(p, c)).length;
      if (!count && !children.length) return null;
      return { title: n.title || c.title, handle: n.combo, tag: null, count, children };
    }
    const count = counts.get(n.tag) || 0;
    if (!count && !children.length) return null;
    return { title: n.tag, handle: slugTag(n.tag), tag: n.tag, count, children };
  }).filter(Boolean);
  return build(MENU_SPEC);
}

// Todas as coleções que existem de fato (uma por tag com produto).
export async function getCollections() {
  const { counts } = await tagCounts();
  return [...counts.entries()]
    .map(([tag, count]) => ({ title: tag, handle: slugTag(tag), tag, count }))
    .sort((a, b) => b.count - a.count);
}

// Preço da primeira variante — é por ele que "menor/maior preço" ordena.
const precoDe = (p) => (p.variants && p.variants[0] ? p.variants[0].priceCents : 0);

export const SORTS = {
  destaque: null, // ordem do catálogo (posição do import)
  'az': (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
  'za': (a, b) => b.title.localeCompare(a.title, 'pt-BR'),
  'preco-asc': (a, b) => precoDe(a) - precoDe(b),
  'preco-desc': (a, b) => precoDe(b) - precoDe(a),
};

// Um título como "Nike AirMax TN Plus Preto e Branco" só descreve a cor; já
// "Nike TN Dracula" ou "TN Plus 3 Barcelona" carrega um nome de edição, que é
// o que puxa o olho na vitrine. A regra: se sobrar alguma palavra que não seja
// marca, modelo, cor ou ligação, o produto tem nome próprio.
const PALAVRAS_COMUNS = new Set([
  // marca e modelo
  'nike', 'airmax', 'air', 'max', 'tn', 'plus', 'dn', 'dn8', 'shox', 'r4', 'nz',
  'vapormax', 'mizuno', 'prophecy', 'terrascape', 'balance', 'new', 'asics',
  'louis', 'vuitton', 'lv', 'trainer', 'skate', 'molas', 'more', 'uptempo', 'one',
  // qualificadores de linha
  'novo', 'nova', 'nacional', 'importado', 'importada', 'intermediario',
  'intermediaria', 'premium', 'vietna', 'edicao', 'limitada', 'solado', 'tunied',
  'refletivo', 'fosco', 'linha', 'modelo', 'unissex', 'masculino', 'feminino',
  // cores e acabamentos
  'preto', 'preta', 'pretos', 'branco', 'branca', 'brancos', 'brancas', 'cinza',
  'azul', 'verde', 'vermelho', 'vermelha', 'rosa', 'amarelo', 'amarela', 'roxo',
  'roxa', 'laranja', 'marrom', 'marron', 'bege', 'creme', 'gelo', 'grafite',
  'chumbo', 'prata', 'prateado', 'prateada', 'dourado', 'dourada', 'vinho',
  'lilas', 'lavanda', 'turquesa', 'marinho', 'royal', 'militar', 'musgo',
  'oliva', 'olive', 'petroleo', 'salmao', 'coral', 'nude', 'limao', 'menta',
  'agua', 'aqua', 'teal', 'berry', 'pink', 'purple', 'white', 'black', 'green',
  'blue', 'red', 'grey', 'gray', 'camo', 'camuflado', 'holografico', 'holografica',
  'colorido', 'colorida', 'multicor', 'multicolorido', 'mesclado', 'mesclada',
  'degrade', 'neon', 'claro', 'clara', 'escuro', 'escura', 'total', 'triple',
  'estampa', 'estampado', 'grafismo', 'listras', 'respingos', 'detalhe',
  'detalhes', 'cores', 'cor', 'bebe', 'off', 'monograma', 'mostarda', 'terracota',
  'caramelo', 'chocolate', 'ferrugem', 'pastel', 'metalico', 'metalica',
  // ligações e sobras de frase
  'c', 'e', 'com', 'de', 'do', 'da', 'em', 'no', 'na', 'ao', 'a', 'o', 'os', 'as',
  'duas', 'dois', 'cara', 'caras',
  // grafias da Drip: "NK"/"NB" são a marca abreviada, "Ballance" é erro de
  // digitação, e Drift é modelo — nenhuma delas é nome de edição.
  'nk', 'nb', 'ballance', 'tenis', 'drift', 'pto', 'bco',
]);

export function temNomeProprio(titulo) {
  const palavras = String(titulo || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9']+/).filter(Boolean);
  // número puro é variação de modelo (90, 95, 3, 9060), não nome
  return palavras.some((w) => !PALAVRAS_COMUNS.has(w) && !/^[0-9]+$/.test(w) && !/^[0-9]+[a-z]$/.test(w));
}

// Sobe para o topo quem tem nome de edição e/ou a tag pedida, sem embaralhar o
// resto: o sort do JS é estável, então a ordem dentro de cada grupo se mantém.
// Nome de edição pesa mais que a tag, e quem tem os dois vai na frente de tudo.
function priorizar(lista, { tag = null, nomeados = false, handles = null } = {}) {
  let base = lista;
  if (tag || nomeados) {
    const peso = (p) => (nomeados && temNomeProprio(p.title) ? 2 : 0)
      + (tag && (p.tags || []).includes(tag) ? 1 : 0);
    base = base.slice().sort((a, b) => peso(b) - peso(a));
  }
  if (!handles || !handles.length) return base;
  // Handles vêm NA ORDEM em que chegaram — é uma lista de mais vendidos, e a
  // ordem dela é a informação. Por isso não dá para fazer com peso: peso
  // empata todo mundo do grupo e a ordem viraria a do catálogo.
  //
  // Handle que não existe mais no catálogo some sozinho (o find devolve
  // undefined e o filter tira), então a lista pode envelhecer sem quebrar a
  // vitrine.
  const naFrente = new Set(handles);
  const frente = handles.map((h) => base.find((x) => x.handle === h)).filter(Boolean);
  return [...frente, ...base.filter((x) => !naFrente.has(x.handle))];
}

// Espalha uma coleção de MARCA pelos modelos dela, em rodízio.
//
// Existe porque a ordem natural do catálogo agrupa por modelo (o CSV foi
// escrito assim), e numa vitrine de 12 cards isso mostrava cinco 1906R
// seguidos em "New Balance" e doze TN Plus em "Air Max TN" — a fileira anuncia
// a marca inteira e entrega um modelo só. `priorizar` não resolve: ele empurra
// para cima, não distribui.
//
// O modelo de cada par é a tag MAIS ESPECÍFICA que ele tem (a mais longa que
// não é a tag da própria coleção) — "New Balance 1906R" ganha de "New Balance".
// Quem não tem tag de modelo cai num grupo só e entra no rodízio como os
// outros. A ordem DENTRO de cada modelo é preservada.
function intercalarPorModelo(lista, tagDaColecao) {
  const grupos = new Map();
  for (const p of lista) {
    const modelo = (p.tags || [])
      .filter((t) => t !== tagDaColecao)
      .sort((a, b) => b.length - a.length)[0] || '';
    if (!grupos.has(modelo)) grupos.set(modelo, []);
    grupos.get(modelo).push(p);
  }
  // Um grupo só = nada a intercalar; devolve intocado em vez de reordenar à toa.
  if (grupos.size < 2) return lista;
  const filas = [...grupos.values()];
  const out = [];
  for (let i = 0; out.length < lista.length; i++) {
    for (const f of filas) if (f[i]) out.push(f[i]);
  }
  return out;
}

export async function getCollection(handle, { limit = 24, offset = 0, sort = 'destaque', priorizarTag = null, priorizarNomeados = false, intercalar = false, destaques = null } = {}) {
  const { products } = await loadCatalog();
  const wanted = String(handle || '');
  const cmpDe = SORTS[sort];

  // Curada vem primeiro: a ordem dela é a escolha do lojista, não a do catálogo.
  // Por isso "destaque" aqui significa manter a lista como está escrita.
  const curada = CURADAS[wanted];
  if (curada) {
    const mapa = new Map(products.map((p) => [p.handle, p]));
    let all = curada.handles.map((h) => mapa.get(String(h))).filter(Boolean);
    if (cmpDe) all = all.slice().sort(cmpDe);
    return {
      title: curada.title, handle: wanted, tag: null, total: all.length, sort,
      products: all.slice(offset, offset + limit),
    };
  }

  // Coleção combinada tem prioridade sobre a tag de mesmo slug: /colecao/air-max-tn
  // devolve Air Max + TN juntos, não só a tag "Air Max TN".
  const combo = COMBOS[wanted];
  if (combo) {
    let all = products.filter((p) => noCombo(p, combo));
    if (cmpDe) all = all.slice().sort(cmpDe);
    // Destaques só valem na ordem PADRÃO. Quem pediu "menor preço" na página da
    // coleção quer menor preço; empurrar campeão de venda para cima ali seria
    // ignorar o que a pessoa pediu. Na home o sort é sempre o padrão.
    all = priorizar(all, { tag: priorizarTag, nomeados: priorizarNomeados, handles: cmpDe ? null : destaques });
    // No combo não há uma tag única da coleção: passa null e o modelo vira a
    // tag mais específica de cada par.
    if (intercalar) all = intercalarPorModelo(all, null);
    return {
      title: combo.title, handle: wanted, tag: null, total: all.length, sort,
      products: all.slice(offset, offset + limit),
    };
  }

  let tag = null;
  for (const p of products) {
    for (const t of p.tags || []) if (slugTag(t) === wanted) { tag = t; break; }
    if (tag) break;
  }
  if (!tag) return null;
  let all = products.filter((p) => (p.tags || []).includes(tag));
  if (cmpDe) all = all.slice().sort(cmpDe); // cópia: o array vem do cache do catálogo
  all = priorizar(all, { tag: priorizarTag, nomeados: priorizarNomeados, handles: cmpDe ? null : destaques });
  if (intercalar) all = intercalarPorModelo(all, tag);
  return {
    title: tag, handle: wanted, tag, total: all.length, sort,
    products: all.slice(offset, offset + limit),
  };
}

export default { getMenu, getCollections, getCollection, slugTag, SORTS };
