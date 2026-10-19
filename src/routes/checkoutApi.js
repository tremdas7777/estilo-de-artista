import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import config from '../config.js';
import { createOrder, getOrder, setPix, setShopifyOrderId, registrarUpsellView } from '../db.js';
import { loadCatalog, getProducts, getProductsLight, resolveVariant, publicProduct, cardProduct, imagemNaLargura, getProductByHandle, getProductsByHandles, semTabelaDeMedidas } from '../checkout/products.js';
import { getMenu, getCollection, slugTag, SORTS, CURADAS } from '../checkout/collections.js';
import { resolveCart, priceOrder, createShopifyPending, telefoneValido } from '../checkout/orders.js';
import { aplicaGravacoes } from '../checkout/gravacao.js';
import { documentoValido } from '../checkout/documento.js';
import { availableShipping } from '../checkout/catalog.js';
import { getCustomization } from '../checkout/customization.js';
import { createPayment, activeGatewayId } from '../gateways.js';
import { sendOrder as sendUtmifyOrder } from '../utmify/client.js';
import { markOrderPaid } from '../checkout/payment.js';
import { notificarPixGerado } from '../checkout/push.js';
import { emSegundoPlano } from '../segundoPlano.js';
import { UPSELL, abrirOferta, produtosDaOferta, precoDaOferta, upsellHref, restanteMs } from '../checkout/upsell.js';
import { RECUPERACAO, abrirRecuperacao, produtosDaRecuperacao, montarItens } from '../checkout/recuperacao.js';
import { comboIndex, comboModelo, modeloDe, corDe, coresIrmas } from '../checkout/combo.js';
import { giroDoProduto } from '../checkout/giro.js';


// Order bumps expostos ao front (sem nada sensível).
function publicBumps() {
  return getCustomization().orderBumps
    .filter((b) => b.enabled && b.variantId)
    .map((b) => ({ title: b.title, description: b.description, image: b.image, variantId: b.variantId, priceCents: b.priceCents }));
}

const router = Router();
const digits = (v) => String(v || '').replace(/\D/g, '');

// GET /api/catalog
router.get('/catalog', async (_req, res) => {
  try {
    const products = await getProductsLight();
    res.json({ products, shipping: { options: availableShipping() }, bumps: publicBumps() });
  } catch (e) {
    console.error('[api/catalog]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar o catálogo da Shopify.' });
  }
});

// Coleções em destaque na home — mesma ordem e mesmos títulos que estavam
// configurados no tema da Shopify (content_for_index).
// Vitrine do topo da home. A lista sai do RANKING de pedidos pagos e se
// refaz sozinha conforme a loja vende (a regra, a janela e a reserva estão em
// checkout/maisVendidos.js). Ela mora em CURADAS (collections.js), que é o que
// a página /colecao/mais-vendidos também lê — assim o "Ver todos" leva
// exatamente aos mesmos pares da vitrine, em vez de a uma coleção parecida.
const MAIS_VENDIDOS = {
  title: CURADAS['mais-vendidos'].title,
  subtitle: CURADAS['mais-vendidos'].subtitle,
  botao: 'Ver todos',
  href: '/colecao/mais-vendidos',
  // Getter, não cópia: a lista vem do ranking de vendas e muda sozinha. Um
  // espalhamento aqui congelaria no boot os campeões do dia em que o servidor
  // subiu, e a vitrine só mudaria em deploy.
  get handles() { return CURADAS['mais-vendidos'].handles; },
};

// `priorizar` põe os produtos daquela tag na frente da vitrine, sem mudar a
// ordem da página da coleção — é vitrine, não filtro.
// Vitrines que abrem pelos campeões de venda da própria coleção: handle da
// vitrine -> handles na ordem do ranking, o #1 primeiro.
//
// VAZIO nesta loja, de propósito. Ela nasceu sem venda nenhuma, e a lista que
// a A Fonte tinha aqui era o ranking da Nation 47 — outro catálogo, cujos pares
// nem existem aqui. Quando houver venda própria, é daqui que o /admin/ranking
// volta para a home. Handle que sumir do catálogo é ignorado sozinho (ver
// priorizar() em collections.js), então a lista pode envelhecer sem quebrar.
const DESTAQUES_POR_VITRINE = {};

const HOME_FEATURED = [
  // ------------------------------------------------- OS FOCOS DA LOJA
  // Estes sete abrem a home, logo abaixo dos Mais Vendidos. É a ordem que o
  // dono pediu (29/09/2026): são os modelos que puxam a venda, e quem rola
  // até a décima vitrine já é minoria — o foco não pode depender de rolagem.
  //
  // Nenhum deles precisa de 'intercalar' ou 'nomeados': cada par tem nome
  // próprio (Delux Grey, Malbec, Hertz Off White, Asfalto…), então a fileira
  // não repete o mesmo título doze vezes.
  { handle: 'tesla-coil', title: 'Tesla Coil' },
  { handle: 'hocks-bold', title: 'Hocks Bold' },
  { handle: 'tesla-lokal', title: 'Tesla x Lokal' },
  { handle: 'puma-ca-pro', title: 'Puma CA Pro' },
  { handle: 'hocks-puff', title: 'Hocks Puff' },
  { handle: 'puma-park', title: 'Puma Park' },
  { handle: 'stickers', title: 'Stickers' },

  // ------------------------------------------------------------- O RESTO
  // Continuam na ordem que já tinham entre si — só desceram para dar lugar
  // aos focos acima.
  //
  // TN com 'intercalar', e é a razão de a flag existir: são 167 pares e 132
  // deles a Drip cadastrou com o MESMO nome, "Nike Air Max Tn". Na ordem do
  // catálogo a fileira seria doze cartões idênticos; o rodízio alterna TN, TN
  // Plus 3, TN Drift e o Kiss My Airs. 'nomeados' puxa antes os que têm nome.
  { handle: 'air-max-tn', title: 'Nike Air Max TN', intercalar: true, nomeados: true },
  { handle: 'new-balance-9060', title: 'New Balance 9060' },
  { handle: 'nike-mind', title: 'Slides Nike Mind 001' },
  // 'nomeados' nas duas LV e no 95: metade dos LV se chama só "LV *Trainer" ou
  // "LV Skate", e sem ele a fileira repete o mesmo título várias vezes.
  { handle: 'air-max-95', title: 'Nike Air Max 95', nomeados: true },
  { handle: 'puma-caven', title: 'Puma Caven' },
  { handle: 'adidas-forum', title: 'Adidas Forum' },
  { handle: 'lv-trainer', title: 'Louis Vuitton Trainer', nomeados: true },
  { handle: 'vans-knu-skool', title: 'Vans Knu Skool' },
  { handle: 'ous-imigrante', title: 'Öus Imigrante' },
  { handle: 'lv-skate', title: 'Louis Vuitton Skate', nomeados: true },
  { handle: 'dc-manteca', title: 'DC Manteca' },
  { handle: 'mad-rats', title: 'Mad Rats' },
  { handle: 'vans-ultrarange', title: 'Vans Ultrarange' },
  { handle: 'qix-chorao', title: 'Qix Chorão' },
  // Fecham a home com o que não é par de tênis.
  { handle: 'camisas', title: 'Camisas de Seleção' },
  { handle: 'chinelos', title: 'Chinelos' },
  { handle: 'calcas', title: 'Calças' },
  { handle: 'blusas', title: 'Blusas' },
];

// GET /api/home — menu + as vitrines de 12 produtos. Bem mais leve que
// mandar o catálogo inteiro (1,9 MB) só pra montar a primeira tela.
router.get('/home', async (_req, res) => {
  try {
    const [menu, sections, curados] = await Promise.all([
      getMenu(),
      Promise.all(HOME_FEATURED.map(async (f) => {
        const c = await getCollection(f.handle, {
          limit: 12, priorizarTag: f.priorizar || null, priorizarNomeados: !!f.nomeados,
          intercalar: !!f.intercalar, destaques: DESTAQUES_POR_VITRINE[f.handle] || null,
        });
        return c ? { title: f.title, handle: f.handle, total: c.total, products: c.products.map((p) => cardProduct(p)) } : null;
      })),
      getProductsByHandles(MAIS_VENDIDOS.handles),
    ]);
    // some da home se nenhum dos handles escolhidos existir no catálogo
    const destaque = curados.length
      ? {
        title: MAIS_VENDIDOS.title, subtitle: MAIS_VENDIDOS.subtitle,
        botao: MAIS_VENDIDOS.botao, href: MAIS_VENDIDOS.href,
        products: curados.map((p) => cardProduct(p)),
      }
      : null;
    res.json({ menu, destaque, sections: sections.filter(Boolean), bumps: publicBumps() });
  } catch (e) {
    console.error('[api/home]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar a loja.' });
  }
});

// GET /api/colecao/:handle?offset=0&limit=24&sort=az
router.get('/colecao/:handle', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(60, parseInt(req.query.limit, 10) || 24));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const sort = Object.hasOwn(SORTS, req.query.sort || '') ? req.query.sort : 'destaque';
    const c = await getCollection(req.params.handle, { limit, offset, sort });
    if (!c) return res.status(404).json({ error: 'Coleção não encontrada.' });
    res.json({ ...c, products: c.products.map((p) => cardProduct(p)) });
  } catch (e) {
    console.error('[api/colecao]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar a coleção.' });
  }
});

// GET /api/produto/:handle — produto completo + relacionados da mesma tag.
router.get('/produto/:handle', async (req, res) => {
  try {
    const p = await getProductByHandle(req.params.handle);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });

    // ?slim=1 — só as variantes. É tudo que a folha de numeração da oferta usa:
    // ela desenha 11 botões e mais nada. O ganho não é de tempo (com o catálogo
    // em cache as duas respostas empatam) — é de superfície: o clique mais
    // decisivo da oferta deixa de depender da descrição, das 16 fotos e da
    // varredura dos relacionados, que são coisas que podem falhar.
    if (req.query.slim === '1') {
      return res.json({ product: { ...publicProduct(p), image: imagemNaLargura(p.image, 900) } });
    }

    // Relacionados: mesma tag mais específica (a última costuma ser o modelo).
    // Em try próprio: relacionado é enfeite, e antes qualquer tropeço aqui
    // derrubava em 502 a resposta de um produto que existe e está em estoque —
    // que a oferta mostrava pro cliente como "sem numeração disponível".
    const tag = (p.tags || [])[p.tags.length - 1] || (p.tags || [])[0];
    let related = [];
    if (tag) {
      try {
        const c = await getCollection(slugTag(tag), { limit: 13 });
        related = (c?.products || []).filter((x) => x.handle !== p.handle).slice(0, 12).map((p) => cardProduct(p));
      } catch (e) {
        console.error('[api/produto] relacionados falharam para', p.handle, '-', e.message);
      }
    }
    // Cores irmãs e sequência de giro: as duas coisas que a página de produto
    // ganhou e que não existiam. Cada uma no seu try, pelo mesmo motivo dos
    // relacionados — nenhuma delas pode derrubar a resposta de um produto que
    // existe e está em estoque.
    let cores = null;
    try { cores = await coresIrmas(p.handle); }
    catch (e) { console.error('[api/produto] cores irmãs falharam para', p.handle, '-', e.message); }

    res.json({
      giro: giroDoProduto(p.handle),
      cores,
      product: {
        ...publicProduct(p),
        // 900px cobre a foto grande até em tela retina; o CDN entrega
        // redimensionado em vez dos 1024 originais de cada foto.
        image: imagemNaLargura(p.image, 900),
        // sem a tabela antiga: a página desenha a atual sozinha (ver
        // semTabelaDeMedidas). Duas na mesma tela mostrariam números diferentes.
        bodyHtml: semTabelaDeMedidas(p.bodyHtml),
        // Teto era 10 porque nenhum produto passava disso; os óculos Juliet
        // chegam a 12 fotos e o corte comia as últimas. As miniaturas fora da
        // tela carregam lazy (ver a galeria em pages.js), então o custo de
        // subir o teto fica nas fotos que o cliente realmente rolar até ver.
        images: (p.images || []).slice(0, 16).map((i) => imagemNaLargura(i, 900)),
        vendor: p.vendor || '',
      },
      related,
    });
  } catch (e) {
    console.error('[api/produto]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar o produto.' });
  }
});

// minúsculas e sem acento — "Salmão" tem que casar com "salmao".
const buscaNorm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
// Só letras e números: é o que faz "airmax" achar "Air Max" e vice-versa.
// O catálogo tem as duas grafias (389 títulos juntos, 181 separados), herança
// das lojas de onde os produtos foram raspados, e o cliente digita qualquer uma.
const buscaEsmaga = (s) => buscaNorm(s).replace(/[^a-z0-9]/g, '');

// GET /api/busca?q=air+max — filtra no servidor (o catálogo tem 1.147 produtos,
// mandar tudo pro front só pra buscar seria 1,9 MB por tecla).
//
// Casa por PALAVRA, não pela frase inteira. Antes era `title.includes(q)`, que
// exigia o termo contíguo e na ordem exata do título: "air max 95" devolvia
// ZERO com 35 pares no catálogo, porque todos se chamam "Nike AirMax 95" e a
// string "air max 95" não existe em nenhum. Quem digitava mais recebia menos.
router.get('/busca', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ products: [] });

    const termos = buscaNorm(q).split(/\s+/).filter(Boolean);
    const all = await getProducts();

    // Quais termos cada produto tem. Percorre tudo antes de cortar em 20 porque
    // agora existe ordenação — mas o cardProduct (o caro) só roda nos 20 que
    // sobram, que era o motivo do corte antecipado de antes.
    const marcados = [];
    const freq = new Map(termos.map((t) => [t, 0]));
    for (const p of all) {
      const titulo = buscaNorm(p.title);
      const esmagado = buscaEsmaga(p.title);
      const casou = termos.filter((t) => titulo.includes(t) || esmagado.includes(buscaEsmaga(t)));
      if (!casou.length) continue;
      for (const t of casou) freq.set(t, freq.get(t) + 1);
      marcados.push({ p, casou });
    }

    // Termo raro vale mais que termo comum. Sem isso, "air max tn 95" empatava
    // TN e 95 em 3 de 4 palavras, e como os TN vêm antes no catálogo os 20
    // resultados eram TODOS TN — o cliente que digitou "95" não via um 95
    // sequer, que é exatamente a reclamação. "95" está em 35 títulos e "tn" em
    // 271: o número é o que diz o que a pessoa quer.
    const peso = (t) => 1 / (freq.get(t) || 1);
    const nota = (m) => m.casou.reduce((s, t) => s + peso(t), 0);

    // Todos os termos casaram = resposta exata. Se nada casar por inteiro, cai
    // para os mais próximos em vez de tela vazia: "air max tn 95" não existe
    // (TN e 95 são modelos diferentes da Nike), e mostrar os Air Max 95 é mais
    // útil que dizer que a loja não tem — foi o que fez cliente desistir.
    const exatos = marcados.filter((m) => m.casou.length === termos.length);
    const lista = exatos.length ? exatos
      : marcados.slice().sort((a, b) => nota(b) - nota(a));

    res.json({
      products: lista.slice(0, 20).map((m) => cardProduct(m.p, 120)),
      total: lista.length,
      // o front avisa que a busca foi relaxada; sem isto o cliente acha que
      // esses produtos são o que ele pediu. Só faz sentido havendo o que
      // mostrar: sem resultado nenhum, a tela é "nada encontrado".
      aproximado: !exatos.length && lista.length > 0,
    });
  } catch (e) {
    console.error('[api/busca]', e.message);
    res.status(502).json({ error: 'falha na busca' });
  }
});

// GET /api/menu
router.get('/menu', async (_req, res) => {
  try { res.json({ menu: await getMenu() }); }
  catch (e) { console.error('[api/menu]', e.message); res.status(502).json({ error: 'falha' }); }
});

// GET /api/shipping
router.get('/shipping', (_req, res) => res.json({ shipping: { options: availableShipping() }, bumps: publicBumps() }));

// ---------------------------------------------------------------- COMBO
// O mini-catálogo que o carrinho lateral usa pra montar a promo de 2 pares sem
// mandar o cliente de volta pra vitrine. Os produtos, o agrupamento por modelo
// e os números do desconto saem de checkout/combo.js — que por sua vez usa a
// MESMA promo.js do servidor. Estas rotas não decidem preço nenhum: quem cobra
// continua sendo o POST /orders, que recalcula tudo do catálogo.

// GET /api/combo — promo, filtros de marca e todos os modelos elegíveis.
router.get('/combo', async (_req, res) => {
  try {
    res.json(await comboIndex());
  } catch (e) {
    console.error('[api/combo]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar os modelos agora.' });
  }
});

// GET /api/combo/modelo/:key — colorways do modelo, com as numerações reais.
router.get('/combo/modelo/:key', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(36, parseInt(req.query.limit, 10) || 18));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const m = await comboModelo(req.params.key, { limit, offset });
    if (!m) return res.status(404).json({ error: 'Modelo não encontrado.' });
    res.json(m);
  } catch (e) {
    console.error('[api/combo/modelo]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar as cores agora.' });
  }
});

// Preview local: produto fake quando é DEV e a Shopify NÃO está configurada.
// Em produção a Shopify existe, então isto nunca dispara.
const shopifyOff = !config.shopify.shop || (!config.shopify.adminToken && !config.shopify.clientId);
function mockVariant(id) {
  return {
    id,
    priceCents: config.promo.eligiblePriceCents || 9900,
    title: 'Nike Air Max TN Plus Preto c/ Azul — 42',
    image: 'https://acdn-us.mitiendanube.com/stores/005/930/814/products/img_1865-70a0e52c4404101f8417554479472573-640-0.webp',
    productId: 'demo',
  };
}

// GET /api/variants?ids=a,b,c
router.get('/variants', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const comOpcoes = req.query.opcoes === '1';
  // det=1: acrescenta MODELO e COR (derivados das tags e do título, em
  // checkout/combo.js). É o que o carrinho lateral mostra em cada linha —
  // derivado no servidor para não existirem duas leituras do mesmo título.
  const comDetalhe = req.query.det === '1';
  const out = [];
  // Um índice só, e apenas quando pedido: procurar produto por produto
  // reabriria o catálogo a cada id.
  const porProduto = (comOpcoes || comDetalhe)
    ? new Map((await loadCatalog()).products.map((p) => [String(p.id), p]))
    : null;
  for (const id of ids) {
    const v0 = await resolveVariant(id).catch(() => null);
    if (!v0) { if (config.devTools && shopifyOff) out.push(mockVariant(id)); continue; }
    let v = v0;
    if (comDetalhe) {
      const p = porProduto.get(String(v0.productId));
      if (p) {
        const modelo = modeloDe(p);
        v = { ...v0, modelo, cor: corDe(p, modelo) };
      }
    }
    if (comOpcoes) {
      const p = porProduto.get(String(v.productId));
      const irmas = (p?.variants || []).filter((x) => x.available !== false);
      // Só manda quando há escolha de verdade: produto de variante única
      // (óculos, impermeabilizante) continua sendo um checkbox e nada mais.
      if (irmas.length > 1) {
        out.push({ ...v, opcoes: irmas.map((x) => ({ id: String(x.id), option: x.option || '' })) });
        continue;
      }
    }
    out.push(v);
  }
  res.json({ variants: out });
});

function validateCustomer(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['dados do cliente ausentes'];
  if (!c.name || c.name.trim().length < 3) errs.push('nome');
  if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) errs.push('e-mail');
  // Só "tem 10 dígitos" deixava passar número truncado pelo DDI: quem colava
  // "+55 47 99722-9918" gravava (55) 47997-2299, que tem 11 dígitos e parece
  // certo no /admin. Agora confere DDD, e o 9 do celular.
  if (!telefoneValido(c.phone)) errs.push('telefone (DDD + número)');
  // Contar 11 dígitos deixava passar CPF inventado, que só quebrava lá na
  // frente, ao gerar a cobrança, com erro genérico. Agora confere os dígitos
  // verificadores — e aceita CNPJ, porque quem compra como empresa também compra.
  if (!documentoValido(c.cpf)) errs.push('CPF');
  if (digits(c.cep).length !== 8) errs.push('CEP');
  if (!c.street) errs.push('endereço');
  if (!c.number) errs.push('número');
  if (!c.city) errs.push('cidade');
  if (!c.state) errs.push('estado');
  return errs;
}

// POST /api/orders — cria pedido, gera PIX, cria pendente na Shopify.
// Freio de criação de pedido, por IP. Cada POST aqui gera uma cobrança no
// gateway e uma linha no banco — um script solto enche o painel de lixo, suja
// o funil e queima a cota da API do gateway. O teto é FOLGADO de propósito:
// em 4G muita gente sai pelo mesmo IP da operadora, e barrar comprador de
// verdade custa mais caro que o abuso que isto evita.
const orderHits = new Map();
function orderThrottled(ip) {
  const now = Date.now();
  const h = (orderHits.get(ip) || []).filter((t) => now - t < 600_000);
  h.push(now);
  orderHits.set(ip, h);
  if (orderHits.size > 5000) orderHits.clear(); // teto de memória
  return h.length > 30;
}

router.post('/orders', async (req, res) => {
  if (orderThrottled(req.ip)) {
    return res.status(429).json({ error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' });
  }
  try {
    const { items = [], customer = {}, shippingId, fb = {}, tracking = {}, device } = req.body || {};

    const errs = validateCustomer(customer);
    if (errs.length) return res.status(400).json({ error: `Confira: ${errs.join(', ')}.` });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Carrinho vazio.' });

    // 1) revalida preços na Shopify e 2) recalcula tudo no backend
    const { items: resolved, subtotalCents } = await resolveCart(items);

    // 1b) gravação personalizada. Depois do resolveCart de propósito: só aqui
    // se sabe quais variantes o cliente realmente comprou e em que quantidade,
    // que é o teto de quanto pode ser gravado. Não mexe em preço — a gravação
    // é grátis, e se um dia for cobrada o valor tem que sair do catálogo, não
    // de um campo que o navegador manda.
    aplicaGravacoes(resolved, req.body?.gravacoes);
    let priced = priceOrder({ items: resolved, subtotalCents, shippingId });

    // 2b) order bumps — preço vem do backend (não confia no front). Adiciona
    // cada oferta aceita como item normal e joga a diferença (preço real -
    // preço oferta) no desconto, pro total do PIX bater com o total enviado à
    // Shopify.
    //
    // O front manda só os IDs marcados, e cada um é conferido contra a lista
    // configurada: id que não está lá (ou está desligado) é ignorado, senão o
    // cliente escolheria o próprio preço mandando um id qualquer.
    const bumpsCfg = getCustomization().orderBumps.filter((b) => b.enabled && b.variantId);
    const aceitos = Array.isArray(req.body?.bumpsAccepted) ? req.body.bumpsAccepted.map(String)
      // `bumpAccepted: true` é o formato antigo, de quando havia um bump só.
      // Uma aba aberta durante o deploy ainda manda assim — vale pelo primeiro.
      : (req.body?.bumpAccepted && bumpsCfg[0] ? [bumpsCfg[0].variantId] : []);

    for (const cfg of bumpsCfg) {
      // O cliente pode mandar OUTRA variante do mesmo produto — é assim que
      // a calça deixa escolher o tamanho. O que não pode é mandar qualquer
      // variante: a peneira é o produto do bump configurado, senão bastaria
      // pôr o id de um par no `bumpsAccepted` para levá-lo pelo preço da
      // oferta. O preço cobrado continua saindo do catálogo, não do cliente.
      const cfgVar = await resolveVariant(cfg.variantId).catch(() => null);
      if (!cfgVar) continue;
      let bv = null;
      for (const id of aceitos) {
        if (id === String(cfg.variantId)) { bv = cfgVar; break; }
        const cand = await resolveVariant(id).catch(() => null);
        if (cand && String(cand.productId) === String(cfgVar.productId)) { bv = cand; break; }
      }
      if (!bv) continue;
      // Entra DEPOIS do priceOrder de propósito: o bump tem desconto próprio
      // (linha abaixo) e nunca conta pra promo — por isso o handle aqui é só
      // pro item guardado ter o mesmo formato dos outros.
      resolved.push({ variantId: bv.id, qty: 1, priceCents: bv.priceCents, title: bv.title, image: bv.image, productId: bv.productId, handle: bv.handle || '' });
      const bumpDiscount = Math.max(0, bv.priceCents - cfg.priceCents);
      priced = {
        subtotalCents: priced.subtotalCents + bv.priceCents,
        discountCents: priced.discountCents + bumpDiscount,
        shippingCents: priced.shippingCents,
        shipping: priced.shipping,
        totalCents: priced.totalCents + bv.priceCents - bumpDiscount,
      };
    }

    // 3) ids
    const id = crypto.randomBytes(8).toString('hex');
    const postbackToken = crypto.randomBytes(24).toString('hex');

    // 4) dados de match do Facebook
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = xff || req.socket?.remoteAddress || '';
    let fbc = fb.fbc || '';
    if (!fbc && fb.fbclid) fbc = `fb.1.${Date.now()}.${fb.fbclid}`;
    const fbData = { fbp: fb.fbp || '', fbc, ip, userAgent: req.headers['user-agent'] || '' };

    // Campanha que trouxe a venda (UTMify). Vem do navegador, então corta o
    // tamanho e aceita só as chaves conhecidas — nada daqui é confiável.
    const trackingData = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck']) {
      trackingData[k] = String(tracking?.[k] ?? '').slice(0, 255);
    }

    const order = {
      id,
      postbackToken,
      currency: config.currency,
      subtotalCents: priced.subtotalCents,
      discountCents: priced.discountCents,
      shippingCents: priced.shippingCents,
      totalCents: priced.totalCents,
      customer,
      items: resolved,
      shipping: priced.shipping,
      fb: fbData,
      tracking: trackingData,
      transactionId: null,
    };

    // 5) persiste local
    const salvo = await createOrder(order);

    // 6) PIX (gateway ativo — webhook aponta pro endpoint do gateway escolhido)
    const gatewayId = activeGatewayId();
    const postbackUrl = `${config.appUrl}/webhooks/${gatewayId}?token=${postbackToken}`;
    const pix = await createPayment({
      orderId: id,
      amountCents: priced.totalCents,
      shippingCents: priced.shippingCents,
      description: `Pedido ${id} - ${config.lojaNome}`,
      notificationUrl: postbackUrl,
      ip,
      customer,
    });
    await setPix(id, pix.pixCode, pix.transactionId);
    order.transactionId = pix.transactionId;

    // 6b) UTMify: checkout iniciado. Sem await — o cliente não espera por isso,
    // mas dentro do emSegundoPlano: na Vercel a instância é congelada quando a
    // resposta sai, e sem isso o "iniciado" se perde (a UTMify cruza iniciado x
    // pago pelo mesmo orderId; faltando o primeiro, a conversão sai errada).
    emSegundoPlano(
      sendUtmifyOrder({ ...salvo, transactionId: pix.transactionId }, 'waiting_payment')
        .catch((e) => console.error('[api/orders] UTMify falhou:', e.message)),
      'orders UTMify');

    // 6c) Avisa o celular do dono que apareceu um PIX. Também sem await: quem
    // está esperando esta resposta é o cliente com o QR na tela.
    emSegundoPlano(
      notificarPixGerado(salvo).catch((e) => console.error('[api/orders] push falhou:', e.message)),
      'orders push');

    // 7) pendente na Shopify — NÃO bloqueia o checkout se falhar (webhook cria depois)
    try {
      const shopifyId = await createShopifyPending(order);
      if (shopifyId) await setShopifyOrderId(id, shopifyId);
    } catch (e) {
      console.error('[api/orders] pendente Shopify falhou (segue com PIX):', e.message);
    }

    // 8) QR a partir do copia-e-cola
    const qrDataUrl = await QRCode.toDataURL(pix.pixCode, { margin: 1, width: 320 });

    res.json({ orderId: id, totalCents: priced.totalCents, pix: pix.pixCode, qrDataUrl });
  } catch (e) {
    // O que chega aqui é falha TÉCNICA: as conferências do pedido (dados do
    // cliente, carrinho vazio) já respondem lá em cima, com texto próprio.
    //
    // O cliente via a mensagem crua do erro — "fetch failed" quando a chamada
    // ao gateway não completa, que acontece de vez em quando por rede. Quem
    // estava comprando lia isso em inglês, no meio do checkout, e desistia; o
    // pedido ficava no /admin sem PIX nenhum, parecendo abandonado. A mensagem
    // interna continua INTEIRA no log, que é onde ela serve para alguma coisa.
    console.error('[api/orders] erro:', e.message);
    res.status(400).json({
      error: 'Não conseguimos gerar o PIX agora. Tente de novo em instantes.',
    });
  }
});

// GET /api/orders/:id/status — polling do front
router.get('/orders/:id/status', async (req, res) => {
  const o = await getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'não encontrado' });
  // O link da oferta sai daqui porque o token dele é assinado no servidor — a
  // tela de obrigado não teria como montar sozinha. Só acompanha pedido PAGO,
  // que é a própria condição da oferta.
  const oferta = o.status === 'paid' && UPSELL.ativo && restanteMs(o) > 0
    ? { href: upsellHref(o), precoCents: UPSELL.precoCents, restanteMs: restanteMs(o) }
    : null;
  res.json({ status: o.status, totalCents: o.totalCents, oferta });
});

// ------------------------------------------------------- OFERTA PÓS-COMPRA
//
// Tudo aqui passa antes por abrirOferta(), que é quem confere pedido pago,
// token e prazo. Os preços NUNCA vêm do corpo da requisição: quem diz quanto
// custa é precoDaOferta(), no servidor — mesma regra dos order bumps.

// Card com o preço da promoção no lugar do preço de catálogo. O valor riscado
// vira o preço cheio, que é o que faz o selo de desconto aparecer sozinho.
function cardDaOferta(p) {
  const c = cardProduct(p);
  const v = c.variants[0];
  if (!v) return c;
  const cheio = v.priceCents;
  return { ...c, variants: [{ ...v, priceCents: UPSELL.precoCents, compareCents: cheio > UPSELL.precoCents ? cheio : null }] };
}

// GET /api/oferta/:id — estado da oferta + produtos.
//
// Duas formas de resposta, e é o pedido que escolhe:
//   sem q e sem col  -> as MESMAS vitrines da home (destaque + seções), pra
//                       oferta e loja mostrarem o catálogo do mesmo jeito;
//   com q ou col     -> lista plana, que é o formato de resultado de busca.
router.get('/oferta/:id', async (req, res) => {
  try {
    const acesso = await abrirOferta(req.params.id, req.query.t);
    // Mesmo motivo do POST: a tela "Esta oferta não está mais de pé" é a queixa
    // mais comum do cliente, e sem log não dá pra separar prazo de link torto.
    if (acesso.erro) {
      console.warn('[api/oferta] acesso negado', req.params.id, '-', acesso.erro);
      return res.status(403).json({ error: acesso.erro });
    }

    const base = {
      restanteMs: acesso.restanteMs,
      precoCents: UPSELL.precoCents,
      maxItens: UPSELL.maxItens,
    };

    const busca = String(req.query.q || '').trim().toLowerCase();
    const col = String(req.query.col || '').trim();

    if (busca || col) {
      const todos = await produtosDaOferta();
      // Coleção resolvida pela mesma função da loja, e depois cruzada com os
      // elegíveis: assim "Chinelos" nunca devolve nada aqui, mesmo existindo.
      let lista = todos;
      if (col) {
        const c = await getCollection(col, { limit: 10000 });
        const ok = new Set((c ? c.products : []).map((p) => String(p.id)));
        lista = lista.filter((p) => ok.has(String(p.id)));
      }
      if (busca) lista = lista.filter((p) => String(p.title || '').toLowerCase().includes(busca));

      const limit = Math.max(1, Math.min(48, parseInt(req.query.limit, 10) || 24));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      return res.json({
        ...base,
        titulo: col ? ((await getCollection(col, { limit: 1 })) || {}).title || '' : '',
        total: lista.length,
        products: lista.slice(offset, offset + limit).map(cardDaOferta),
      });
    }

    // Só este ramo registra a visita: é o que a página chama ao abrir. Busca e
    // "ver todos" caem no ramo de cima e não são gente nova entrando.
    await registrarUpsellView(acesso.order.id);

    // Elegíveis por id, pra peneirar cada vitrine sem consultar o Type de novo.
    const elegiveis = new Set((await produtosDaOferta()).map((p) => String(p.id)));
    const soElegiveis = (arr) => (arr || []).filter((p) => elegiveis.has(String(p.id)));

    const [menu, sections, curados] = await Promise.all([
      // Mesmo menu da loja, podado pelos elegíveis: Juliet e Chinelos não
      // aparecem aqui porque a oferta não pode vendê-los.
      getMenu({ filtro: (p) => elegiveis.has(String(p.id)) }),
      Promise.all(HOME_FEATURED.map(async (f) => {
        const c = await getCollection(f.handle, {
          limit: 12, priorizarTag: f.priorizar || null, priorizarNomeados: !!f.nomeados,
          intercalar: !!f.intercalar, destaques: DESTAQUES_POR_VITRINE[f.handle] || null,
        });
        if (!c) return null;
        const products = soElegiveis(c.products);
        // Vitrine sem nenhum par elegível some — é o que tira Juliet e
        // Chinelos daqui sozinhos, sem lista de exceção pra manter.
        if (!products.length) return null;
        return { title: f.title, handle: f.handle, total: c.total, products: products.map(cardDaOferta) };
      })),
      getProductsByHandles(MAIS_VENDIDOS.handles),
    ]);

    const destProds = soElegiveis(curados);
    res.json({
      ...base,
      menu,
      destaque: destProds.length
        // sem href: "ver todos" aqui não pode sair da oferta pra /colecao, que
        // mostraria os mesmos pares pelo preço cheio
        ? { title: MAIS_VENDIDOS.title, subtitle: MAIS_VENDIDOS.subtitle, products: destProds.map(cardDaOferta) }
        : null,
      sections: sections.filter(Boolean),
    });
  } catch (e) {
    console.error('[api/oferta]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar a oferta.' });
  }
});

// POST /api/oferta/:id — cria o SEGUNDO pedido e devolve um PIX novo.
router.post('/oferta/:id', async (req, res) => {
  try {
    const acesso = await abrirOferta(req.params.id, req.body?.t);
    // Toda recusa vai pro log com o pedido: sem isso, o cliente que diz "não
    // consegui comprar" não deixa rastro nenhum no Render, e não dá pra saber
    // se foi prazo, token ou item fora da promoção.
    if (acesso.erro) {
      console.warn('[api/oferta] recusado', req.params.id, '-', acesso.erro);
      return res.status(403).json({ error: acesso.erro });
    }
    const original = acesso.order;

    const pedidos = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!pedidos.length) return res.status(400).json({ error: 'Escolha pelo menos um par.' });

    // Resolve item a item contra a lista elegível. Id que não está lá é
    // recusado — é o que impede mandar um óculos e levá-lo pelo preço da
    // promoção dos tênis.
    const items = [];
    let pares = 0;
    for (const { variantId, qty } of pedidos) {
      const q = Math.max(1, Math.min(20, parseInt(qty, 10) || 0));
      const oferta = await precoDaOferta(variantId);
      if (!oferta) {
        // O id vai no log porque ele é a única pista do porquê: variante que
        // sumiu num reimport do catálogo e produto de Type não elegível dão
        // exatamente a mesma tela pro cliente.
        console.warn('[api/oferta] variante fora da promoção', req.params.id, String(variantId));
        return res.status(400).json({ error: 'Este par saiu da promoção. Escolha outro — o resto do catálogo continua por este preço.' });
      }
      const v = oferta.variant;
      items.push({
        variantId: String(v.id), qty: q, priceCents: UPSELL.precoCents,
        title: v.title, image: v.image || oferta.product.image || '',
        productId: String(v.productId || oferta.product.id), handle: oferta.product.handle || '',
      });
      pares += q;
    }
    if (pares > UPSELL.maxItens) {
      return res.status(400).json({ error: `Máximo de ${UPSELL.maxItens} pares nesta oferta.` });
    }

    // Frete zero: vai na mesma caixa do pedido que ele acabou de pagar. Sem
    // promo e sem bump — a oferta já é o desconto.
    const subtotalCents = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
    const shipping = { id: 'gratis', name: 'Frete Grátis (vai junto com o seu pedido)', cents: 0, eta: original.shipping?.eta || '' };

    const id = crypto.randomBytes(8).toString('hex');
    const postbackToken = crypto.randomBytes(24).toString('hex');
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = xff || req.socket?.remoteAddress || '';

    const order = {
      id,
      postbackToken,
      currency: config.currency,
      subtotalCents,
      discountCents: 0,
      shippingCents: 0,
      totalCents: subtotalCents,
      // Endereço, CPF e telefone saem do pedido pago — é o que dispensa a
      // pessoa de digitar tudo de novo.
      customer: original.customer,
      items,
      shipping,
      fb: { ...(original.fb || {}), ip, userAgent: req.headers['user-agent'] || '' },
      // A campanha que trouxe a venda é a mesma: a oferta nasce dentro dela.
      tracking: original.tracking || {},
      transactionId: null,
      // Marca de origem: é o que separa venda de oferta de venda normal no
      // painel, e o que liga esta venda ao pedido que a destravou.
      upsellDe: original.id,
    };

    const salvo = await createOrder(order);

    const gatewayId = activeGatewayId();
    const pix = await createPayment({
      orderId: id,
      amountCents: order.totalCents,
      shippingCents: 0,
      description: `Pedido ${id} - ${config.lojaNome}`,
      notificationUrl: `${config.appUrl}/webhooks/${gatewayId}?token=${postbackToken}`,
      ip,
      customer: order.customer,
    });
    await setPix(id, pix.pixCode, pix.transactionId);
    order.transactionId = pix.transactionId;

    emSegundoPlano(
      sendUtmifyOrder({ ...salvo, transactionId: pix.transactionId }, 'waiting_payment')
        .catch((e) => console.error('[api/oferta] UTMify falhou:', e.message)),
      'oferta UTMify');
    emSegundoPlano(
      notificarPixGerado(salvo).catch((e) => console.error('[api/oferta] push falhou:', e.message)),
      'oferta push');
    try {
      const shopifyId = await createShopifyPending(order);
      if (shopifyId) await setShopifyOrderId(id, shopifyId);
    } catch (e) {
      console.error('[api/oferta] pendente Shopify falhou (segue com PIX):', e.message);
    }

    const qrDataUrl = await QRCode.toDataURL(pix.pixCode, { margin: 1, width: 320 });
    res.json({ orderId: id, totalCents: order.totalCents, pix: pix.pixCode, qrDataUrl });
  } catch (e) {
    // A mensagem crua ia direto pro alert do cliente: falha de rede virava
    // "fetch failed" e erro do gateway virava o código dele. Nenhum dos dois
    // diz o que fazer, e os dois soam como produto quebrado. O detalhe fica no
    // log, que é onde ele serve pra alguma coisa.
    console.error('[api/oferta] falha ao gerar o PIX da oferta', req.params.id, '-', e.message);
    res.status(400).json({ error: 'Não foi possível gerar o PIX agora. Tente de novo em alguns segundos.' });
  }
});

// ------------------------------------------------- RECUPERAÇÃO DE ABANDONADO
// Card com o preço da recuperação no lugar do de catálogo — irmão do
// cardDaOferta, e pelo mesmo motivo: o preço que a tela mostra tem que sair do
// mesmo lugar que o backend usa pra cobrar.
function cardDaRecuperacao(p) {
  const c = cardProduct(p);
  const v = c.variants[0];
  if (!v) return c;
  const cheio = v.priceCents;
  return {
    ...c,
    variants: [{
      ...v,
      priceCents: RECUPERACAO.primeiroCents,
      compareCents: cheio > RECUPERACAO.primeiroCents ? cheio : null,
    }],
  };
}

// O que a tela precisa saber do pedido montado. `customer` inteiro NÃO vai:
// nome, CPF, telefone e endereço completo do cliente não têm por que trafegar
// pra desenhar uma página — basta o suficiente pra pessoa reconhecer que é o
// endereço dela ("Rua X, 123 — Joinville").
function resumoDoPedido(m, original) {
  const e = original.customer?.address || original.customer || {};
  const rua = [e.street || e.address1, e.number].filter(Boolean).join(', ');
  return {
    items: m.items.map((it) => ({
      variantId: it.variantId, qty: it.qty, title: it.title, image: it.image || '',
      priceCents: it.priceCents, deCents: it.deCents || null, recuperado: !!it.recuperado,
    })),
    pares: m.pares,
    subtotalCents: m.subtotalCents,
    discountCents: m.discountCents,
    shippingCents: m.shippingCents,
    totalCents: m.totalCents,
    frete: { nome: m.shipping?.name || '', eta: m.shipping?.eta || '' },
    entrega: [rua, e.city].filter(Boolean).join(' — '),
    primeiroNome: String(original.customer?.name || '').trim().split(/\s+/)[0] || '',
  };
}

// GET /api/recuperar/:id — estado da oferta, o pedido remontado e o catálogo
// pro segundo par. Mesma divisão em dois ramos da oferta pós-compra: sem q/col
// vêm as vitrines da home, com q/col vem lista plana de resultado.
router.get('/recuperar/:id', async (req, res) => {
  try {
    const acesso = await abrirRecuperacao(req.params.id, req.query.t);
    if (acesso.erro) {
      // Mesmo motivo do upsell: "não consegui abrir" é a queixa mais comum, e
      // sem log não dá pra separar prazo de token torto de pedido já pago.
      console.warn('[api/recuperar] acesso negado', req.params.id, '-', acesso.erro);
      return res.status(403).json({ error: acesso.erro });
    }
    const original = acesso.order;

    const montado = await montarItens(original, []);
    // Pedido cujos itens sumiram do catálogo (reimport, produto despublicado)
    // não tem oferta: a escada não sabe precificar o que não existe mais.
    if (montado.erro) {
      console.warn('[api/recuperar] sem itens elegíveis', req.params.id, '-', montado.erro);
      return res.status(403).json({ error: 'Os pares deste pedido saíram do catálogo.' });
    }

    const base = {
      restanteMs: acesso.restanteMs,
      primeiroCents: RECUPERACAO.primeiroCents,
      adicionalCents: RECUPERACAO.adicionalCents,
      maxItens: RECUPERACAO.maxItens,
      pedido: resumoDoPedido(montado, original),
    };

    const busca = String(req.query.q || '').trim().toLowerCase();
    const col = String(req.query.col || '').trim();

    if (busca || col) {
      const todos = await produtosDaRecuperacao();
      let lista = todos;
      if (col) {
        const c = await getCollection(col, { limit: 10000 });
        const ok = new Set((c ? c.products : []).map((p) => String(p.id)));
        lista = lista.filter((p) => ok.has(String(p.id)));
      }
      if (busca) lista = lista.filter((p) => String(p.title || '').toLowerCase().includes(busca));

      const limit = Math.max(1, Math.min(48, parseInt(req.query.limit, 10) || 24));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      return res.json({
        ...base,
        titulo: col ? ((await getCollection(col, { limit: 1 })) || {}).title || '' : '',
        total: lista.length,
        products: lista.slice(offset, offset + limit).map(cardDaRecuperacao),
      });
    }

    const elegiveis = new Set((await produtosDaRecuperacao()).map((p) => String(p.id)));
    const soElegiveis = (arr) => (arr || []).filter((p) => elegiveis.has(String(p.id)));

    const [menu, sections, curados] = await Promise.all([
      getMenu({ filtro: (p) => elegiveis.has(String(p.id)) }),
      Promise.all(HOME_FEATURED.map(async (f) => {
        const c = await getCollection(f.handle, {
          limit: 12, priorizarTag: f.priorizar || null, priorizarNomeados: !!f.nomeados,
          intercalar: !!f.intercalar, destaques: DESTAQUES_POR_VITRINE[f.handle] || null,
        });
        if (!c) return null;
        const products = soElegiveis(c.products);
        if (!products.length) return null;
        return { title: f.title, handle: f.handle, total: c.total, products: products.map(cardDaRecuperacao) };
      })),
      getProductsByHandles(MAIS_VENDIDOS.handles),
    ]);

    const destProds = soElegiveis(curados);
    res.json({
      ...base,
      menu,
      destaque: destProds.length
        // sem href, igual à oferta: "ver todos" aqui não pode jogar a pessoa em
        // /colecao, que mostra os mesmos pares pelo preço cheio
        ? { title: MAIS_VENDIDOS.title, subtitle: MAIS_VENDIDOS.subtitle, products: destProds.map(cardDaRecuperacao) }
        : null,
      sections: sections.filter(Boolean),
    });
  } catch (e) {
    console.error('[api/recuperar]', e.message);
    res.status(502).json({ error: 'Não foi possível carregar a oferta.' });
  }
});

// POST /api/recuperar/:id — cria o pedido NOVO da recuperação e devolve o PIX.
//
// Pedido novo, nunca o antigo: o abandonado já tem `pix_code` gravado no valor
// cheio. Reaproveitá-lo faria a pessoa ver R$ 79 na tela e ser cobrada R$ 99 —
// e o PIX não deixa reemitir cobrança no mesmo código, cada valor exige QR novo.
router.post('/recuperar/:id', async (req, res) => {
  try {
    const acesso = await abrirRecuperacao(req.params.id, req.body?.t);
    if (acesso.erro) {
      console.warn('[api/recuperar] recusado', req.params.id, '-', acesso.erro);
      return res.status(403).json({ error: acesso.erro });
    }
    const original = acesso.order;

    const extras = Array.isArray(req.body?.extras) ? req.body.extras : [];
    const m = await montarItens(original, extras);
    if (m.erro) return res.status(400).json({ error: m.erro });

    const id = crypto.randomBytes(8).toString('hex');
    const postbackToken = crypto.randomBytes(24).toString('hex');
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = xff || req.socket?.remoteAddress || '';

    const order = {
      id,
      postbackToken,
      currency: config.currency,
      subtotalCents: m.subtotalCents,
      discountCents: m.discountCents,
      shippingCents: m.shippingCents,
      totalCents: m.totalCents,
      // Endereço, CPF e telefone saem do pedido abandonado — é o que dispensa
      // a pessoa de digitar tudo de novo e o que faz a oferta ser um clique.
      customer: original.customer,
      items: m.items,
      shipping: m.shipping,
      fb: { ...(original.fb || {}), ip, userAgent: req.headers['user-agent'] || '' },
      // A campanha que trouxe o abandono é a mesma que traz a recuperação: sem
      // isto a venda apareceria como orgânica e a campanha levaria o custo sem
      // levar o crédito.
      tracking: original.tracking || {},
      transactionId: null,
      // Vínculo com o abandonado: é o que separa venda recuperada de venda
      // normal no painel e o que alimenta o funil de recuperação.
      recuperadoDe: original.id,
    };

    const salvo = await createOrder(order);

    const gatewayId = activeGatewayId();
    const pix = await createPayment({
      orderId: id,
      amountCents: order.totalCents,
      shippingCents: order.shippingCents,
      description: `Pedido ${id} - ${config.lojaNome}`,
      notificationUrl: `${config.appUrl}/webhooks/${gatewayId}?token=${postbackToken}`,
      ip,
      customer: order.customer,
    });
    await setPix(id, pix.pixCode, pix.transactionId);
    order.transactionId = pix.transactionId;

    emSegundoPlano(
      sendUtmifyOrder({ ...salvo, transactionId: pix.transactionId }, 'waiting_payment')
        .catch((e) => console.error('[api/recuperar] UTMify falhou:', e.message)),
      'recuperar UTMify');
    emSegundoPlano(
      notificarPixGerado(salvo).catch((e) => console.error('[api/recuperar] push falhou:', e.message)),
      'recuperar push');
    try {
      const shopifyId = await createShopifyPending(order);
      if (shopifyId) await setShopifyOrderId(id, shopifyId);
    } catch (e) {
      console.error('[api/recuperar] pendente Shopify falhou (segue com PIX):', e.message);
    }

    const qrDataUrl = await QRCode.toDataURL(pix.pixCode, { margin: 1, width: 320 });
    res.json({ orderId: id, totalCents: order.totalCents, pix: pix.pixCode, qrDataUrl });
  } catch (e) {
    console.error('[api/recuperar] falha ao gerar o PIX', req.params.id, '-', e.message);
    res.status(400).json({ error: 'Não foi possível gerar o PIX agora. Tente de novo em alguns segundos.' });
  }
});

// DEV: simula pagamento (só com DEV_TOOLS=1)
router.post('/dev/pay/:id', async (req, res) => {
  if (!config.devTools) return res.status(404).end();
  const r = await markOrderPaid(req.params.id);
  res.json(r);
});

export default router;
