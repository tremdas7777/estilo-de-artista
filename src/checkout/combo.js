// Mini-catálogo do COMBO (a promo "2 pares"), organizado do jeito que o
// cliente escolhe: MODELO -> COLORWAY -> NUMERAÇÃO -> variante.
//
// Por que existe um módulo só pra isso: o catálogo desta loja tem um produto
// POR COLORWAY ("Tesla Coil Delux Black Gum" e "Tesla Coil Malbec" são dois
// produtos), e as numerações são as variantes de cada um. Uma lista crua de
// produtos no carrinho mostraria 41 cartões "Tesla Coil" quase iguais — que é
// exactamente o que o dono pediu para NÃO acontecer. O agrupamento sai das
// tags e do vendor que já estão no catálogo, sem tabela nova e sem lista
// escrita à mão: modelo novo cadastrado amanhã já aparece aqui.
//
// A elegibilidade NÃO é decidida aqui. Ela é `promo.itemElegivel`, a mesma
// função que o servidor usa para dar desconto — se este arquivo tivesse a sua
// própria régua, o carrinho ofereceria um par que o PIX depois cobraria cheio.
import config from '../config.js';
import { loadCatalog, imagemNaLargura } from './products.js';
import { itemElegivel, computeDiscount } from './promo.js';
import { slugTag, CURADAS } from './collections.js';
import { availableShipping } from './catalog.js';

// Numerações de um produto que a promo aceita. `available` vem do catálogo
// (é o estoque que esta loja tem); variante fora dele nem chega ao front.
function variantesElegiveis(p) {
  return (p.variants || []).filter((v) => v.available !== false
    && itemElegivel({ priceCents: v.priceCents, handle: p.handle, qty: 1 }));
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaves = (s) => semAcento(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// MODELO de um produto: a tag mais específica que NÃO é a marca.
//
// "a mais longa" sozinha erra: o Louis Vuitton tem as tags ["Louis Vuitton",
// "LV Trainer"] e "Louis Vuitton" é mais comprida — os 66 pares cairiam num
// modelo só. Tirando o vendor primeiro, sobra o modelo de verdade. Produto que
// só tem a tag da marca (Mad Rats, Stickers) vira um modelo com o nome dela,
// em vez de ficar de fora da escolha.
export function modeloDe(p) {
  const marca = String(p.vendor || '').trim();
  const tags = (p.tags || []).map((t) => String(t).trim()).filter(Boolean);
  const semMarca = tags.filter((t) => t.toLowerCase() !== marca.toLowerCase());
  return semMarca.slice().sort((a, b) => b.length - a.length)[0] || marca || p.title;
}

// COR (colorway) de um produto: o que sobra do título depois de tirar marca,
// modelo e a palavra "tênis". "Tesla Coil Delux Black Gum" -> "Delux Black Gum".
// Sobrando nada (título igual ao modelo), devolve o título inteiro — melhor
// repetir o nome do que mostrar uma miniatura sem legenda.
export function corDe(p, modelo) {
  const fora = new Set([...chaves(modelo), ...chaves(p.vendor || ''), 'tenis']);
  const resto = String(p.title || '').split(/\s+/).filter(Boolean)
    .filter((w) => { const k = chaves(w).join(''); return k && !fora.has(k); });
  return resto.join(' ') || String(p.title || '');
}

// Os números do combo, saindo da MESMA conta do servidor (computeDiscount).
// Nada de "149" escrito: mexer em PROMO_* muda tudo junto, aqui e no PIX.
//
// `handleRef` é o handle de um produto elegível de verdade. Só importa quando
// PROMO_HANDLES está configurada (promo restrita a certos produtos): sem um
// handle que casa, computeDiscount devolveria zero e o combo diria que não há
// desconto quando há.
export function comboPromo(handleRef = '') {
  const { minQty, eligiblePriceCents: unit, label } = config.promo;
  const { discountCents, applies } = computeDiscount([{ priceCents: unit, qty: minQty, handle: handleRef }]);
  const cheioCents = unit * minQty;
  return {
    minQty,
    unitCents: unit,
    cheioCents,
    economiaCents: discountCents,
    totalCents: Math.max(0, cheioCents - discountCents),
    label,
    applies,
    // A frase "frete grátis" só aparece se a opção de R$ 0 existir de fato nas
    // opções de frete (o /admin pode tirá-la). Promessa sem opção é estorno.
    freteGratis: availableShipping().some((o) => o.cents === 0),
  };
}

// Índice modelo -> colorways, na ordem do catálogo.
function agrupar(products) {
  const modelos = new Map();
  for (const p of products) {
    const variants = variantesElegiveis(p);
    if (!variants.length) continue;
    const titulo = modeloDe(p);
    const key = slugTag(titulo) || slugTag(p.vendor) || 'outros';
    if (!modelos.has(key)) {
      modelos.set(key, { key, title: titulo, marca: String(p.vendor || '').trim(), cores: [] });
    }
    modelos.get(key).cores.push({ p, variants });
  }
  return modelos;
}

// Ordem em que os modelos aparecem na escolha do 2º par.
//
// Primeiro os modelos dos MAIS VENDIDOS (a curadoria que já existe em
// collections.js e sustenta a vitrine da home), na ordem de lá; depois os
// outros, do que tem mais colorways para o que tem menos — mais cor para
// escolher é mais chance de a pessoa achar a dela e fechar o combo. Handle que
// sair do catálogo desaparece sozinho, como na vitrine.
function ordenar(modelos, products) {
  const porHandle = new Map(products.map((p) => [p.handle, p]));
  const frente = [];
  for (const h of (CURADAS['mais-vendidos']?.handles || [])) {
    const p = porHandle.get(String(h));
    if (!p) continue;
    const key = slugTag(modeloDe(p));
    if (modelos.has(key) && !frente.includes(key)) frente.push(key);
  }
  const resto = [...modelos.keys()]
    .filter((k) => !frente.includes(k))
    .sort((a, b) => modelos.get(b).cores.length - modelos.get(a).cores.length);
  return [...frente, ...resto].map((k) => modelos.get(k));
}

// Card do modelo: foto, nome e QUANTAS cores existem — sem as numerações, que
// são 12 por colorway e só fazem falta na etapa 3.
function resumoModelo(m) {
  const precos = m.cores.flatMap((c) => c.variants.map((v) => v.priceCents));
  const cheios = m.cores.flatMap((c) => c.variants.map((v) => v.compareCents || 0));
  return {
    key: m.key,
    title: m.title,
    marca: m.marca,
    cores: m.cores.length,
    image: imagemNaLargura(m.cores[0]?.p.image || '', 400),
    priceCents: Math.min(...precos),
    compareCents: Math.max(0, ...cheios) || null,
  };
}

// GET /api/combo — o que a etapa 1 precisa: promo, filtros de marca e modelos.
export async function comboIndex() {
  const { products } = await loadCatalog();
  const modelos = agrupar(products);
  const lista = ordenar(modelos, products);
  const primeiro = lista[0]?.cores[0]?.p.handle || '';

  // Filtros de marca tirados do catálogo real (nada de lista fixa): marca sem
  // par elegível não vira aba.
  const porMarca = new Map();
  for (const m of lista) {
    if (!m.marca) continue;
    porMarca.set(m.marca, (porMarca.get(m.marca) || 0) + m.cores.length);
  }
  const marcas = [...porMarca.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([title, cores]) => ({ key: slugTag(title), title, cores }));

  return { promo: comboPromo(primeiro), marcas, modelos: lista.map(resumoModelo) };
}

// GET /api/combo/modelo/:key — as colorways de um modelo, com as numerações.
//
// Paginado porque "Air Max TN" tem 132 colorways: mandar as 132 com 12
// numerações cada seria um quarto de mega para escolher uma cor no 4G.
export async function comboModelo(key, { limit = 18, offset = 0 } = {}) {
  const { products } = await loadCatalog();
  const m = agrupar(products).get(String(key || ''));
  if (!m) return null;
  const fatia = m.cores.slice(offset, offset + limit);
  return {
    key: m.key,
    title: m.title,
    marca: m.marca,
    total: m.cores.length,
    cores: fatia.map(({ p, variants }) => ({
      handle: p.handle,
      title: p.title,
      cor: corDe(p, m.title),
      // 720px: a foto grande da troca de cor. Miniatura em 160.
      image: imagemNaLargura(p.image, 720),
      thumb: imagemNaLargura(p.image, 160),
      // TODAS as numerações do produto, não só as que a promo aceita: a que
      // está fora aparece DESATIVADA na grade, com o número riscado. Sumir com
      // ela faria a grade pular do 39 para o 41 e o cliente pensaria que a loja
      // não trabalha o 40 — e `elegivel` é o que impede o botão de adicionar
      // uma variante que o desconto não cobre.
      variants: (p.variants || []).map((v) => ({
        id: v.id,
        option: v.option || '',
        sku: v.sku || '',
        priceCents: v.priceCents,
        compareCents: v.compareCents || null,
        available: v.available !== false,
        elegivel: itemElegivel({ priceCents: v.priceCents, handle: p.handle, qty: 1 }),
      })),
    })),
  };
}

// Colorways IRMÃS de um produto: as outras cores do mesmo modelo.
//
// Diferente do combo, aqui NÃO há filtro de promoção. O combo só pode oferecer
// o que ganha desconto; a página de produto mostra o modelo inteiro — esconder
// uma cor porque ela custa outro preço seria esconder produto de quem está
// justamente olhando aquele modelo. `elegivel` vai junto para a página poder
// dizer quais entram no 2 por 149.
export async function coresIrmas(handle) {
  const { products } = await loadCatalog();
  const atual = products.find((p) => p.handle === String(handle || ''));
  if (!atual) return null;
  const modelo = modeloDe(atual);
  const chave = slugTag(modelo);
  const irmas = products.filter((p) => slugTag(modeloDe(p)) === chave && (p.variants || []).length);
  // Uma cor só = não é escolha, é repetição do que já está na tela.
  if (irmas.length < 2) return { modelo, key: chave, cores: [] };
  return {
    modelo,
    key: chave,
    cores: irmas.map((p) => ({
      handle: p.handle,
      title: p.title,
      cor: corDe(p, modelo),
      thumb: imagemNaLargura(p.image, 160),
      image: imagemNaLargura(p.image, 900),
      atual: p.handle === atual.handle,
      elegivel: (p.variants || []).some((v) => v.available !== false
        && itemElegivel({ priceCents: v.priceCents, handle: p.handle, qty: 1 })),
    })),
  };
}

export default { comboIndex, comboModelo, comboPromo, modeloDe, corDe, coresIrmas };
