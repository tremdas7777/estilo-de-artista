import config from '../config.js';
import { getSetting, setSetting } from '../db.js';
import { isHex } from './cores.js';

const KEY = 'checkout_customization';

// Padrões = visual/comportamento atual (garante zero regressão se nada foi salvo).
export function defaults() {
  return {
    // Cores da LOGO (13/09/2026), medidas na arte original: brand = o rosa do
    // "ESTILO", volt = o amarelo-neon do "DE ARTISTA". O volt é fundo de botão
    // com texto escuro E texto sobre fundo escuro, então tem que ser claro — e
    // é. black = preto neutro, o fundo em que a logo foi desenhada (o #0b0a0f
    // da A Fonte puxava para o roxo). Roxo da A Fonte: '#4d2a85' / '#a8cc2e'.
    // Desde 13/09/2026 (pedido do dono: "use a cor da logo para a loja") o
    // selo de desconto é amarelo; o preço foi rosa até 21/09/2026, quando
    // passou para o verde do botão de compra. Verde sobra onde é
    // SINAL (WhatsApp, PIX) e nos BOTÕES DE COMPRA, que o dono pediu verdes —
    // ver checkout.botao logo abaixo.
    colors: { brand: '#f10769', volt: '#d5e607', black: '#0a0a0a' },

    // Paleta do checkout. Os valores são exatamente os que estavam cravados na
    // folha `.ck` antes de virarem token — quem nunca abrir o /admin continua
    // vendo a mesma tela. `linha` gera sozinha as versões suave e forte
    // (divisórias e borda tracejada), senão seriam três seletores de cor para
    // dizer a mesma coisa.
    checkout: {
      bg: '#f2f3f5',      // fundo da página
      card: '#ffffff',    // fundo dos cartões e dos campos
      tinta: '#1a1a1a',   // texto principal e números
      cinza: '#6b7280',   // texto secundário
      linha: '#dddddd',   // bordas
      // TODO botão de compra da loja: Comprar agora, Adicionar ao carrinho,
      // Finalizar compra, Ir para o pagamento e Comprar (pedido do dono em
      // 13/09/2026: "todos os botões de compra na cor verde"). É o verde do
      // checkout da A Fonte (#0f9d58) fechado até o texto branco passar de
      // 4,5:1. Em 21/09/2026 o dono pediu "um verde mais forte": saiu o
      // #0d874c e entrou este, mais vivo (o branco fica em 3,6:1, e o texto do
      // botão é grande e em negrito). Desde então os PREÇOS (vitrine, produto,
      // carrinho e total do checkout) também usam esta cor, via --comprar.
      // "Grátis" e selos continuam rosa e amarelo, da logo.
      botao: '#009c3b',
    },

    // Estrutura. Trocam o arranjo sem trocar o código do checkout.
    layout: {
      resumo: 'lado',          // lado | topo | recolhivel  (só vale no desktop)
      cantos: 'arredondado',   // arredondado | reto
      cronometro: false,       // barra preta de contagem regressiva
      // Desligada nesta loja a pedido do dono (27/08/2026). Continua existindo
      // como opção: /admin → Personalizar → "Faixa de garantias" religa, e o
      // texto dela é o campo `topbar` logo abaixo. O padrão é aqui, e não só
      // no banco, porque a personalização salva morre num reset de disco no
      // Render — e a faixa voltaria sozinha.
      trust: false,            // faixa de garantias
      // LOJA_DEPOIMENTOS=0 continua valendo como padrão: é assim que a Knife
      // Lab desliga depoimentos hoje, e trocar isso mudaria a loja dela.
      depoimentos: process.env.LOJA_DEPOIMENTOS !== '0',
      lgpd: true,              // bloco "usamos seus dados para..."
    },

    // Logo enviada pelo /admin (data URI). Vazio = usa a de variável de
    // ambiente, que é como Nation e Knife Lab funcionavam antes.
    logo: { escura: '', clara: '' },

    // Faixa de confiança do checkout: itens separados por "·", só fato
    // verificável (as regras inteiras estão em CONFIANCA, src/views/pages.js).
    topbar: 'Garantia de 7 dias · Compra segura · Enviamos com código de rastreio',
    shipping: config.shipping.options.map((o) => ({ ...o })),
    // Order bumps: ofertas marcáveis na etapa de pagamento. Lista, e não um
    // objeto só: são ofertas diferentes para o mesmo carrinho.
    // `priceCents` é o preço DA OFERTA; o preço cheio sai do catálogo, então
    // o card mostra "de/por" sozinho.
    //
    // São os MESMOS três que a Drip de Rua tem no ar — lidos do /api/bumps do
    // checkout dela (dripderuacheckout.shop) em 13/09/2026 —, com os preços de
    // lá, a pedido do dono. Os da A Fonte (óculos Juliet, Sneaker Guard) eram
    // produtos da Nation, que aqui não existem — e bump com id que não resolve
    // no catálogo NÃO dá erro: o cartão só não monta e a oferta some sem aviso.
    //
    // Ficam no código, e não só no banco, porque a personalização salva morre
    // num reset de disco no Render, e aí os bumps sumiriam do checkout sem
    // ninguém perceber. O /admin → Personalizar → Order bumps continua ganhando
    // daqui e é onde se mexe no dia a dia.
    //
    // `image` vazio de propósito: o card cai na foto do próprio produto no
    // catálogo, então trocar a foto do produto não deixa o bump para trás.
    //
    // O item entra no pedido pelo preço CHEIO do catálogo e a diferença vai
    // para a linha de desconto — é o que faz o total do PIX bater. E o bump é
    // somado DEPOIS da promo, então nunca conta como par para os 2 por R$ 149.
    orderBumps: [
      {
        // Drip: R$ 39,90, o preço cheio — lá o bump é conveniência, não oferta.
        enabled: true,
        title: 'Impermeabilizante de Tênis',
        description: 'Protege contra água, lama e manchas — seu tênis novo por muito mais tempo',
        image: '',
        variantId: 'impermeabilizante-de-tenis-sneakers::unico',
        priceCents: 3990,
      },
      {
        // Com GRADE (P ao GG): o `variantId` é só o tamanho que já vem no
        // seletor; o cliente troca por qualquer outro do MESMO produto, e o
        // servidor aceita exatamente essa família (laço de bumps em
        // routes/checkoutApi.js). É a calça de R$ 59,90 da Drip — NÃO a outra
        // "CALÇA CARGO PRETA (sarja premium)", de R$ 79,90, que tem o mesmo nome
        // no catálogo (handle com "-1").
        enabled: true,
        title: 'Calça Cargo Preta (sarja premium)',
        description: 'Sarja premium, caimento reto — escolha seu tamanho',
        image: '',
        variantId: 'calca-cargo-preta-sarja-premium::m',
        priceCents: 5990,
      },
      {
        // Um par a mais por R$ 79,00, o preço que a Drip pratica neste bump. O
        // texto de lá ("leve pela METADE do preço") NÃO veio: aqui o par custa
        // R$ 99 e R$ 79 não é metade — e o que se anuncia vira obrigação (CDC,
        // art. 30). Tamanho pré-escolhido 40 (a Drip deixa o 34, o primeiro da
        // lista); o cliente troca no seletor.
        enabled: true,
        title: 'Tesla Coil Pro Preto Refletivo',
        description: 'Só aqui no checkout: leve mais um par por R$ 79,00',
        image: '',
        variantId: 'tesla-coil-pro-preto-refletivo::40',
        priceCents: 7900,
      },
    ],
  };
}

// Teto de bumps. Não é limite técnico: cada um é um checkbox na etapa de
// pagamento, e a partir daí a tela vira lista de compras em vez de oferta.
export const MAX_BUMPS = 4;

// Um bump normalizado. `variantId` aceita o id do catálogo local
// (`handle::opcao`) e o numérico antigo da Shopify — ver o campo no /admin.
function normalizaBump(b) {
  return {
    enabled: !!b?.enabled,
    title: String(b?.title ?? '').slice(0, 120),
    description: String(b?.description ?? '').slice(0, 200),
    image: String(b?.image ?? '').trim(),
    variantId: String(b?.variantId ?? '').trim().replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 200),
    priceCents: Math.max(0, parseInt(b?.priceCents, 10) || 0),
  };
}

// Aceita tanto a lista nova quanto o `orderBump` único que existia antes.
// A migração mora aqui e não num script porque a configuração vive no banco
// de cada loja: quem já tinha um bump salvo não pode perdê-lo num deploy.
export function lerBumps(c) {
  const lista = Array.isArray(c?.orderBumps) ? c.orderBumps
    : (c?.orderBump ? [c.orderBump] : []);
  return lista
    .map(normalizaBump)
    .filter((b) => b.variantId)
    .slice(0, MAX_BUMPS);
}

const cor = (v, fb) => (isHex(v) ? v : fb);
const umDe = (v, lista, fb) => (lista.includes(String(v)) ? String(v) : fb);
// Só data URI de imagem, e com teto: a logo mora no banco, e um arquivo grande
// engordaria todo backup e toda leitura de settings.
const LOGO_MAX = 700 * 1024;
const dataUri = (v) => {
  const s = String(v || '');
  if (!s) return '';
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s)) return '';
  return s.length > LOGO_MAX ? '' : s;
};

// Personalização "de mentira", válida só durante uma renderização — é o que
// deixa a prévia do /admin mostrar seções ligadas que ainda não foram salvas
// (uma seção desligada não existe no HTML, então CSS nenhum a faria aparecer).
//
// Funciona porque renderizar página aqui é SÍNCRONO do começo ao fim: entre o
// set e o clear não existe await, então não há duas renderizações no ar ao
// mesmo tempo. Se um dia a renderização virar assíncrona, isto vaza de um
// visitante para outro — por isso o guarda abaixo estoura na hora.
let overrideAtual = null;

export function comCustomizacao(cx, render) {
  if (overrideAtual) throw new Error('comCustomizacao aninhado: renderização deixou de ser síncrona');
  overrideAtual = cx;
  try {
    const saida = render();
    if (saida && typeof saida.then === 'function') {
      throw new Error('comCustomizacao recebeu Promise: a prévia só funciona com render síncrono');
    }
    return saida;
  } finally {
    overrideAtual = null;
  }
}

export function getCustomization() {
  if (overrideAtual) return overrideAtual;
  const d = defaults();
  const raw = getSetting(KEY, null);
  if (!raw) return d;
  try {
    const c = JSON.parse(raw);
    const ck = c?.checkout || {};
    const lay = c?.layout || {};
    // `??` e não `||`: false é resposta válida para as chaves de liga-desliga,
    // e com `||` desligar uma seção voltaria sozinho ao padrão na releitura.
    const bool = (v, fb) => (typeof v === 'boolean' ? v : fb);
    return {
      colors: {
        brand: cor(c?.colors?.brand, d.colors.brand),
        volt: cor(c?.colors?.volt, d.colors.volt),
        black: cor(c?.colors?.black, d.colors.black),
      },
      checkout: {
        bg: cor(ck.bg, d.checkout.bg),
        card: cor(ck.card, d.checkout.card),
        tinta: cor(ck.tinta, d.checkout.tinta),
        cinza: cor(ck.cinza, d.checkout.cinza),
        linha: cor(ck.linha, d.checkout.linha),
        botao: cor(ck.botao, d.checkout.botao),
      },
      layout: {
        resumo: umDe(lay.resumo, ['lado', 'topo', 'recolhivel'], d.layout.resumo),
        cantos: umDe(lay.cantos, ['arredondado', 'reto'], d.layout.cantos),
        cronometro: bool(lay.cronometro, d.layout.cronometro),
        trust: bool(lay.trust, d.layout.trust),
        depoimentos: bool(lay.depoimentos, d.layout.depoimentos),
        lgpd: bool(lay.lgpd, d.layout.lgpd),
      },
      logo: {
        escura: dataUri(c?.logo?.escura),
        clara: dataUri(c?.logo?.clara),
      },
      topbar: typeof c.topbar === 'string' ? c.topbar : d.topbar,
      shipping: Array.isArray(c.shipping) && c.shipping.length
        ? c.shipping.map((o, i) => ({
            id: String(o.id || `frete${i + 1}`),
            name: String(o.name || 'Frete'),
            cents: Math.max(0, parseInt(o.cents, 10) || 0),
            eta: String(o.eta || ''),
          }))
        : d.shipping,
      orderBumps: lerBumps(c),
    };
  } catch {
    return d;
  }
}

export function saveCustomization(obj) {
  setSetting(KEY, JSON.stringify(obj));
}

// Volta a aparência ao padrão sem apagar frete e order bumps, que são
// configuração de venda e não de visual — quem clica em "restaurar padrão"
// quer desfazer a cor errada, não perder os fretes cadastrados.
export function resetVisual() {
  const atual = getCustomization();
  const d = defaults();
  saveCustomization({ ...atual, colors: d.colors, checkout: d.checkout, layout: d.layout, logo: d.logo });
}

export default { defaults, getCustomization, saveCustomization, resetVisual, comCustomizacao, lerBumps, MAX_BUMPS };
