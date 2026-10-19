import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { getCustomization } from '../checkout/customization.js';
import { hexRgb, darken, softTint, tintaLegivel } from '../checkout/cores.js';
import { getContato, formatarWhatsapp as zapFormatado, linkWhatsapp } from '../checkout/contato.js';
import { linksLegais, renderLegal } from './legal-docs.js';
// O hero mostra um par DE VERDADE do catálogo, e a curadoria de qual par é a
// que já existe (Mais Vendidos). Nada de foto escolhida à mão aqui.
import { getProductsByHandles, imagemNaLargura } from '../checkout/products.js';
import { CURADAS } from '../checkout/collections.js';
import { availableShipping } from '../checkout/catalog.js';

// --- helpers de cor (deriva tons a partir da cor da marca) ---
// Moraram aqui até a personalização passar a derivar tons também; agora vêm de
// checkout/cores.js para não existirem duas cópias das mesmas contas.
const escHtml = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

// Identidade da loja no CHECKOUT. Sai por variável de ambiente para este mesmo
// código atender mais de uma loja — um serviço por loja no Render, cada um com
// o seu disco e as suas chaves. Os padrões são os desta loja (Estilo de Artista).
//
// `logo` nasce VAZIA, ao contrário da instalação de origem, e é de propósito:
// esta cópia não tem arte de marca nenhuma no repositório. Sem arquivo,
// `marcaHtml()` escreve o nome da loja em texto — assim o topo nunca fica vazio
// nem serve a arte de outra loja por engano. Quando a arte existir, o caminho é
// o /admin → Personalizar (ela passa a morar no banco); LOJA_LOGO é a reserva.
const LOJA = {
  nome: process.env.LOJA_NOME || 'Estilo de Artista',
  nomeCompleto: process.env.LOJA_NOME_COMPLETO || 'Estilo de Artista',
  logo: process.env.LOJA_LOGO || '',
  // Segunda arte, para o painel do resumo, que tem fundo BRANCO. Logo de tinta
  // clara some ali. Quem tem uma arte que funciona nos dois fundos não precisa
  // definir: cai na de cima.
  logoFundoClaro: process.env.LOJA_LOGO_CLARO || process.env.LOJA_LOGO || '',
  // depoimentos são conteúdo de uma loja só; LOJA_DEPOIMENTOS=0 desliga.
  // Nesta loja começa DESLIGADO: as fotos e os textos que vinham no código eram
  // de clientes reais e identificáveis da loja de origem, autorizados por ela.
  // Religar = preencher DEPOIMENTOS com prints DESTA loja e tirar a variável.
  depoimentos: process.env.LOJA_DEPOIMENTOS !== '0',
  // Perfil do Instagram. VAZIO = a seção do Instagram some da home, em vez de
  // mandar o cliente desta loja para o perfil de outra.
  instagram: process.env.LOJA_INSTAGRAM || '',
  // Foto da seção "Quem é". VAZIA = o bloco vira uma coluna só de texto.
  fotoSobre: process.env.LOJA_FOTO_SOBRE || '',
};

// O topo da home só existe se a arte existir. Sem ela, o <picture> desenhava
// um retângulo preto de 1586px com o texto alternativo dentro — trava que
// nasceu na Nação 13. Medido uma vez, no carregamento: a arte é arquivo
// versionado, não muda em produção sem deploy.
const RAIZ_APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEM_BANNER = fs.existsSync(join(RAIZ_APP, 'assets', 'banner-principal-mobile.webp'));

// Carimba ?v= com a data do arquivo nas artes servidas de /assets. O /assets
// tem cache de 7 dias: sem isto, trocar o banner ou a logo mantendo o nome
// deixaria quem já visitou vendo a arte velha por uma semana — aconteceu aqui,
// na troca do banner provisório pelo banner com a logo (13/09/2026). Mesma
// saída da Nação 13. Guardado por caminho: a data só muda com deploy novo.
const VERSOES = new Map();
function comVersao(caminho) {
  if (!caminho || !caminho.startsWith('/assets/') || caminho.includes('?')) return caminho;
  if (!VERSOES.has(caminho)) {
    let v = '';
    try { v = Math.round(fs.statSync(join(RAIZ_APP, caminho)).mtimeMs).toString(36); } catch { /* sem arquivo: vai sem versão */ }
    VERSOES.set(caminho, v ? `${caminho}?v=${v}` : caminho);
  }
  return VERSOES.get(caminho);
}
// Chapas de campanha: fundo das seções escuras. São TEXTURA, não conteúdo —
// entram por CSS, atrás do texto, e a seção continua legível se não carregarem
// (a cor de fundo está declarada embaixo). Geradas no Kairo, sem produto e sem
// texto dentro: nada de preço ou nome desenhado em imagem.
const CHAPA_CONCRETO = comVersao('/assets/campanha-concreto.webp');
const CHAPA_LUZ = comVersao('/assets/campanha-luz.webp');
const BANNER_DESKTOP = comVersao('/assets/banner-principal-desktop.webp');
const BANNER_MOBILE = comVersao('/assets/banner-principal-mobile.webp');
// Segundo slide do topo, "Compre com segurança" (arte do dono, 17/09/2026):
// o Instagram da loja mostrado por dentro — o mesmo que a fileira de selos diz
// em texto, dito na arte. Só entra se as DUAS versões existirem; faltando uma,
// o topo volta a ser a arte única da promoção, sem bolinhas e sem setas, como
// era antes (a home não pode depender de arquivo que talvez não subiu).
const TEM_SLIDE_SEG = ['desktop', 'mobile']
  .every((v) => fs.existsSync(join(RAIZ_APP, 'assets', `banner-seguranca-${v}.webp`)));
const BANNER_SEG_DESKTOP = TEM_SLIDE_SEG ? comVersao('/assets/banner-seguranca-desktop.webp') : '';
const BANNER_SEG_MOBILE = TEM_SLIDE_SEG ? comVersao('/assets/banner-seguranca-mobile.webp') : '';
// Arte do Instagram no meio da home (arte do dono, 17/09/2026): o print do
// perfil com o texto e o botão JÁ DESENHADOS dentro. Quando ela existe, entra
// no lugar do painel + coluna de texto da seção — repetir ao lado o que a arte
// diz em letra grande é a mesma duplicação que tirou a logo do topo do
// checkout. Sem o arquivo, a seção volta ao painel desenhado com o texto.
const ARTE_INSTA = fs.existsSync(join(RAIZ_APP, 'assets', 'banner-instagram.webp'))
  ? comVersao('/assets/banner-instagram.webp') : '';
// Banner do checkout, "Compra segura" (arte do dono, 14/09/2026): uma versão
// larga para o computador e uma 2:1 para o celular. As duas já trazem a logo,
// então o banner ENTRA NO LUGAR do topo com a logo — duas logos seguidas, e o
// e-mail caía abaixo da dobra num notebook. Sem os arquivos, volta a logo.
const TEM_BANNER_CK = ['desktop', 'mobile']
  .every((v) => fs.existsSync(join(RAIZ_APP, 'assets', `banner-checkout-${v}.webp`)));
const BANNER_CK_DESKTOP = TEM_BANNER_CK ? comVersao('/assets/banner-checkout-desktop.webp') : '';
const BANNER_CK_MOBILE = TEM_BANNER_CK ? comVersao('/assets/banner-checkout-mobile.webp') : '';

// Os números da oferta, já escritos, para o banner do topo da home.
//
// Saem de config.promo — as MESMAS contas que o carrinho e o servidor fazem —
// e não de texto cravado: com o preço vindo de variável de ambiente
// (PROMO_ELIGIBLE_PRICE_CENTS, PROMO_NUM, PROMO_DEN), um valor escrito na mão
// passaria a mentir no primeiro reajuste, e o cliente veria um número no topo e
// outro no checkout. Ver src/checkout/promo.js: computeDiscount.
//
// ATENÇÃO: desde que o slide 1 virou arte, o preço dos 2 pares está CRAVADO dentro do
// PNG — o cálculo só alcança o texto alternativo. Mexeu em PROMO_*? a arte
// (assets/banner-principal-desktop.webp e -mobile.webp) precisa ser reexportada
// junto, senão o topo anuncia um preço e o carrinho cobra outro.
const PRECO = (() => {
  const { eligiblePriceCents: unit, minQty, num, den } = config.promo;
  const cheio = unit * minQty;
  const economia = Math.round((cheio * num) / den);
  const brl = (c) => (c / 100).toFixed(2).replace('.', ',');
  return { unit: brl(unit), dupla: brl(cheio - economia), economia: brl(economia), minQty };
})();

// Endereço da logo. A enviada pelo /admin mora no banco e é servida por
// /marca/logo.png; sem ela, cai na variável de ambiente, que é como Nation e
// Knife Lab funcionavam antes. O `?v=` muda quando a arte muda — sem ele o
// navegador continuaria mostrando a logo antiga por causa do cache de 7 dias.
// Exportada porque o e-mail de confirmação precisa da MESMA arte da loja —
// duas cópias da regra dariam num e-mail com a logo antiga depois de trocar a
// arte no /admin. Lá o endereço vira absoluto (cliente de e-mail não resolve
// caminho relativo).
export function logoDaLoja(cx, fundo) {
  const dataUri = fundo === 'clara' ? (cx.logo.clara || cx.logo.escura) : cx.logo.escura;
  // Sem arte no banco E sem arquivo configurado, devolve string vazia — e quem
  // chama tem que tratar isso. É o estado inicial desta loja: melhor nada do
  // que um <img> quebrado ou a arte de outra marca.
  if (!dataUri) return comVersao(fundo === 'clara' ? LOJA.logoFundoClaro : LOJA.logo);
  const arquivo = fundo === 'clara' ? 'logo-claro' : 'logo';
  return `/marca/${arquivo}.png?v=${versaoDaLogo(dataUri)}`;
}

// A marca do jeito que ela aparece na página: a arte quando existe, e o nome da
// loja escrito quando não existe.
//
// Existe porque `logoDaLoja` devolve um ENDEREÇO, e endereço vazio dentro de um
// <img src=""> vira ícone de imagem quebrada — pior do que não ter logo. Aqui a
// decisão "tem arte?" acontece UMA vez, e os três lugares que mostram a marca
// (topo da vitrine, rodapé e topo do checkout) passam por ela.
//
// `cls` é a classe que já posicionava o <img> em cada lugar; o texto herda a
// mesma classe pra ocupar exatamente o mesmo espaço, e ganha `marca-tx` pra
// receber o tamanho de fonte. Fundo claro pinta escuro, fundo escuro pinta claro.
export function marcaHtml(cx, fundo, cls = '') {
  const src = logoDaLoja(cx, fundo);
  const alt = escHtml(LOJA.nomeCompleto);
  if (src) return `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="${alt}">`;
  const tom = fundo === 'clara' ? ' marca-tx--escura' : '';
  return `<span class="${cls ? cls + ' ' : ''}marca-tx${tom}">${escHtml(LOJA.nome)}</span>`;
}

// Assinatura curta e estável do conteúdo: soma deslizante sobre a string do
// data URI. Não precisa ser criptográfica — só precisa mudar quando a arte muda.
function versaoDaLogo(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

// ------------------------------------------- faixa de confiança do checkout
// Fica logo abaixo do cronômetro, em fundo CLARO. A barra de cima já é escura;
// duas faixas fortes seguidas viram uma parede antes do primeiro campo.
//
// Regras para escrever cada item:
//  • Só FATO VERIFICÁVEL, nunca adjetivo. "Compra 100% segura" não diz nada e
//    ainda soa defensivo — quem precisa jurar que é seguro levanta a dúvida.
//  • O CDC (art. 30) transforma o que está anunciado em obrigação. "Devolução
//    em até 7 dias" é segura porque já é o direito de arrependimento do art. 49:
//    a loja é obrigada a isso de qualquer jeito.
//  • NUNCA selo que a loja não tem de verdade (Reclame Aqui, Site Blindado,
//    cadeado SSL desenhado). Dá processo e derruba conta de anúncio.
//  • Lista vazia faz a faixa sumir por inteiro.
//
// É texto, não imagem, de propósito: uma tarja de selos custa ~200px de altura
// e empurra o primeiro campo para baixo da dobra no celular, que é de onde vem
// quase toda a venda. Assim a faixa ocupa 40px.
//
// O lojista edita isto no /admin (campo "faixa do topo"), separando por "·";
// a lista abaixo é o que aparece enquanto ninguém tiver mexido lá.
const CONFIANCA = ['Garantia de 7 dias', 'Compra segura', 'Enviamos com código de rastreio'];

// ------------------------------------------------- cronômetro da oferta
// Barra escura grudada no topo, contando HORAS : MIN : SEG.
//
// AVISO, antes de aumentar isto: um relógio que reinicia a cada visita não
// marca prazo nenhum. O CDC (art. 37) trata oferta com prazo inexistente como
// publicidade enganosa, e o Facebook reprova anúncio pelo mesmo motivo. Se a
// promoção tiver hora real de acabar, o certo é contar até ela — troque
// `minutos` por um `terminaEm` com data fixa e ajuste o cálculo no script.
//
// Para desligar sem apagar nada: `ativo: false`.
const CRONOMETRO = {
  ativo: false,
  minutos: 15,
  titulo: 'OFERTA TERMINA EM',
  // O prazo é gravado na sessão do navegador: sem isso o contador voltaria a
  // 15:00 a cada recarga, e a mesma pessoa veria "o tempo acabando" três vezes
  // na mesma visita — que é a versão mais óbvia da mentira acima.
};

// __CFG injetado no front (lê a personalização salva).
// Serialização segura para JOGAR DENTRO de <script>.
//
// JSON.stringify NÃO escapa "/", então uma string com a tag de fechamento
// de script dentro fecha a tag antes da hora, e o que vem depois o navegador
// lê como HTML. Os valores abaixo saem da URL: sem isto, qualquer um montava
// um link que executava JavaScript na origem da loja — capturando o que o
// cliente digita no checkout, ou trocando o QR do PIX.
//
// Escapar "<" mata o vetor na fonte e não muda o valor: \u003c volta a ser
// o mesmo caractere depois do JSON.parse do navegador.
const jsonSeguro = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function buildCfg(cx) {
  return jsonSeguro({
    pixelId: config.facebook.pixelId || '',
    currency: config.currency,
    appUrl: config.appUrl,
    promo: config.promo,
    loja: LOJA.nome,
    shipping: { options: cx.shipping },
    bumps: cx.orderBumps
      .filter((b) => b.enabled && b.variantId)
      .map((b) => ({ title: b.title, description: b.description, image: b.image, variantId: b.variantId, priceCents: b.priceCents })),
  });
}

// Snippet base do Pixel (init + PageView). Só injeta se houver PIXEL_ID.
function pixelSnippet() {
  if (!config.facebook.pixelId) return '';
  return `<script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','${config.facebook.pixelId}');fbq('track','PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=${config.facebook.pixelId}&ev=PageView&noscript=1"/></noscript>`;
}

// UTMify (atribuição de campanha). O snippet que eles entregam vem ofuscado
// (base64 + XOR) só para esconder o pixelId de quem copia o HTML; por dentro
// ele faz exatamente estas duas linhas. Aqui fica em claro para continuar
// legível e auditável — o id é público de qualquer jeito, sai no HTML.
function utmifySnippet() {
  if (!config.utmify.pixelId) return '';
  // São dois: o pixel identifica a conta e registra a conversão; o utms guarda
  // os utm_* que vieram do anúncio e os carrega até o checkout. Sem o segundo a
  // venda chega sem campanha, que é o dado pelo qual se usa a ferramenta.
  return `<script>window.pixelId=${JSON.stringify(config.utmify.pixelId)};</script>
  <script async defer src="https://cdn.utmify.com.br/scripts/pixel/pixel.js"></script>
  <script async defer src="https://cdn.utmify.com.br/scripts/utms/latest.js"
    data-utmify-prevent-xcod-sck data-utmify-prevent-subids></script>`;
}

const BASE_CSS = `
  :root{
    /* ---- sistema de movimento da loja INTEIRA ----
       Nasceu no carrinho lateral e subiu para cá: header, hero, vitrines,
       cards, página de produto e drawer passam a falar a mesma língua. Três
       velocidades (microinteração, componente, movimento especial) e três
       curvas. Nada é linear e nada é infinito, fora a flutuação do hero, que
       para quando sai da tela. Os nomes --sac-* do carrinho apontam para
       estes: uma definição só, dois vocabulários. */
    --mo-micro:170ms;--mo-comp:380ms;--mo-hero:560ms;
    --ez-out:cubic-bezier(.22,.61,.36,1);
    --ez-in:cubic-bezier(.55,.06,.68,.19);
    --ez:cubic-bezier(.32,.72,0,1);
    /* altura do header, medida no JS. O valor daqui é o de fábrica e existe
       para o hero já nascer no lugar certo, sem pulo depois da medição. */
    --hdr-h:62px;
    /* ---------- tema (Your Next Store) ----------
       Branco, tipografia de sistema e quase nenhuma cor: o produto é a única
       coisa colorida da tela. Os tons abaixo foram MEDIDOS no demo do YNS, e
       não estimados — fundo branco puro, tinta #070707, título #111827,
       texto de apoio #4b5563, linha #e5e5e5, raio 10px.
       As cores da MARCA (--brand, --volt) continuam existindo e continuam
       saindo do /admin: elas ficam para o logo e para os avisos, não para a
       moldura do site. */
    --bg:#ffffff;--card:#fff;--ink:#070707;--soft:#4b5563;--line:#e5e5e5;
    --titulo:#111827;--tile:#f5f5f5;
    --black:#0a0a0a;--brand:#f10769;--brand-d:#bc0552;--brand-soft:#fee6f0;--brand-rgb:241,7,105;
    /* Preto da interface: é ELE que pinta botão, não a cor da marca. */
    --acao:#070707;--acao-h:#262626;
    /* Vermelho de desconto. Fica FORA do preto da interface de propósito: ele
       não é decoração de tema, é sinal de preço abaixado, e num tema onde tudo
       é preto e branco é justamente a única cor que precisa saltar. Branco por
       cima passa contraste de sobra. */
    --promo:#dc2626;
    /* verde de "confirmar/economia": botão do checkout, preços e selo do carrinho.
       Fica fora do colorVars do /admin de propósito — é cor de status, não de marca. */
    --green:#1e9e4f;--green-d:#188542;
    --volt:#d5e607;--radius:10px
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    /* Pilha do sistema, igual ao YNS. Some junto o request do Google Fonts:
       a fonte passa a ser a que o aparelho já tem, sem espera e sem FOUT. */
    font-family:-apple-system,system-ui,"Segoe UI",Roboto,"Helvetica Neue",
      "Noto Sans",Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
    line-height:1.5;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  /* Peso e entrelinha, e NÃO cor. Título herda a tinta de quem o contém: em
     seção clara vem do body, em seção escura vem do #fff dela. Fixar a cor
     aqui apagou a headline do hero — preto sobre preto — e apagaria junto os
     títulos do rodapé, da vitrine em destaque e das seções de campanha. */
  h1,h2,h3{letter-spacing:-.025em;font-weight:700}
  img{display:block;max-width:100%}
  a{color:var(--ink);text-decoration:none}
  h1{font-size:22px;margin:16px 0 6px}
  .wrap{max-width:1060px;margin:0 auto;padding:18px 16px 80px}
  .muted{color:var(--soft);font-size:14px}
  /* Subtítulo de seção: 18px em cinza médio, como o "Stripe-native…" do YNS. */
  .sub{color:var(--soft);font-size:16px;line-height:1.55;margin:6px 0 0}
  @media(min-width:760px){.sub{font-size:18px}}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius)}
  /* Tile do produto: cinza claríssimo, raio 10, SEM sombra e SEM borda. É o
     recipiente que o YNS usa para toda foto de produto. */
  .tile{background:var(--tile);border-radius:10px;overflow:hidden}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;
    cursor:pointer;font:inherit;font-weight:500;border-radius:999px;padding:14px 24px;
    transition:background var(--mo-micro) ease}
  .btn--primary{background:var(--acao);color:#fff;width:100%;font-size:15px;font-weight:500;
    border-radius:999px;box-shadow:none}
  .btn--primary:hover{background:var(--acao-h)}
  .btn--primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
  .btn--ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
  select{width:100%;height:48px;padding:0 12px;border:1.5px solid var(--line);
    border-radius:12px;font:inherit;background:#fff;color:var(--ink)}
  input{width:100%;min-width:0;height:54px;padding:0 14px 0 44px;border:1.5px solid var(--line);
    border-radius:13px;font:inherit;font-size:15px;background:#fff;color:var(--ink)}
  input::placeholder{color:#a7a3b0}
  input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
  /* ---------- entrada das seções ----------
     Uma seção não "aparece": ela chega. Mas NÃO todas do mesmo jeito — quatro
     gestos, escolhidos por seção, para a página ter ritmo em vez de um desfile
     de fade-up. Quem entra por onde está escrito no data-rev do HTML.
     O --i escalona filhos dentro do mesmo bloco. */
  .js [data-rev]{opacity:0;transition:opacity var(--mo-comp) var(--ez-out),
    transform var(--mo-comp) var(--ez-out);transition-delay:calc(var(--i,0)*70ms)}
  .js [data-rev=up]{transform:translate3d(0,22px,0)}
  .js [data-rev=left]{transform:translate3d(-26px,0,0)}
  .js [data-rev=right]{transform:translate3d(26px,0,0)}
  .js [data-rev=zoom]{transform:scale(.95)}
  .js [data-rev=mask]{clip-path:inset(0 0 100% 0);transform:translate3d(0,14px,0)}
  .js [data-rev].rev{opacity:1;transform:none;clip-path:inset(0 0 -20% 0)}
  /* ---------- AURORA ----------
     Porte em CSS puro de um efeito que na origem era React + framer-motion.
     Aqui não existe React, Tailwind nem bundler (a loja é Express com HTML
     montado no servidor), e o efeito é, no fundo, três coisas que o CSS já
     faz: gradientes radiais pulsando, manchas desfocadas se movendo devagar e
     pontos piscando. Zero dependência, zero KB de biblioteca.
     As cores são as DA MARCA (rosa #f10769 e volt). O roxo/índigo do original
     é identidade de outra marca e brigaria com esta.
     Só transform e opacity: tudo no compositor, nada de reflow. */
  .aur{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}
  .aur-pulso{position:absolute;inset:-10%;
    background-image:
      radial-gradient(circle at 28% 32%,rgba(var(--brand-rgb),.20) 0%,transparent 66%),
      radial-gradient(circle at 76% 64%,rgba(213,230,7,.09) 0%,transparent 64%);
    animation:aurPulso 14s ease-in-out infinite}
  @keyframes aurPulso{
    0%,100%{opacity:.55;transform:scale(1)}
    50%{opacity:.8;transform:scale(1.05)}}
  /* As manchas são GRADIENTE RADIAL, e não círculo com filter:blur().
     O gradiente dá a mesma borda difusa sem pedir ao navegador que rasterize e
     desfoque uma superfície do tamanho da tela a cada quadro: a suavidade já
     está na própria cor. Com blur() isto continuaria funcionando, só custaria
     mais caro em celular fraco — e o hero é a primeira coisa que a pessoa vê.
     mix-blend-mode:screen para as manchas somarem luz em vez de empilharem
     tinta — é o que impede o fundo de virar um borrão chapado. */
  .aur-b{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen;
    will-change:transform}
  .aur-b1{width:88%;aspect-ratio:1;left:-26%;top:-34%;
    background:radial-gradient(circle,rgba(var(--brand-rgb),.50) 0%,rgba(var(--brand-rgb),0) 62%);
    animation:aurB1 34s ease-in-out infinite alternate}
  .aur-b2{width:84%;aspect-ratio:1;right:-28%;bottom:-36%;
    background:radial-gradient(circle,rgba(90,40,180,.42) 0%,rgba(90,40,180,0) 64%);
    animation:aurB2 44s ease-in-out infinite alternate}
  .aur-b3{width:58%;aspect-ratio:1;left:30%;top:22%;
    background:radial-gradient(circle,rgba(213,230,7,.13) 0%,rgba(213,230,7,0) 60%);
    animation:aurB3 54s ease-in-out infinite alternate}
  @keyframes aurB1{from{transform:translate3d(-4%,-2%,0) scale(1)}
    to{transform:translate3d(6%,3%,0) scale(1.18)}}
  @keyframes aurB2{from{transform:translate3d(5%,2%,0) scale(1)}
    to{transform:translate3d(-6%,-3%,0) scale(1.22)}}
  @keyframes aurB3{from{transform:translate3d(2%,-3%,0) scale(1)}
    to{transform:translate3d(-3%,3%,0) scale(1.1)}}
  /* Pontos. POUCOS e de propósito: o original pisca 80 estrelas, e 80 pontos
     brancos numa loja de tênis lê como protetor de tela. Aqui são 14, fracos,
     em posições fixas geradas no servidor — nada de 80 nós animados por JS. */
  .aur-p{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;
    opacity:0;animation:aurPonto 6s ease-in-out infinite}
  @keyframes aurPonto{0%,100%{opacity:0}50%{opacity:.55}}
  /* Fora da tela a aurora inteira congela: é animação infinita, e animação
     infinita rodando onde ninguém vê é bateria gasta à toa. */
  .aur.parada *{animation-play-state:paused!important}
  @media(max-width:899px){
    /* No celular, uma mancha a menos: três camadas com blend em tela pequena
       não acrescentam nada que se perceba e custam um composite a mais. */
    .aur-b3{display:none}
  }
  @media(prefers-reduced-motion:reduce){
    .aur-pulso,.aur-b,.aur-p{animation:none}
    .aur-p{opacity:.35}
  }
  /* Grão. Um SVG de 0 requisições e ~200 bytes, não uma textura baixada: dá
     matéria ao fundo preto sem custar nada no carregamento. */
  .grao::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.05;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
  @media(prefers-reduced-motion:reduce){
    .js [data-rev]{opacity:1;transform:none;clip-path:none;transition:none}
  }
`;

// Tokens do checkout saindo do /admin. Sai DEPOIS da folha `.ck`, que declara
// os mesmos nomes com os valores de fábrica — quem nunca abriu a personalização
// recebe exatamente os valores antigos, e quem abriu sobrescreve só o que mexeu.
//
// Três tokens são derivados em vez de virarem seletor de cor no painel:
// as duas variações de linha (divisória e tracejado) e a tinta do botão, que é
// preta ou branca conforme o contraste — botão amarelo com letra branca some.
function ckVars(cx) {
  const k = cx.checkout;
  return `.ck{--ck-bg:${k.bg};--ck-card:${k.card};--ck-tinta:${k.tinta};`
    // Os fatores não são redondos por acaso: cada um foi escolhido para
    // reproduzir, a partir da cor de base, o literal que estava cravado na
    // folha antes de virar token. Assim quem nunca abriu a personalização
    // continua vendo o checkout de sempre.
    + `--ck-tinta-2:${softTint(k.tinta, 0.16)};--ck-cinza:${k.cinza};`
    + `--ck-placeholder:${softTint(k.cinza, 0.32)};`
    + `--ck-linha:${k.linha};--ck-linha-suave:${softTint(k.linha, 0.42)};`
    + `--ck-linha-forte:${darken(k.linha, 0.09)};`
    + `--ck-fraca:${softTint(k.linha, 0.68)};`
    + `--ck-verde:${k.botao};--ck-verde-d:${darken(k.botao, 0.22)};--ck-verde-rgb:${hexRgb(k.botao).join(',')};`
    + `--ck-btn-tinta:${tintaLegivel(k.botao)}}`
    // A MESMA cor no :root, para os botões de compra FORA do checkout
    // (Comprar agora, Adicionar ao carrinho, Finalizar compra, oferta). O
    // bloco acima vale só dentro de .ck: usando --ck-verde na página de
    // produto, o fundo do botão saía transparente, sem erro nenhum.
    + `:root{--comprar:${k.botao};--comprar-d:${darken(k.botao, 0.22)};--comprar-tinta:${tintaLegivel(k.botao)}}`;
}

function html(title, body, extraHead = '') {
  const cx = getCustomization();
  const c = cx.colors;
  // sobrescreve as variáveis de cor depois do BASE_CSS (personalização do /admin)
  // --brand-xd: a cor da marca bem escura, usada no fundo da vitrine em destaque.
  // --brand-rgb: a mesma cor em componentes, para os rgba() de brilho e foco —
  // eram o roxo da Nation escrito à mão e não acompanhavam a troca de marca.
  const colorVars = `:root{--brand:${c.brand};--brand-d:${darken(c.brand, 0.22)};--brand-xd:${darken(c.brand, 0.34)};--brand-soft:${softTint(c.brand, 0.90)};--brand-rgb:${hexRgb(c.brand).join(',')};--volt:${c.volt};--black:${c.black}}${ckVars(cx)}`;
  return `<!doctype html><html lang="pt-BR"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <!-- Autoriza as animações de entrada. Tudo que começa invisível (seções com
       data-rev, as linhas da headline do hero) depende DESTA classe: sem
       JavaScript ela não existe, nada some, e a página continua inteira para o
       leitor e para o buscador. Esconder conteúdo confiando que o script vai
       devolvê-lo é como se perde uma home no Google. -->
  <script>document.documentElement.className+=' js';</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- as fotos dos produtos vêm daqui: abrir a conexão junto com o HTML
       adianta o handshake em vez de esperar a primeira imagem aparecer -->
  <link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${pixelSnippet()}
  ${utmifySnippet()}
  <script>window.__CFG=${buildCfg(cx)};</script>
  <style>${BASE_CSS}${extraHead}${colorVars}</style>
  </head><body>${body}</body></html>`;
}

// Ícones do tema (inline: sem fonte de ícone externa, sem request extra).
const svgSearch = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
// Carrinho de compras: alça, cesto e as duas rodas.
const svgCart = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h2.3l1.7 10.1a1.9 1.9 0 0 0 1.9 1.6h8.1a1.9 1.9 0 0 0 1.9-1.5l1.4-6.4H5.6"/><circle cx="9.5" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/></svg>';
// Giro (setas em círculo) e pilha de fotos — o alternador da página de produto.
const svgGiro = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18.5 3v3h-3"/><path d="M5.5 21v-3h3"/></svg>';
const svgFotos = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M21 8v8a2 2 0 0 1-2 2"/><circle cx="8" cy="11" r="1.4"/><path d="M4 16l3.5-3 3 2.5"/></svg>';
// Etiqueta de preço — a faixa de benefícios abre com a promoção.
const svgTag = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V4h9z"/><circle cx="7.8" cy="8.2" r="1.4"/></svg>';
const svgTruck = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h11v9H2z"/><path d="M13 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.7"/><circle cx="17" cy="18" r="1.7"/></svg>';
const svgShield = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
const svgHeart = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/></svg>';
const svgReturn = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 8 0 1 1 2 5.3"/><path d="M4 5v5h5"/></svg>';
const svgStar = () => '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';
const svgLock = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const svgChat = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/></svg>';
const svgZoom = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/></svg>';
const svgVerif = () => '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8l2.4 1.9 3-.3 1 2.9 2.6 1.6-1 2.9 1 2.9-2.6 1.6-1 2.9-3-.3L12 22.2l-2.4-1.9-3 .3-1-2.9L3 16.1l1-2.9-1-2.9 2.6-1.6 1-2.9 3 .3z"/><path d="M10.6 15.6l-3-3 1.3-1.3 1.7 1.7 4-4 1.3 1.3z" fill="#fff"/></svg>';
// Símbolo do Pix (marca do Banco Central), na cor oficial #32BCAD.
const PIX_PATH = '<path d="M242.4 292.5c5.4-5.4 14.7-5.4 20.1 0l77 77c14.2 14.2 33.1 22 53.2 22h15l-97.1 97.1c-30.3 30.3-79.5 30.3-109.8 0l-97.4-97.4h9.2c20.1 0 39-7.8 53.2-22l76.6-76.7zm20.1-73.6c-5.4 5.5-14.7 5.6-20.1 0l-76.6-76.6c-14.2-14.2-33.1-22-53.2-22h-9.2l97.4-97.5c30.3-30.4 79.5-30.4 109.8 0l97.1 97.1h-15c-20.1 0-39 7.8-53.2 22l-77 77zM112.6 142.7c13.8 0 26.5 5.6 37.2 15.4l76.6 76.6c7 7 16.2 10.5 25.4 10.5s18.4-3.5 25.4-10.5l77-77c9.8-9.8 23.4-15.4 37.2-15.4h38.8l58.5 58.5c29.5 30.3 29.5 79.5 0 109.8l-58.5 58.5h-38.8c-13.8 0-27.4-5.6-37.2-15.4l-77-77c-13.7-13.7-37-13.7-50.7.1l-76.6 76.6c-10.7 9.8-23.4 15.4-37.2 15.4H80.5L22.8 310.6c-30.4-30.3-30.4-79.5 0-109.8l57.7-58.1h32.1z"/>';
const svgPix = () => `<svg viewBox="0 0 512 512" fill="#32BCAD" aria-hidden="true">${PIX_PATH}</svg>`;

// ---------------------------------------------------- bandeiras de pagamento
// Desenhadas aqui em vez de virarem seis arquivos em /assets: são planas o
// bastante para caber em meia dúzia de formas, e assim não há requisição extra
// nem imagem quebrada se alguém limpar a pasta. Todas no mesmo viewBox 48x32
// para os cartõezinhos ficarem do mesmo tamanho na fileira.
const FONTE_SVG = 'system-ui,Segoe UI,Arial,sans-serif';
const svgAmex = () => `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#2E77BC"/><text x="24" y="14.5" font-size="6.2" font-weight="700" fill="#fff" text-anchor="middle" font-family="${FONTE_SVG}">AMERICAN</text><text x="24" y="23" font-size="6.2" font-weight="700" fill="#fff" text-anchor="middle" font-family="${FONTE_SVG}">EXPRESS</text></svg>`;
const svgBoleto = () => {
  // larguras alternadas: é o que faz ler como código de barras e não como grade
  const barras = [[6,1.7],[9,0.9],[11.4,2.3],[15.2,1],[17.6,1.7],[20.8,0.9],[23.2,2.3],[27,1],[29.4,1.7],[32.6,0.9],[35,2.3],[38.8,1],[41.2,1.7]];
  return `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#fff"/><g fill="#0b0a0f">${
    barras.map(([x, w]) => `<rect x="${x}" y="6" width="${w}" height="20"/>`).join('')}</g></svg>`;
};
const svgMaster = () => `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#fff"/><circle cx="19.5" cy="16" r="8.6" fill="#EB001B"/><circle cx="28.5" cy="16" r="8.6" fill="#F79E1B" fill-opacity=".82"/></svg>`;
const svgVisa = () => `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#fff"/><text x="24" y="21.5" font-size="13" font-weight="800" font-style="italic" fill="#1A1F71" text-anchor="middle" font-family="${FONTE_SVG}">VISA</text></svg>`;
const svgElo = () => `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#0b0a0f"/><text x="24" y="19" font-size="12" font-weight="700" fill="#fff" text-anchor="middle" font-family="${FONTE_SVG}">elo</text><rect x="15" y="22" width="6" height="2.2" rx="1.1" fill="#FFCB05"/><rect x="22" y="22" width="6" height="2.2" rx="1.1" fill="#EF4123"/><rect x="29" y="22" width="6" height="2.2" rx="1.1" fill="#00A4E0"/></svg>`;
// 512 * .0469 = 24px de símbolo, centrado no cartão de 48x32.
const svgPixBrand = () => `<svg viewBox="0 0 48 32" aria-hidden="true"><rect width="48" height="32" rx="3" fill="#fff"/><g fill="#32BCAD" transform="translate(12 4) scale(.0469)">${PIX_PATH}</g></svg>`;
// Cartão + moeda: o ícone que abre a caixa de pagamento.
const svgCartao = () => '<svg viewBox="0 0 44 32" aria-hidden="true"><rect x="1.5" y="5" width="28" height="19" rx="3.2" style="fill:var(--brand)"/><rect x="1.5" y="10" width="28" height="4.2" style="fill:var(--brand-d)"/><circle cx="32" cy="21" r="9" fill="#fff" style="stroke:var(--brand)" stroke-width="2.2"/><text x="32" y="25.2" font-size="11.5" font-weight="800" style="fill:var(--brand)" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif">$</text></svg>';
const svgInsta = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none"/></svg>';
const svgCaret = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
// Setas do carrossel das vitrines.
const svgSeta = (dir) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const svgGrid = () => '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
const svgList = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
const svgWhats = () => '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8c1.9 1 4 1.6 6.2 1.6 7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.6c-2 0-3.9-.5-5.5-1.5l-.4-.2-4 1.1 1.1-3.9-.3-.4c-1.1-1.7-1.6-3.6-1.6-5.6C5.3 10.1 10.1 5.3 16 5.3S26.7 10.1 26.7 16 21.9 26.6 16 26.6zm5.9-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1c-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3s0-.5.2-.7l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.8 5.1.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.6s.3-1.4.2-1.6c-.1-.1-.3-.2-.6-.4z"/></svg>';
const svgDown = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>';

// Depoimentos: bloco próprio porque a vitrine e o checkout têm folhas
// separadas e os dois usam esta seção.
const DEP_CSS = `
  /* ===================== MURO 3D DE DEPOIMENTOS =====================
     Porte de um componente React (marquee vertical em perspectiva) para o
     stack desta loja, que não tem React, Tailwind nem bundler. Vira CSS:
     colunas em animação linear infinita dentro de um contêiner com
     perspective. Zero dependência.
     Cada coluna repete o próprio conteúdo DUAS vezes e anda -50%: é isso que
     faz o laço fechar sem emenda. */
  .dep-muro{position:relative;display:flex;justify-content:center;gap:12px;
    height:min(76vh,600px);overflow:hidden;perspective:340px;
    -webkit-mask-image:radial-gradient(ellipse 78% 70% at 50% 50%,#000 42%,transparent 78%);
    mask-image:radial-gradient(ellipse 78% 70% at 50% 50%,#000 42%,transparent 78%)}
  .dep-muro-in{display:flex;gap:12px;
    transform:translateX(-30px) translateZ(-70px) rotateX(16deg) rotateY(-9deg) rotateZ(16deg)}
  .dep-col{display:flex;flex-direction:column;gap:12px;flex:none;width:210px;
    animation:depSobe var(--dur,44s) linear infinite}
  .dep-col--rev{animation-direction:reverse}
  @keyframes depSobe{from{transform:translateY(0)}to{transform:translateY(calc(-50% - 6px))}}
  /* Parar no hover é o que deixa a pessoa LER o depoimento que chamou o olho.
     Sem isso o muro é enfeite, não prova social. */
  .dep-muro:hover .dep-col,.dep-muro:focus-within .dep-col{animation-play-state:paused}
  .dep-muro .dep-card{width:210px;flex:none;margin:0}
  /* No celular o muro fica com duas colunas e quase sem rotação: em 375px a
     inclinação do original joga metade dos cards para fora da tela. */
  @media(max-width:759px){
    .dep-muro{height:min(66vh,460px);perspective:520px}
    .dep-muro-in{gap:10px;transform:translateZ(-30px) rotateX(9deg) rotateY(-5deg) rotateZ(9deg)}
    .dep-col{width:168px}
    .dep-muro .dep-card{width:168px}
    .dep-col:nth-child(n+3){display:none}
  }
  @media(prefers-reduced-motion:reduce){
    .dep-col{animation:none}
    .dep-muro-in{transform:none}
    .dep-muro{height:auto;overflow:visible;-webkit-mask-image:none;mask-image:none;flex-wrap:wrap}
  }

  .dep{max-width:1240px;margin:0 auto;padding:34px 0 8px}
  .dep-hd{text-align:center;margin:0 0 18px;padding:0 16px}
  .dep-hd h2{font-size:20px;margin:0 0 5px;color:#0b0a0f;font-weight:600}
  @media(min-width:900px){.dep-hd h2{font-size:23px}}
  .dep-hd p{margin:0;color:#6e6a78;font-size:13.5px}
  /* carrossel horizontal, mesmo padrão das vitrines: rolagem nativa (dedo,
     roda do mouse) e as setas só empurram. scroll-padding-left TEM que
     acompanhar o padding-left, senão o snap come o recuo e o primeiro card
     cola na borda — foi o que aconteceu no painel roxo da home. */
  .dep-wrap{position:relative}
  .dep-row{display:flex;gap:14px;overflow-x:auto;padding:4px 16px 12px;
    scroll-snap-type:x mandatory;scroll-padding-left:16px;
    -webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none}
  .dep-row::-webkit-scrollbar{display:none}
  .dep-card{flex:0 0 288px;scroll-snap-align:start;
    background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:18px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4);display:flex;flex-direction:column;gap:9px}
  @media(min-width:900px){.dep-card{flex:0 0 330px}}
  .dep-btn{position:absolute;top:50%;margin-top:-28px;z-index:6;
    width:44px;height:44px;border-radius:999px;border:1px solid #e7e4ee;background:#fff;
    color:#0b0a0f;cursor:pointer;display:none;place-items:center;padding:0;
    box-shadow:0 6px 18px -6px rgba(11,10,15,.28);transition:background .18s,color .18s}
  .dep-btn svg{width:19px;height:19px}
  .dep-btn:hover{background:#0b0a0f;color:#fff}
  .dep-btn.prev{left:2px}
  .dep-btn.next{right:2px}
  .dep-btn[hidden]{display:none}
  /* só onde existe cursor: no toque, arrastar com o dedo já resolve */
  @media(hover:hover) and (min-width:900px){.dep-btn{display:grid}}
  /* as estrelas precisam estar AQUI, e não só no STORE_CSS_SHARED: o checkout
     tem folha própria e, sem width/color, o SVG estica pra largura toda. */
  .dep .stars{display:flex;align-items:center;gap:3px;margin:0;color:#f5b301}
  .dep .stars svg{width:15px;height:15px}
  .dep-tx{margin:0;font-size:14px;line-height:1.6;color:#3a3742}
  /* margin-top:auto joga o par comprado pro rodapé: com depoimentos de
     tamanhos diferentes, essa linha fica alinhada entre os cards da fileira. */
  .dep-prod{font-size:12px;color:#8b8794;margin-top:auto;padding-top:2px}
  /* autor no TOPO do card, com o selo de verificado ao lado do nome */
  .dep-who{display:flex;align-items:center;gap:10px;
    padding-bottom:11px;border-bottom:1px solid #f2f1f5}
  /* sem foto, cai na inicial do nome sobre o roxo claro — o card não quebra
     quando a avaliação vier sem imagem. */
  .dep-av{width:38px;height:38px;border-radius:999px;background:var(--brand-soft);
    color:var(--brand-d);display:grid;place-items:center;font-weight:800;font-size:15px;
    flex:none;overflow:hidden}
  /* Recorte redondo de 38px em foto de corpo inteiro erra o rosto: cada uma
     traz o seu foco (object-position) inline, medido na imagem original.
     O valor abaixo é só a reserva de quem vier sem foco definido. */
  .dep-av img{width:100%;height:100%;object-fit:cover;object-position:50% 30%;border-radius:999px}
  .dep-nm{display:flex;align-items:center;gap:5px;
    font-size:13.5px;font-weight:600;color:#0b0a0f;line-height:1.25}
  .dep-selo{display:inline-flex;color:var(--green);flex:none}
  .dep-selo svg{width:15px;height:15px;display:block}
  .dep-meta{font-size:11.5px;color:#8b8794;line-height:1.3}
  .dep-ver{color:var(--green);font-weight:700;font-size:11.5px}
  /* versão enxuta do checkout: menos card e menos peso, pra não competir com
     o botão de pagar. */
  .dep--mini{padding:20px 0 0}
  .dep--mini .dep-hd{margin-bottom:12px;padding:0}
  .dep--mini .dep-hd h2{font-size:15px}
  .dep--mini .dep-row{padding:4px 0 10px;scroll-padding-left:0}
  .dep--mini .dep-card{flex:0 0 250px;padding:14px;gap:7px}
  .dep--mini .dep-tx{font-size:13px;line-height:1.55}
  .dep--mini .dep-av{width:32px;height:32px;font-size:13px}
  .dep--mini .dep-btn{width:38px;height:38px;margin-top:-24px}
  .dep--mini .dep-btn svg{width:16px;height:16px}
`;

// ------------------------------------------------- CARRINHO LATERAL (drawer)
// A sacola deixou de ser uma página e virou um painel que entra pela direita,
// por cima da loja. Prefixo `sac-` em tudo: o `.drawer` desta folha já é o menu
// e o `.sz` muda de tamanho entre a vitrine e a página de produto — reaproveitar
// qualquer um dos dois faria o carrinho mudar de cara conforme a página em que
// abriu.
//
// A largura é 100% no celular e ~470px no computador; quando a escolha do 2º par
// abre, o painel cresce até 880px (classe `larga`) em vez de empilhar o
// mini-catálogo numa coluna estreita. No celular ele já ocupa a tela toda.
//
// Nada aqui é decorativo por decoração: as transições existem para a pessoa ver
// DE ONDE o painel veio e O QUE mudou. Todas somem em prefers-reduced-motion
// (no fim do bloco), e nenhuma é infinita.
const CART_DRAWER_CSS = `
  /* ---- tokens de movimento ----
     Três velocidades e três curvas, e nada de número solto espalhado pela
     folha: microinteração (botão, miniatura, ícone), componente (cartão,
     etapa, colorway) e as duas animações grandes (troca de produto, entrar no
     combo). O JS espelha os MESMOS milissegundos em MO — se mudar aqui,
     mudar lá. "linear" não aparece em lugar nenhum: entrada desacelera,
     saída acelera. */
  /* Apontam para os tokens globais do BASE_CSS — os nomes --sac-* ficaram
     porque a folha do carrinho inteira já os usa, mas o VALOR mora num lugar
     só. Mudar a velocidade da loja muda a do carrinho junto. */
  :root{
    --sac-micro:var(--mo-micro);--sac-comp:var(--mo-comp);--sac-hero:var(--mo-hero);
    --sac-ease-out:var(--ez-out);--sac-ease-in:var(--ez-in);--sac-ease:var(--ez);
  }
  .sac-scrim{position:fixed;inset:0;background:rgba(11,10,15,.5);z-index:90;
    opacity:0;visibility:hidden;
    transition:opacity var(--sac-comp) var(--sac-ease-out),visibility var(--sac-comp)}
  .sac-scrim.on{opacity:1;visibility:visible}
  .sac{position:fixed;top:0;right:0;bottom:0;z-index:91;width:100%;background:#fff;
    display:flex;flex-direction:column;visibility:hidden;overflow:hidden;
    transform:translate3d(100%,0,0);
    transition:transform var(--sac-comp) var(--sac-ease),visibility var(--sac-comp),
      max-width var(--sac-comp) var(--sac-ease);
    box-shadow:-22px 0 60px -34px rgba(11,10,15,.75)}
  .sac.on{transform:none;visibility:visible}
  @media(min-width:760px){.sac{max-width:470px}.sac.larga{max-width:880px}}
  /* Entrada escalonada: título, produto, preços, combo e CTA não chegam todos
     no mesmo quadro. 40ms entre blocos — o suficiente pra leitura ter ordem,
     curto o bastante pra ninguém esperar. Só na ABERTURA; repintar (mudar
     quantidade, remover) não re-escalona, senão a sacola piscaria inteira a
     cada clique. */
  @keyframes sacEntra{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
  .sac-entra{animation:sacEntra var(--sac-comp) var(--sac-ease-out) backwards;
    animation-delay:calc(var(--i,0)*40ms)}
  /* ---- cabeçalho ---- */
  .sac-hd{flex:none;display:flex;align-items:center;gap:12px;padding:16px 16px 14px;
    border-bottom:1px solid var(--line)}
  .sac.on .sac-hd{animation:sacEntra var(--sac-comp) var(--sac-ease-out) backwards}
  .sac-hd h2{margin:0;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
  .sac-hd .n{font-size:11.5px;font-weight:700;color:#fff;background:var(--brand);
    min-width:20px;height:20px;border-radius:999px;display:grid;place-items:center;padding:0 6px}
  .sac-x{margin-left:auto;background:none;border:none;cursor:pointer;color:#6e6a78;
    width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:26px;line-height:1}
  .sac-x:hover{background:#f4f3f7;color:#0b0a0f}
  /* ---- corpo ---- */
  .sac-body{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
    padding:14px 16px 20px;
    transition:transform var(--sac-comp) var(--sac-ease),opacity var(--sac-comp) var(--sac-ease-in)}
  /* Com o seletor aberto a sacola RECUA em vez de sumir por baixo: a pessoa
     entende que continua dentro do carrinho, e não que trocou de página. */
  .sac.escolhendo .sac-body,.sac.escolhendo .sac-ft{transform:translate3d(-20px,0,0);opacity:0}
  .sac-vazio{text-align:center;padding:52px 10px}
  .sac-vazio p{color:#6e6a78;margin:0 0 20px}
  .sac-skel{height:92px;border-radius:14px;background:#f2f1f5;margin-bottom:12px}
  /* ---- linha do produto ---- */
  .sac-line{display:grid;grid-template-columns:78px minmax(0,1fr);gap:13px;
    padding:14px 0;border-bottom:1px solid #f2f1f5}
  .sac-line:first-child{padding-top:2px}
  /* Produto que ACABOU de entrar. Uma vez, na primeira pintura em que ele
     aparece — o idsAntes do JS é quem sabe disso. */
  @keyframes sacLinhaEntra{
    from{opacity:0;transform:translate3d(0,8px,0) scale(.94)}
    to{opacity:1;transform:none}}
  .sac-line.nova{animation:sacLinhaEntra 300ms var(--sac-ease-out) backwards}
  /* Saída: o estado JÁ mudou (o par saiu do carrinho); isto é só o espaço se
     fechando. height é animada de propósito — é uma sanfona, e não há
     transform que feche o buraco de um item removido. */
  .sac-line.saindo{overflow:hidden;
    transition:height 280ms var(--sac-ease-in),opacity 200ms var(--sac-ease-in),
      transform 280ms var(--sac-ease-in),padding 280ms var(--sac-ease-in);
    opacity:0;transform:scale(.96);padding-top:0;padding-bottom:0}
  .sac-line.trocando{transition:transform var(--sac-micro) var(--sac-ease-in),
    opacity var(--sac-micro) var(--sac-ease-in);transform:translate3d(20px,0,0);opacity:0}
  .sac-line img{width:78px;height:78px;border-radius:12px;object-fit:contain;background:#f6f5f8}
  .sac-line .nm{font-size:14.5px;font-weight:600;line-height:1.3;color:#0b0a0f;
    display:block;margin-bottom:3px}
  .sac-line .meta{font-size:12.5px;color:#6e6a78;margin:0 0 7px}
  .sac-line .pr{font-size:15px;font-weight:700;color:var(--comprar)}
  .sac-line .pr s{font-size:12.5px;font-weight:500;color:#9a96a4;margin-left:7px}
  .sac-line .acoes{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
  .sac-step{display:inline-flex;align-items:center;background:#f2f1f5;border-radius:999px}
  .sac-step button{width:38px;height:38px;border:none;background:none;cursor:pointer;
    font-size:18px;line-height:1;color:#3a3742;border-radius:999px}
  .sac-step button:hover{background:#e7e5ec}
  .sac-step button:disabled{opacity:.34;cursor:not-allowed}
  .sac-step span{min-width:30px;text-align:center;font-size:14px;font-weight:700}
  .sac-mini{background:none;border:none;padding:8px 2px;cursor:pointer;font:inherit;font-size:12.5px;
    color:#6e6a78;text-decoration:underline;min-height:38px}
  .sac-mini:hover{color:#0b0a0f}
  .sac-mini.tro{color:var(--brand-d);font-weight:600}
  /* ---- oferta: complete o combo ---- */
  /* Cartão da marca, não "você também pode gostar": ele fala do par que a
     pessoa ACABOU de escolher e do que falta pra fechar a promoção. */
  /* A oferta não "aparece": ela se abre. O grid 0fr->1fr é a sanfona sem
     animar height (o navegador resolve no compositor) e sem max-height
     chutado, que corta o texto quando a fonte muda de tamanho. */
  @keyframes sacAbre{
    from{opacity:0;transform:translate3d(0,8px,0);grid-template-rows:0fr}
    to{opacity:1;transform:none;grid-template-rows:1fr}}
  .sac-of{margin:16px 0 4px;border:1.5px solid var(--brand);border-radius:16px;overflow:hidden;
    background:var(--brand-soft);display:grid;grid-template-rows:1fr;
    animation:sacAbre var(--sac-comp) var(--sac-ease-out) backwards}
  .sac-of-tp{background:var(--brand);color:#fff;padding:10px 14px;font-size:12.5px;font-weight:800;
    letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:8px}
  .sac-of-in{padding:14px;min-width:0}
  .sac-of-in h3{margin:0 0 6px;font-size:17px;line-height:1.25;color:#0b0a0f;letter-spacing:-.01em}
  .sac-of-in h3 b{color:var(--brand-d)}
  .sac-of-in p{margin:0 0 12px;font-size:13px;line-height:1.5;color:#4b4753}
  .sac-of-eco{display:inline-flex;align-items:baseline;gap:8px;background:#fff;border-radius:10px;
    padding:8px 12px;margin-bottom:13px;font-size:13px;font-weight:700;color:var(--comprar)}
  .sac-of-eco s{color:#9a96a4;font-weight:500}
  /* ---- combo fechado ---- */
  .sac-ok{margin:16px 0 4px;border:1.5px solid var(--comprar);border-radius:16px;background:#f2fbf5;
    padding:13px 14px}
  .sac-ok-tt{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;
    color:var(--comprar-d);letter-spacing:.02em}
  .sac-ok-tt svg{width:17px;height:17px}
  .sac-ok p{margin:7px 0 0;font-size:13px;color:#3a5a45;line-height:1.5}
  .sac-ok p b{color:#1d4630}
  /* Sucesso: o cartão cresce um fio, um brilho discreto passa uma vez e o
     check se DESENHA. Sem confete, sem loop — 460ms e acabou. */
  .sac-ok.pisca{animation:sacOk 460ms var(--sac-ease-out) 1}
  @keyframes sacOk{
    0%{transform:scale(.975);box-shadow:0 0 0 0 rgba(30,158,79,.35);background:#e9f7ee}
    60%{box-shadow:0 0 0 9px rgba(30,158,79,0)}
    100%{transform:none;background:#f2fbf5}}
  .sac-tick{width:17px;height:17px;flex:none}
  .sac-tick path{stroke-dasharray:26;stroke-dashoffset:0}
  .sac-ok.pisca .sac-tick path{animation:sacTick 420ms var(--sac-ease-out) 60ms backwards}
  @keyframes sacTick{from{stroke-dashoffset:26}to{stroke-dashoffset:0}}
  /* ---- SEU DROP: os pares como um conjunto, não como uma lista ---- */
  .sac-drop{margin:11px 0 9px;padding:12px 10px 10px;border-radius:13px;
    background:linear-gradient(180deg,#fff,#f4faf6);border:1px solid #dcefe3}
  .sac-drop-tt{display:block;text-align:center;font-size:10px;font-weight:800;
    letter-spacing:.18em;color:#6f8c7c;margin-bottom:9px}
  .sac-drop-fotos{display:flex;align-items:center;justify-content:center;gap:6px}
  .sac-drop-fotos img{width:74px;aspect-ratio:1;object-fit:contain;background:#fff;
    border-radius:10px;padding:3px;transform:rotate(var(--r,0deg));
    box-shadow:0 10px 18px -12px rgba(11,10,15,.55);
    animation:sacDropEntra 420ms var(--sac-ease-out) backwards;
    animation-delay:calc(var(--d,0)*70ms)}
  @keyframes sacDropEntra{
    from{opacity:0;transform:rotate(0deg) translate3d(0,8px,0) scale(.92)}
    to{opacity:1;transform:rotate(var(--r,0deg))}}
  .sac-drop-sinal{font-size:15px;font-weight:800;color:#9bb3a6;flex:none}
  /* ---- rodapé: totais e CTA ---- */
  .sac-ft{flex:none;border-top:1px solid var(--line);background:#fff;
    padding:14px 16px calc(14px + env(safe-area-inset-bottom));
    box-shadow:0 -10px 24px -22px rgba(11,10,15,.6)}
  .sac-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
    font-size:13.5px;color:#4b4753;margin-bottom:7px}
  .sac-row .desc{color:var(--brand-d);font-weight:600}
  .sac-row.tot{font-size:16px;font-weight:700;color:#0b0a0f;margin:10px 0 12px}
  .sac-row.tot b{font-size:23px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .sac-row.tot b{display:inline-block;position:relative;overflow:hidden}
  .sac-row.tot b.up{animation:sacUp 420ms var(--sac-ease-out) 1}
  @keyframes sacUp{0%{transform:scale(1);color:#0b0a0f}
    45%{transform:scale(1.05);color:var(--comprar)}100%{transform:scale(1);color:#0b0a0f}}
  /* Brilho: passa UMA vez quando o número chega no valor novo. */
  .sac-row.tot b.up::after{content:'';position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.75) 50%,transparent 62%);
    transform:translateX(-120%);animation:sacBrilho 520ms var(--sac-ease-out) 120ms 1}
  @keyframes sacBrilho{to{transform:translateX(120%)}}
  .sac-go{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
    border:none;cursor:pointer;font:inherit;font-weight:800;font-size:15px;letter-spacing:.03em;
    border-radius:999px;padding:17px 18px;background:var(--acao);color:#fff;
    transition:background var(--sac-micro) ease,transform 120ms var(--sac-ease-out)}
  .sac-go:hover{background:var(--acao-h);text-decoration:none}
  /* Mobile não tem hover: o feedback é a pressão do toque. */
  .sac-go:active{transform:scale(.98)}
  /* A seta anda 4px no hover — o único enfeite de um botão que precisa ser
     lido como "o caminho é por aqui". */
  .sac-ar{display:inline-block;transition:transform var(--sac-micro) var(--sac-ease-out)}
  .sac-go:hover .sac-ar{transform:translateX(4px)}
  .sac-go.indo{pointer-events:none}
  .sac-spin{width:15px;height:15px;border-radius:50%;flex:none;
    border:2px solid rgba(255,255,255,.35);border-top-color:currentColor;
    animation:sacSpin .7s linear infinite}
  @keyframes sacSpin{to{transform:rotate(360deg)}}
  .sac-frete{display:flex;align-items:center;justify-content:center;gap:7px;margin:10px 0 0;
    font-size:12.5px;font-weight:600;color:#3a3742}
  .sac-frete svg{width:16px;height:16px;color:var(--comprar)}
  .sac-seg{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 0 0;
    font-size:12px;color:#8b8794}
  .sac-seg svg{width:14px;height:14px}
  /* Pulo único do ícone da sacola quando um par entra. 1 -> 1,12 -> 1, uma
     vez: a classe é removida no fim, então ele nunca fica pulando. */
  .ico.bag.pop{animation:sacPop 380ms var(--sac-ease-out) 1}
  @keyframes sacPop{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
  .ico.bag.pop b{animation:sacPop 380ms var(--sac-ease-out) 60ms 1}
  /* ---- foto que voa até a sacola (feedback do "adicionar") ---- */
  .sac-fly{position:fixed;z-index:95;pointer-events:none;border-radius:14px;object-fit:contain;
    background:#fff;box-shadow:0 18px 40px -20px rgba(11,10,15,.6);
    transition:transform 380ms var(--sac-ease),opacity 380ms var(--sac-ease-in)}
  /* ======================= ESCOLHA DO 2º PAR ======================= */
  /* Painel que desliza POR CIMA do carrinho, dentro do mesmo drawer: a pessoa
     não sai da sacola nem troca de página pra escolher o par. */
  .sac-sel{position:absolute;inset:0;z-index:2;background:#fff;display:flex;flex-direction:column;
    transform:translate3d(100%,0,0);visibility:hidden;
    transition:transform .3s cubic-bezier(.22,.61,.36,1),visibility .3s}
  .sac-sel.on{transform:none;visibility:visible}
  .sac-sel-hd{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;
    border-bottom:1px solid var(--line)}
  .sac-back{background:none;border:1.5px solid var(--line);border-radius:12px;cursor:pointer;
    color:#0b0a0f;min-width:44px;height:44px;display:grid;place-items:center;font-size:20px;line-height:1}
  .sac-back:hover{border-color:#0b0a0f}
  .sac-sel-hd .tt{min-width:0}
  .sac-sel-hd .tt b{display:block;font-size:15px;line-height:1.2;letter-spacing:-.01em}
  .sac-sel-hd .tt i{display:block;font-style:normal;font-size:11.5px;color:#8b8794;
    letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
  .sac-sel-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px}
  /* Etapa saindo e etapa entrando, no mesmo eixo do seletor: recua e some,
     a nova chega de fora. 140 + 300ms — a troca é sentida, não esperada. */
  .sac-sel-body.sai{transition:transform 140ms var(--sac-ease-in),opacity 140ms var(--sac-ease-in);
    transform:translate3d(-20px,0,0);opacity:0}
  @keyframes sacPassoEntra{
    from{opacity:0;transform:translate3d(25px,0,0)}to{opacity:1;transform:none}}
  .sac-sel-body.entra{animation:sacPassoEntra 320ms var(--sac-ease-out) backwards}
  /* passos: MODELO > COR > TAMANHO */
  .sac-passos{display:flex;align-items:center;gap:7px;margin:0 0 14px;font-size:11px;
    letter-spacing:.09em;text-transform:uppercase;color:#a7a3b0;font-weight:700;flex-wrap:wrap}
  .sac-passos b{color:#0b0a0f}
  .sac-passos .fez{color:var(--comprar)}
  /* busca e filtros */
  .sac-busca{position:relative;margin-bottom:12px}
  .sac-busca input{height:48px;padding-left:42px;font-size:15px}
  .sac-busca svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);
    width:18px;height:18px;color:#a7a3b0}
  .sac-chips{display:flex;gap:8px;overflow-x:auto;padding:0 0 12px;margin:0 -14px 2px;
    padding-left:14px;padding-right:14px;scrollbar-width:none}
  .sac-chips::-webkit-scrollbar{display:none}
  .sac-chip{flex:none;border:1.5px solid var(--line);background:#fff;border-radius:999px;
    padding:0 15px;height:40px;font:inherit;font-size:13px;font-weight:600;color:#3a3742;cursor:pointer;
    white-space:nowrap}
  .sac-chip:hover{border-color:#0b0a0f}
  .sac-chip.on{background:#0b0a0f;border-color:#0b0a0f;color:#fff}
  /* grade de modelos */
  .sac-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(min-width:760px){.sac.larga .sac-grid{grid-template-columns:repeat(3,1fr)}}
  .sac-card{border:1.5px solid var(--line);border-radius:14px;background:#fff;padding:9px;
    cursor:pointer;text-align:left;font:inherit;display:flex;flex-direction:column;gap:7px;
    transition:border-color .18s ease,transform .18s ease}
  .sac-card:hover{border-color:#0b0a0f;transform:translateY(-2px)}
  .sac-card:active{transform:scale(.975);transition-duration:90ms}
  .sac-card img{transition:transform var(--sac-comp) var(--sac-ease-out)}
  .sac-card:hover img{transform:scale(1.035)}
  .sac-card img{width:100%;aspect-ratio:1;object-fit:contain;background:#f6f5f8;border-radius:10px}
  .sac-card .nm{font-size:13.5px;font-weight:600;line-height:1.25;color:#0b0a0f}
  .sac-card .qt{font-size:11.5px;color:#6e6a78}
  .sac-card .mk{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#a7a3b0;font-weight:700}
  /* ---- etapa 2: cores, com a foto real ---- */
  .sac-pv{background:#f6f5f8;border-radius:16px;padding:12px 12px 6px;margin-bottom:14px;
    display:grid;place-items:center;perspective:900px}
  /* O palco é o que inclina com o mouse (3,5 graus em X, 5,5 em Y — limites do
     briefing). A FOTO por dentro é quem gira na troca de cor. Dois elementos
     porque as duas coisas podem acontecer ao mesmo tempo, e um transform só
     não empilha. */
  .sac-pv-palco{width:100%;display:grid;place-items:center;transform-style:preserve-3d}
  .sac-pv-palco.volta{transition:transform var(--sac-comp) var(--sac-ease-out)}
  .sac-pv img{width:100%;max-width:330px;aspect-ratio:1;object-fit:contain;
    transition:transform 300ms var(--sac-ease),opacity 260ms var(--sac-ease-in)}
  /* Entrada do produto quando o MODELO muda: chega girando, 480ms. */
  @keyframes sacProdEntra{
    from{opacity:0;transform:rotateY(-16deg) scale(.95) translate3d(0,6px,0)}
    to{opacity:1;transform:none}}
  .sac-pv img.chega{animation:sacProdEntra 480ms var(--sac-ease-out) backwards}
  /* Troca de colorway: sai girando 8 graus para um lado, a nova entra do outro. */
  .sac-pv img.sai{transform:rotateY(8deg) scale(.97);opacity:0}
  .sac-pv img.entra{transform:rotateY(-8deg) scale(.97);opacity:0}
  /* Sombra no chão: encolhe enquanto o tênis está "no ar" e volta quando o
     novo chega. É ela que faz a troca parecer física em vez de um fade. */
  .sac-pv-sombra{display:block;width:62%;height:13px;margin-top:6px;border-radius:50%;
    background:radial-gradient(ellipse at center,rgba(11,10,15,.28),rgba(11,10,15,0) 70%);
    transition:transform 300ms var(--sac-ease),opacity 300ms var(--sac-ease)}
  .sac-pv-palco.trocando .sac-pv-sombra{transform:scaleX(.72) scaleY(.8);opacity:.45}
  .sac-cor-nm{text-align:center;font-size:13.5px;font-weight:600;margin:-6px 0 4px;color:#0b0a0f}
  .sac-dica{text-align:center;font-size:11.5px;color:#8b8794;margin:0 0 14px}
  .sac-cores{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:10px}
  .sac-cor{position:relative;border:2px solid var(--line);border-radius:12px;background:#fff;
    padding:4px;cursor:pointer;font:inherit;
    transition:border-color var(--sac-micro) ease,transform var(--sac-micro) var(--sac-ease-out),
      box-shadow var(--sac-micro) ease}
  .sac-cor:hover{border-color:#8b8794;transform:translateY(-2px)}
  .sac-cor:active{transform:scale(.97);transition-duration:90ms}
  .sac-cor.on{border-color:#0b0a0f;transform:translateY(-2px) scale(1.02);
    box-shadow:0 10px 18px -12px rgba(11,10,15,.6)}
  /* Indicador de selecionada: um ponto que cresce no canto. */
  .sac-cor.on::after{content:'';position:absolute;top:-5px;right:-5px;width:16px;height:16px;
    border-radius:50%;background:#0b0a0f;border:2px solid #fff;
    animation:sacPonto var(--sac-micro) var(--sac-ease-out) backwards}
  @keyframes sacPonto{from{transform:scale(0)}to{transform:none}}
  .sac-cor img{width:100%;aspect-ratio:1;object-fit:contain;background:#f6f5f8;border-radius:8px}
  /* Duas linhas, não uma com reticências: metade das colorways desta loja
     começa igual ("Delux Black Gum", "Delux Black Tiffany") e cortar na
     primeira palavra deixava seis miniaturas com a MESMA legenda. */
  .sac-cor i{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
    font-style:normal;font-size:10.5px;line-height:1.25;color:#4b4753;
    margin-top:4px;text-align:center;overflow:hidden;min-height:26px}
  .sac-mais{width:100%;margin-top:12px;border:1.5px solid var(--line);background:#fff;border-radius:999px;
    height:46px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer;color:#0b0a0f}
  .sac-mais:hover{border-color:#0b0a0f}
  /* ---- etapa 3: numeração ---- */
  .sac-lbl{font-size:13px;font-weight:700;margin:18px 0 9px;color:#0b0a0f}
  .sac-lbl span{font-weight:500;color:#8b8794}
  .sac-sizes{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:9px}
  .sac-sz{position:relative;min-height:50px;border:1.5px solid #d3d0db;background:#fff;
    border-radius:12px;font:inherit;font-size:15px;font-weight:700;color:#0b0a0f;cursor:pointer;
    transition:border-color var(--sac-micro) ease,background var(--sac-micro) ease,
      transform var(--sac-micro) var(--sac-ease-out)}
  .sac-sz:hover:not(:disabled){border-color:#0b0a0f}
  .sac-sz.on{border-color:#0b0a0f;border-width:2.5px;background:#f0eff3}
  /* 1 -> 0,94 -> 1 no toque. Keyframe, e não :active, porque no celular o
     :active some no instante em que o dedo levanta e ninguém vê nada. */
  .sac-sz.toque{animation:sacToque 180ms var(--sac-ease-out) 1}
  @keyframes sacToque{0%{transform:scale(1)}45%{transform:scale(.94)}100%{transform:scale(1)}}
  /* Numeração esgotada não reage a nada: sem hover, sem toque, sem cursor. */
  .sac-sz:disabled{opacity:.32;cursor:not-allowed;text-decoration:line-through;
    transform:none!important;animation:none!important}
  /* ---- resumo antes de adicionar ---- */
  .sac-conf{flex:none;border-top:1px solid var(--line);background:#fff;
    padding:12px 14px calc(12px + env(safe-area-inset-bottom))}
  .sac-conf-in{display:grid;grid-template-columns:56px minmax(0,1fr);gap:11px;align-items:center;
    margin-bottom:11px}
  .sac-conf-in img{width:56px;height:56px;border-radius:10px;object-fit:contain;background:#f6f5f8}
  .sac-conf-in b{display:block;font-size:14px;line-height:1.25}
  .sac-conf-in i{display:block;font-style:normal;font-size:12.5px;color:#6e6a78;margin-top:2px}
  .sac-conf-pr{font-size:12.5px;color:#6e6a78;margin-top:4px}
  .sac-conf-pr s{margin-right:7px}
  .sac-conf-pr b{display:inline;color:var(--comprar);font-weight:800}
  .sac-add{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;border:none;
    cursor:pointer;font:inherit;font-weight:800;font-size:15px;letter-spacing:.03em;
    border-radius:999px;padding:17px 18px;background:var(--acao);color:#fff;
    transition:background var(--sac-comp) ease,color var(--sac-comp) ease,
      transform 120ms var(--sac-ease-out)}
  .sac-add:hover:not(:disabled){background:var(--acao-h)}
  .sac-add:active:not(:disabled){transform:scale(.98)}
  .sac-add:disabled{background:#e7e5ec;color:#9a96a4;cursor:not-allowed}
  .sac-add:hover:not(:disabled) .sac-ar{transform:translateX(4px)}
  /* A seta só existe quando o botão está pronto pra ser clicado: ela é o
     aviso de que modelo, cor, numeração e estoque fecharam. */
  .sac-add:disabled .sac-ar{opacity:0;transform:translateX(-6px)}
  .sac-add .sac-ar{transition:opacity var(--sac-comp) var(--sac-ease-out),
    transform var(--sac-comp) var(--sac-ease-out)}
  /* Uma vez, no instante em que liga. Não pulsa depois disso. */
  .sac-add.ligou{animation:sacLiga 420ms var(--sac-ease-out) 1}
  @keyframes sacLiga{0%{transform:scale(.985)}50%{transform:scale(1.012)}100%{transform:none}}
  .sac-aviso{margin:0;padding:22px 2px;color:#6e6a78;font-size:13.5px}
  /* Acessibilidade: foco visível em tudo que se clica dentro do painel. */
  .sac :focus-visible,.sac-x:focus-visible{outline:2.5px solid var(--brand);outline-offset:2px}
  /* No celular o movimento é menor: a tela é menor, a mão está em cima do
     conteúdo e o mesmo deslocamento que no desktop parece elegante ali vira
     tranco. Corta pela metade e deixa de inclinar. */
  @media(max-width:759px){
    :root{--sac-comp:320ms;--sac-hero:460ms}
    .sac-pv-palco{transform:none!important}
    .sac.escolhendo .sac-body,.sac.escolhendo .sac-ft{transform:translate3d(-10px,0,0)}
    .sac-sel-body.sai{transform:translate3d(-12px,0,0)}
    @keyframes sacPassoEntra{
      from{opacity:0;transform:translate3d(14px,0,0)}to{opacity:1;transform:none}}
  }
  /* Quem pediu menos movimento recebe o MESMO carrinho, com as mesmas etapas e
     os mesmos botões: o que sai é o movimento, não a função. Sem rotação, sem
     3D, sem deslocamento grande — só opacidade, e o resto é instantâneo. */
  @media(prefers-reduced-motion:reduce){
    .sac,.sac-scrim,.sac-sel,.sac-pv img,.sac-fly,.sac-card,.sac-cor,.sac-sz,
    .sac-body,.sac-ft,.sac-go,.sac-add,.sac-pv-sombra{transition-duration:1ms!important}
    .sac-entra,.sac-line.nova,.sac-ok.pisca,.sac-row.tot b.up,.sac-row.tot b.up::after,
    .sac-of,.sac-sel-body.entra,.sac-drop-fotos img,.sac-add.ligou,.sac-sz.toque,
    .sac-cor.on::after,.sac.on .sac-hd,.sac-ok.pisca .sac-tick path,.sac-pv img.chega,
    .ico.bag.pop,.ico.bag.pop b{animation:none!important}
    .sac-pv img.sai,.sac-pv img.entra{transform:none;opacity:1}
    .sac-pv-palco{transform:none!important}
    .sac.escolhendo .sac-body,.sac.escolhendo .sac-ft{transform:none}
    .sac-cor.on,.sac-card:hover{transform:none}
    /* o giro do carregando é o único movimento que sobra, e ele é informação */
    .sac-spin{animation-duration:1.2s}
  }
`;

// CSS compartilhado pela vitrine e pela página de coleção. Cores tiradas do
// settings_data.json do tema Dropmeta (o que estava no ar na Shopify).
const STORE_CSS_SHARED = `${DEP_CSS}${CART_DRAWER_CSS}
  body{background:#fff}
  .gbar{height:5px;background:linear-gradient(90deg,var(--brand-d),var(--brand),var(--volt),var(--brand))}
  /* ---------- header ---------- */
  /* Topo no tema claro: branco a 80% com blur e um fio de borda — os números
     são os do YNS. A versão ESCURA sobrou só para a home, onde ele flutua por
     cima do hero preto; assim que a pessoa rola, ele vira branco também. */
  .hdr{position:sticky;top:0;z-index:60;display:flex;align-items:center;
    flex-wrap:wrap;gap:10px;padding:10px 14px;
    background:rgba(255,255,255,.8);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
    border-bottom:1px solid var(--line);box-shadow:none;color:var(--ink);
    transition:background var(--mo-comp) var(--ez-out),box-shadow var(--mo-comp) var(--ez-out),
      backdrop-filter var(--mo-comp) var(--ez-out)}
  @media(min-width:900px){.hdr{gap:18px;padding:14px 26px}}
  /* Só na home: o topo começa POR DENTRO do hero (o hero sobe por baixo dele
     com margem negativa) e não tem fundo. Ao rolar, ganha corpo. O blur é de
     10px e só aqui — borrar a loja inteira custa caro em celular fraco. */
  .hdr--hero{background:transparent;box-shadow:none;border-bottom-color:transparent;color:#fff}
  .hdr--hero.solido{background:rgba(255,255,255,.8);border-bottom-color:var(--line);color:var(--ink)}
  /* As duas logos ficam no HTML e trocam por opacidade: sobre o hero preto vale
     a arte de fundo escuro, no topo branco vale a de fundo claro. Trocar o src
     por JS piscaria no meio da rolagem. */
  .logo{position:relative;display:block}
  .logo .marca-clara{position:absolute;inset:0;opacity:0}
  .logo img,.logo .marca-tx{transition:opacity var(--mo-comp) var(--ez-out)}
  .hdr:not(.hdr--hero) .marca-escura,.hdr--hero.solido .marca-escura{opacity:0}
  .hdr:not(.hdr--hero) .marca-clara,.hdr--hero.solido .marca-clara{opacity:1}
  /* Sublinhado que cresce sob o item do menu, no computador. */
  .burger,.ico{position:relative}
  .hdr .burger::after,.hdr .ico::after{content:'';position:absolute;left:50%;right:50%;bottom:2px;
    height:2px;background:var(--volt);opacity:0;
    transition:left var(--mo-micro) var(--ez-out),right var(--mo-micro) var(--ez-out),
      opacity var(--mo-micro) var(--ez-out)}
  @media(hover:hover){.hdr .burger:hover::after,.hdr .ico:hover::after{left:14%;right:14%;opacity:1}}
  /* botão Menu: some o rótulo no mobile, onde só cabe o ícone */
  .burger{background:none;border:1.5px solid var(--line);border-radius:10px;
    padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;flex:none;
    color:inherit;font:inherit;font-size:14px;font-weight:500}
  .hdr--hero:not(.solido) .burger{border-color:rgba(255,255,255,.28)}
  .burger:hover{border-color:var(--brand);background:rgba(255,255,255,.06)}
  .burger .bars{display:flex;flex-direction:column;gap:4px}
  .burger .bars i{display:block;width:20px;height:2.4px;background:currentColor;border-radius:2px}
  .burger b{display:none;font-weight:700}
  @media(min-width:900px){.burger{padding:11px 16px}.burger b{display:block}}
  /* min-width:0 + teto de largura: a logo é uma imagem larga e, sem isso,
     ela trava o encolhimento do flex e joga o header pra fora da tela. */
  .hdr .logo{flex:1;min-width:0;display:flex;justify-content:center}
  /* 58/84px e não 46/66: a logo desta loja é empilhada e quase quadrada, e na
     altura da arte larga da A Fonte o "DE ARTISTA" sairia com uns 10px. */
  .hdr .logo img{height:58px;width:auto;max-width:100%;object-fit:contain}
  @media(min-width:900px){.hdr .logo{flex:none}.hdr .logo img{height:84px}}
  /* ---------- marca escrita (enquanto não há arte) ----------
     Substitui o <img> da logo nos três lugares em que ela aparece. A altura de
     linha acompanha a altura que a arte teria (38px no celular, 56px no
     desktop), pra ligar a logo depois não mudar a altura do header. */
  .marca-tx{display:inline-flex;align-items:center;height:38px;color:#fff;
    font-weight:800;font-size:21px;letter-spacing:.06em;text-transform:uppercase;
    white-space:nowrap;line-height:1}
  .marca-tx--escura{color:#0b0a0f}
  @media(min-width:900px){.marca-tx{height:56px;font-size:28px}}
  .foot-logo.marca-tx{height:52px;font-size:24px;justify-content:center}
  @media(min-width:900px){.foot-logo.marca-tx{justify-content:flex-start}}
  .ck-logo .marca-tx{height:56px;font-size:26px}
  /* busca: fechada por padrão, abre pela lupa. Linha inteira embaixo no
     mobile, no meio do header no desktop. */
  .searchwrap{order:5;flex:1 0 100%;position:relative;display:none}
  .searchwrap.on{display:block}
  @media(min-width:900px){.searchwrap{order:0;flex:1 1 auto;max-width:720px;margin:0 6px}}
  .acts{display:flex;align-items:center;gap:4px;flex:none;margin-left:auto}
  @media(min-width:900px){.acts{gap:14px}}
  .ico{background:none;border:none;cursor:pointer;color:inherit;padding:8px;display:flex;
    align-items:center;gap:9px;position:relative;font:inherit;font-size:15px;font-weight:700}
  .ico:hover{text-decoration:none;color:var(--soft)}
  .hdr--hero:not(.solido) .ico:hover{color:var(--volt)}
  .ico svg{width:25px;height:25px;flex:none}
  .ico span{display:none}
  @media(min-width:1100px){.ico span{display:inline}}
  .acts .sep{width:1px;height:26px;background:var(--line);display:none}
  @media(min-width:1100px){.acts .sep{display:block}}
  .ico.bag{padding-left:10px}
  /* o contador some com a sacola vazia (não mostra "0") */
  .ico.bag b{position:absolute;top:0;left:26px;background:var(--brand);color:#fff;font-size:11px;
    min-width:19px;height:19px;border-radius:999px;display:none;place-items:center;font-weight:800;
    border:2px solid #0b0a0f}
  .ico.bag b.on{display:grid}
  /* ---------- drawer (única navegação: abre pelo botão Menu) ---------- */
  .scrim{position:fixed;inset:0;background:rgba(11,10,15,.55);z-index:70;display:none}
  .scrim.on{display:block}
  .drawer{position:fixed;left:0;top:0;bottom:0;width:min(84vw,340px);background:#fff;z-index:80;
    transform:translateX(-100%);transition:transform .22s ease;overflow-y:auto}
  .drawer.on{transform:none}
  .drawer-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
    border-bottom:1px solid #eeecf2;color:#0b0a0f;font-weight:800}
  .drawer-hd button{background:none;border:none;color:#0b0a0f;font-size:28px;line-height:1;cursor:pointer}
  .drawer .dn{border-bottom:1px solid #f2f1f5}
  .drawer .dn>button{width:100%;background:none;border:none;color:#0b0a0f;font:inherit;font-weight:700;
    font-size:14px;padding:14px 18px;display:flex;justify-content:space-between;cursor:pointer;text-align:left}
  .drawer .dn>button .ar{color:#3a3742;transition:transform .18s}
  .drawer .dn.open>button .ar{transform:rotate(90deg)}
  .drawer .dsub{display:none;padding:0 0 8px}
  .drawer .dn.open .dsub{display:block}
  .drawer .dsub a{display:block;color:#3a3742;padding:9px 18px 9px 30px;font-size:13.5px}
  .drawer .dsub a:hover{color:var(--brand)}
  /* ---------- busca ---------- */
  .search{width:100%;height:50px;padding:0 62px 0 22px;border:none;
    border-radius:999px;font:inherit;font-size:15px;background:#fff;color:#0b0a0f}
  .search::placeholder{color:#8b8794}
  .search:focus{outline:none;box-shadow:0 0 0 3px rgba(var(--brand-rgb),.45)}
  @media(min-width:900px){.search{height:54px}}
  .sbtn{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:44px;height:44px;
    border:none;border-radius:999px;background:var(--brand);color:#fff;cursor:pointer;
    display:grid;place-items:center}
  .sbtn:hover{background:var(--brand-d)}
  .sbtn svg{width:21px;height:21px}
  /* resultados: cartão flutuante ancorado no campo */
  .sresults{position:absolute;left:0;right:0;top:calc(100% + 8px);background:#fff;
    border:1px solid #eeecf2;border-radius:14px;padding:6px;max-height:60vh;overflow:auto;
    box-shadow:0 24px 48px -24px rgba(11,10,15,.5);display:none;z-index:65}
  .sresults.on{display:block}
  .sresults a{display:flex;gap:11px;align-items:center;padding:9px;border-radius:10px;color:#3a3742}
  .sresults a:hover{background:#f6f5f8;text-decoration:none}
  .sresults img{width:44px;height:44px;object-fit:cover;border-radius:8px;flex:none;background:#f2f1f5}
  .sresults .t{font-size:13.5px;line-height:1.3}
  .sresults .p{color:var(--comprar-d);font-weight:700;font-size:13px;margin-left:auto;white-space:nowrap}
  .sresults .msg{padding:12px;color:#8b8794;font-size:13.5px}
  /* ---------- hero ---------- */
  /* Uma arte, ou duas passando em carrossel quando a segunda existe. O slide
     "compre com segurança" que saiu daqui a pedido do dono era DESENHADO EM
     CSS; o de agora é arte dele, uma por slide (ver heroSection).
     O trilho é a mesma rolagem nativa das vitrines: o dedo arrasta, o snap
     encaixa e as bolinhas só empurram o scroll — sem transform e sem
     temporizador desenhando frame.
     A proporção declarada em width/height no <img> e no <source> reserva o
     espaço antes do download: sem ela a página pula quando a arte chega. */
  /* ======================= HERO =======================
     Composição em HTML: headline, oferta, CTA e a FOTO REAL de um par do
     catálogo. O fundo é CSS puro — gradiente da marca + grão + um foco de luz
     atrás do tênis — e custa 0 KB. A arte antiga (banner-principal) saiu daqui
     por dois motivos: ela tem o "R$ 149" DESENHADO dentro, o que criaria um
     segundo dono do preço, e são 367 KB para uma camada decorativa. */
  .hero{position:relative;overflow:hidden;background:var(--black);color:#fff;
    /* sobe por baixo do header (que é sticky e transparente na home) */
    margin-top:calc(-1 * var(--hdr-h));padding:calc(var(--hdr-h) + 26px) 16px 34px}
  /* No computador o hero ocupa a primeira dobra de verdade — mas com teto, pra
     não virar um vazio gigante em monitor alto. No celular a altura é a do
     conteúdo: encher a tela ali só empurraria a vitrine para longe. */
  @media(min-width:900px){
    .hero{padding:calc(var(--hdr-h) + 40px) 26px 56px;
      min-height:min(86vh,780px);display:grid;align-items:center}
  }
  .hero-bg{position:absolute;inset:0;pointer-events:none;
    background:
      radial-gradient(120% 90% at 78% 32%,rgba(var(--brand-rgb),.34),transparent 62%),
      radial-gradient(90% 70% at 12% 8%,rgba(213,230,7,.13),transparent 58%),
      linear-gradient(168deg,#17131f 0%,#0b0a0f 58%,#070609 100%)}
  /* Foco de luz: separa o tênis do fundo sem recorte e sem imagem. */
  .hero-luz{z-index:2;position:absolute;left:50%;top:52%;width:min(86vw,560px);aspect-ratio:1;
    transform:translate(-50%,-50%);pointer-events:none;
    background:radial-gradient(circle,rgba(255,255,255,.14),transparent 62%)}
  @media(min-width:900px){.hero-luz{left:72%;top:50%}}
  /* A ordem do HTML é a do CELULAR: marca/headline, PRODUTO, oferta, CTA.
     O computador recoloca por areas — um markup só, duas composições. */
  .hero-in{position:relative;z-index:2;max-width:1240px;margin:0 auto;width:100%;
    display:grid;gap:18px;justify-items:center;text-align:center;
    grid-template-areas:'tx' 'prod' 'of' 'cta'}
  @media(min-width:900px){
    .hero-in{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);
      grid-template-areas:'tx prod' 'of prod' 'cta prod';
      column-gap:44px;row-gap:20px;align-content:center;
      justify-items:start;text-align:left}
  }
  .hero-tx{grid-area:tx}
  .hero-prod{grid-area:prod}
  .hero-of{grid-area:of}
  .hero-acao{grid-area:cta}
  .hero-eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:10.5px;font-weight:800;
    letter-spacing:.26em;color:#b9b3c6;text-transform:uppercase}
  .hero-eyebrow::before{content:'';width:22px;height:1.5px;background:var(--volt)}
  /* A headline é o maior elemento da tela e entra LINHA POR LINHA, cada uma
     saindo de dentro da própria caixa. clamp() para crescer com a tela sem
     media query e sem estourar em 320px. */
  .hero-h1{margin:12px 0 0;font-size:clamp(38px,11vw,76px);line-height:.92;font-weight:800;
    letter-spacing:-.04em;text-transform:uppercase}
  .hero-h1 span{display:block;overflow:hidden}
  /* nowrap: cada linha da headline é uma linha. Sem isto "SUAS REGRAS." quebrava
     no meio em telas médias e a headline virava três linhas tortas. */
  .hero-h1 i{display:block;font-style:normal;white-space:nowrap}
  .js .hero-h1 i{transform:translateY(105%);
    transition:transform var(--mo-hero) var(--ez);transition-delay:calc(var(--i,0)*90ms)}
  .js .hero.pronto .hero-h1 i{transform:none}
  /* A oferta é UMA linha. O cartão com borda que existia aqui competia com a
     headline e com o CTA: três blocos disputando o mesmo olhar. */
  .hero-of{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;
    margin:2px 0 0;font-size:clamp(17px,4.6vw,22px);font-weight:600;color:#e8e4f0}
  @media(min-width:900px){.hero-of{justify-content:flex-start}}
  .hero-of b{color:var(--volt);font-weight:800;letter-spacing:-.02em}
  .hero-of .f{display:inline-flex;align-items:center;font-size:12px;font-weight:700;
    letter-spacing:.08em;text-transform:uppercase;color:#0b0a0f;background:#fff;
    border-radius:999px;padding:5px 11px}
  .hero-acao{display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center}
  @media(min-width:900px){.hero-acao{justify-content:flex-start}}
  .hero-cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;
    padding:18px 32px;border-radius:999px;background:var(--volt);color:#0b0a0f;
    font-weight:800;font-size:15px;letter-spacing:.04em;
    box-shadow:0 18px 34px -18px rgba(213,230,7,.9);
    transition:transform var(--mo-micro) var(--ez-out),box-shadow var(--mo-micro) var(--ez-out)}
  .hero-cta:hover{text-decoration:none;transform:translateY(-2px);
    box-shadow:0 22px 40px -18px rgba(213,230,7,1)}
  .hero-cta:active{transform:scale(.985)}
  .hero-cta .sac-ar{display:inline-block;transition:transform var(--mo-micro) var(--ez-out)}
  .hero-cta:hover .sac-ar{transform:translateX(4px)}
  .hero-tag{font-size:12.5px;color:#b9b3c6;border-bottom:1px solid rgba(255,255,255,.25);
    padding-bottom:2px;transition:color var(--mo-micro) ease,border-color var(--mo-micro) ease}
  .hero-tag:hover{color:#fff;border-color:var(--volt);text-decoration:none}
  /* ---- o produto ---- */
  .hero-prod{position:relative;display:grid;place-items:center;perspective:1000px;width:100%}
  .hero-palco{position:relative;width:100%;max-width:min(92vw,430px);display:grid;place-items:center;
    transform-style:preserve-3d;transition:transform var(--mo-comp) var(--ez-out)}
  @media(min-width:900px){.hero-palco{max-width:min(46vw,560px)}}
  .hero-palco picture{display:block;width:100%}
  /* A arte já vem com fundo de estúdio escuro. A máscara radial dissolve esse
     fundo no fundo do hero: em vez de um retângulo colado na tela, o par
     aparece flutuando. É o que dispensa moldura, recorte em PNG e WebGL. */
  .hero-palco img{width:100%;height:auto;display:block;
    -webkit-mask-image:radial-gradient(ellipse 62% 58% at 50% 52%,#000 58%,transparent 82%);
    mask-image:radial-gradient(ellipse 62% 58% at 50% 52%,#000 58%,transparent 82%);
    animation:heroFlutua 7s var(--ez) infinite}
  /* 3px, sete segundos: o par respira. Para quando o hero sai da tela (o JS
     troca o play-state) e some inteira em prefers-reduced-motion. */
  @keyframes heroFlutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
  /* O filme fica POR CIMA da foto, com a mesma máscara e o mesmo enquadramento
     (foi gerado a partir dela). Nasce invisível e sem src: a foto é o LCP e
     continua sendo o que aparece se o vídeo não carregar, não for baixado ou
     for recusado pelo navegador. */
  .hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
    opacity:0;pointer-events:none;
    transition:opacity var(--mo-hero) var(--ez-out);
    -webkit-mask-image:radial-gradient(ellipse 62% 58% at 50% 52%,#000 58%,transparent 82%);
    mask-image:radial-gradient(ellipse 62% 58% at 50% 52%,#000 58%,transparent 82%)}
  .hero-video.on{opacity:1}
  /* Com o filme visível a foto para de flutuar — quem se move é o vídeo, em
     loop contínuo. */
  .hero-palco.filmando img{animation:none}
  .hero-sombra{position:absolute;left:50%;bottom:9%;width:46%;height:20px;transform:translateX(-50%);
    border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.85),transparent 70%);
    filter:blur(7px)}
  @media(prefers-reduced-motion:reduce){
    .hero-palco img{animation:none}
    .js .hero-h1 i{transform:none;transition:none}
  }
  /* o carrossel antigo de banners continua existindo para quem ainda o usa */
  .hero-legado{display:block;overflow:hidden;background:var(--black);position:relative}
  /* overflow-x:auto, não hidden: é a rolagem nativa que move o carrossel, e
     hidden no eixo x mataria o arrastar com o dedo. A barra some — no
     computador quem empurra são as setas, no celular o dedo. */
  .hero-legado .hero-trilho,.hero-trilho{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch}
  .hero-trilho::-webkit-scrollbar{display:none}
  .hero-slide{flex:0 0 100%;min-width:0;scroll-snap-align:start}
  /* <picture> nasce inline: sem isto sobra a folga da linha de texto embaixo
     da arte, e o bloco fica alguns pixels mais alto do que a imagem. */
  .hero picture{display:block}
  .hero img{width:100%;height:auto;display:block}
  /* As bolinhas ficam ABAIXO da arte, no preto da seção, e não por cima dela:
     as duas artes terminam numa fileira de selos, e bolinha em cima de selo
     esconde justamente o que o banner foi desenhado pra dizer. */
  .hero-dots{display:flex;gap:8px;justify-content:center;padding:11px 0 13px}
  .hero-dot{width:9px;height:9px;padding:0;border:none;border-radius:999px;cursor:pointer;
    background:rgba(255,255,255,.38);transition:background .18s,width .18s}
  .hero-dot:hover{background:rgba(255,255,255,.7)}
  .hero-dot.on{background:var(--volt);width:26px}
  /* -38px = metade do botão (22) mais metade da faixa de bolinhas (16,5): o
     centro da SEÇÃO cai abaixo do centro da arte, e sem esse desconto as setas
     desciam pro rodapé do banner. */
  .hero-seta{position:absolute;top:50%;margin-top:-38px;z-index:6;
    width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.35);
    background:rgba(11,10,15,.42);color:#fff;cursor:pointer;display:none;place-items:center;
    padding:0;transition:background .18s}
  .hero-seta svg{width:20px;height:20px}
  .hero-seta:hover{background:rgba(11,10,15,.85)}
  .hero-seta.prev{left:12px}
  .hero-seta.next{right:12px}
  /* só onde existe cursor: no toque, arrastar com o dedo já resolve — mesma
     regra das setas das vitrines e dos depoimentos. */
  @media(hover:hover) and (min-width:900px){.hero-seta{display:grid}}
  /* a seção "Quem é" sem foto: uma coluna só, centrada, em vez de uma coluna
     vazia do lado do texto. */
  .about-in--solo{grid-template-columns:1fr;max-width:820px}
  @media(min-width:900px){.about-in--solo{grid-template-columns:1fr}}
  /* ---------- selos: cartão branco, solto do banner ---------- */
  .icons{background:#fff;border:1px solid #eeecf2;border-radius:16px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4);
    max-width:1240px;margin:16px auto;display:grid;grid-template-columns:repeat(2,1fr)}
  @media(min-width:900px){.icons{grid-template-columns:repeat(4,1fr);margin:22px auto;
    width:calc(100% - 32px)}}
  @media(max-width:899px){.icons{width:calc(100% - 32px)}}
  .ic{display:flex;gap:12px;align-items:center;padding:15px 14px;position:relative;
    justify-content:center}
  .ic+.ic:before{content:'';position:absolute;left:0;top:20%;bottom:20%;width:1px;
    background:#eeecf2}
  @media(max-width:899px){.ic:nth-child(3):before{display:none}
    .ic:nth-child(3),.ic:nth-child(4){border-top:1px solid #eeecf2}}
  .ic-i{color:var(--brand);flex:none}
  .ic-i svg{width:28px;height:28px}
  .ic b{display:block;font-size:12.5px;color:#0b0a0f;line-height:1.25;text-transform:uppercase;
    letter-spacing:.03em}
  .ic span{display:block;font-size:11px;color:#6e6a78;margin-top:2px;line-height:1.3;
    text-transform:uppercase;letter-spacing:.02em}
  /* ---------- vitrine em destaque (painel colorido + produtos) ---------- */
  /* um pouco mais larga que as vitrines comuns (1240), pra destacar.
     O fundo sai do roxo escuro para o preto — os dois derivados das cores
     do /admin, então continua acompanhando a personalização. */
  /* Era um painel com gradiente magenta. No tema claro ele vira seção comum:
     o YNS não tem caixa colorida nenhuma — o que separa uma seção da outra é
     espaço em branco, não cor. */
  .hl{background:transparent;margin:0 auto;max-width:1240px;width:100%;
    border-radius:0;overflow:visible;padding:56px 0 0}
  /* minmax(0,1fr) e não 1fr: o carrossel ao lado tem max-content de ~1240px e,
     numa coluna "auto", esticava a coluna inteira — o texto ia junto e o
     subtítulo saía cortado pelo overflow:hidden do .hl no mobile. */
  .hl-in{display:grid;gap:0;grid-template-columns:minmax(0,1fr)}
  @media(min-width:900px){.hl-in{grid-template-columns:300px minmax(0,1fr);align-items:center}}
  .hl-tx{padding:0 16px 20px;color:var(--ink)}
  @media(min-width:900px){.hl-tx{padding:30px 8px 30px 30px}}
  .hl-tx h2{font-size:24px;line-height:1.15;margin:0 0 6px;color:var(--ink);font-weight:700}
  @media(min-width:900px){.hl-tx h2{font-size:30px}}
  .hl-tx p{font-size:16px;line-height:1.55;margin:0 0 18px;color:var(--soft)}
  @media(min-width:760px){.hl-tx p{font-size:18px}}
  .hl-btn{display:inline-flex;align-items:center;gap:8px;background:var(--acao);color:#fff;
    font-weight:500;font-size:14px;padding:13px 24px;border-radius:999px;
    transition:background var(--mo-micro) ease}
  .hl-btn:hover{background:var(--acao-h);color:#fff;text-decoration:none}
  /* os cards rolam na horizontal dentro do painel */
  /* o .rowwrap genérico usa margin:0 auto, e margem auto em item de grid
     desliga o stretch e dimensiona por conteúdo (1240px) — aqui ele precisa
     acompanhar a coluna, senão o carrossel é cortado em vez de rolar. */
  .hl .rowwrap{width:100%;max-width:none;margin:0;min-width:0}
  /* scroll-padding-left é o que segura o card dentro do painel: sem ele o
     scroll-snap encosta o primeiro card no início da área de rolagem, come o
     padding-left e o cartão branco fica colado na borda arredondada do roxo.
     Tem que acompanhar o padding-left de cada breakpoint. */
  .hl-row{display:flex;gap:12px;overflow-x:auto;padding:0 16px 20px;
    scroll-snap-type:x mandatory;scroll-padding-left:16px}
  @media(min-width:900px){.hl-row{padding:20px 20px 20px 12px;scroll-padding-left:12px}}
  .hl-row>.prod{flex:0 0 196px;scroll-snap-align:start}
  @media(min-width:900px){.hl-row>.prod{flex:0 0 236px}}
  .hl-row{scrollbar-width:none;-ms-overflow-style:none}
  .hl-row::-webkit-scrollbar{display:none}
  /* ---------- vitrines ---------- */
  /* Respiro do YNS: as seções se separam por espaço, não por moldura. */
  .feat{padding:56px 0 0}
  .feat-hd{display:flex;align-items:baseline;justify-content:space-between;gap:14px;
    max-width:1240px;margin:0 auto;padding:0 16px 22px}
  /* risco fino sob o título, exatamente da largura do texto */
  /* Sem o risco colorido embaixo: título é título. */
  .feat-hd h2{font-size:24px;margin:0;letter-spacing:-.025em;color:var(--ink);font-weight:700;
    position:relative;padding-bottom:0;display:inline-block}
  @media(min-width:900px){.feat-hd h2{font-size:28px}}
  .feat-hd h2:after{content:none}
  .feat-hd a{font-size:14px;font-weight:400;color:var(--soft);white-space:nowrap}
  .feat-hd a:hover{color:var(--ink)}
  .feat-hd a i{font-style:normal;color:#8b8794;font-weight:600;font-size:12px}
  /* título da página de coleção */
  .ctitle{font-size:24px;margin:4px 0 0;color:#0b0a0f;font-weight:600}
  @media(min-width:900px){.ctitle{font-size:29px}}
  /* ---------- coleção: migalha + coluna lateral + controles ---------- */
  .crumb{font-size:13px;color:#6e6a78;padding:14px 0 12px;display:flex;gap:7px;flex-wrap:wrap}
  .crumb a{color:#6e6a78}.crumb a:hover{color:var(--brand)}
  .crumb i{font-style:normal;color:#b3aec0}
  .crumb b{color:#0b0a0f;font-weight:600}
  .colwrap{display:grid;gap:18px;align-items:start}
  @media(min-width:1000px){.colwrap{grid-template-columns:250px 1fr;gap:24px}}
  .side{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:16px 6px 12px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4);display:none}
  @media(min-width:1000px){.side{display:block}}
  .side h3{text-align:center;font-size:17px;margin:0 0 12px;color:#0b0a0f;font-weight:600}
  .side-home,.side .snv>a{display:block;padding:8px 14px;color:#0b0a0f;font-size:14px}
  .side-home:hover,.side .snv>a:hover{color:var(--brand);text-decoration:none}
  .side .snv{position:relative}
  .side .snv>a{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .side .snv>a.cur{font-weight:700;color:#0b0a0f}
  .side .snv .car{color:#3a3742;transition:transform .18s;display:grid;place-items:center;
    width:20px;height:20px;flex:none}
  .side .snv .car svg{width:13px;height:13px}
  .side .snv.open .car{transform:rotate(180deg)}
  .side .ssub{display:none;padding:2px 0 6px}
  .side .snv.open .ssub{display:block}
  .side .ssub a{display:flex;justify-content:space-between;gap:8px;padding:6px 14px 6px 26px;
    color:#3a3742;font-size:13px}
  .side .ssub a:hover{color:var(--brand);text-decoration:none}
  .side .ssub a.cur{color:var(--brand);font-weight:700}
  .side .ssub .c{color:#8b8794;font-size:11.5px}
  .ctrls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 0 14px}
  .ctrl-n{color:#6e6a78;font-size:13px}
  .ctrl-n b{color:#0b0a0f}
  .ctrl-f{margin-left:auto;color:#3a3742;font-size:13px;display:flex;align-items:center;gap:7px}
  .ctrl-f select{width:auto;height:38px;border-radius:10px;border:1.5px solid #eeecf2;
    font-size:13px;padding:0 8px}
  .ctrl-v{display:none;gap:4px}
  @media(min-width:900px){.ctrl-v{display:flex}}
  .ctrl-v button{background:none;border:none;padding:7px;border-radius:9px;cursor:pointer;
    color:#b3aec0;display:grid;place-items:center}
  .ctrl-v button svg{width:20px;height:20px}
  .ctrl-v button.on{color:#0b0a0f;background:#f2f1f5}
  .gridcard{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:14px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4)}
  .gridcard .grid{margin-top:0}
  /* visão em lista: card deitado, foto à esquerda */
  .grid.list{grid-template-columns:1fr;gap:10px}
  .grid.list .prod{flex-direction:row;gap:14px;align-items:center;padding:10px}
  .grid.list .ph{width:150px;flex:none}
  .grid.list h3{min-height:0;margin:0 0 6px;font-size:14.5px}
  .grid.list .stars{margin-bottom:0}
  .row{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;
    padding:2px 16px 18px;-webkit-overflow-scrolling:touch;
    /* a barra sai, mas o conteúdo continua rolando: no celular pelo dedo,
       no desktop pelas setas (e ainda pela roda do mouse / trackpad). */
    scrollbar-width:none;-ms-overflow-style:none}
  .row::-webkit-scrollbar{display:none}
  .row>.prod{flex:0 0 182px;scroll-snap-align:start}
  @media(min-width:900px){.row{max-width:1240px;margin:0 auto;padding:2px 16px 20px}.row>.prod{flex:0 0 252px}}
  /* ---------- setas do carrossel ---------- */
  /* o wrap acompanha a largura da própria fileira (1240), então as setas
     ficam na borda dos cards e não na borda da tela. */
  .rowwrap{position:relative;max-width:1240px;margin:0 auto}
  .rowbtn{position:absolute;top:50%;margin-top:-30px;z-index:6;
    width:44px;height:44px;border-radius:999px;border:1px solid #e7e4ee;background:#fff;
    color:#0b0a0f;cursor:pointer;display:none;place-items:center;padding:0;
    box-shadow:0 6px 18px -6px rgba(11,10,15,.28);transition:background .18s,color .18s}
  .rowbtn svg{width:19px;height:19px}
  .rowbtn:hover{background:#0b0a0f;color:#fff}
  .rowbtn.prev{left:2px}
  .rowbtn.next{right:2px}
  /* na ponta o botão some, em vez de ficar ali sem fazer nada */
  .rowbtn[hidden]{display:none}
  /* só onde existe cursor: no toque, arrastar com o dedo já resolve */
  @media(hover:hover) and (min-width:900px){.rowbtn{display:grid}}
  /* ---------- card ---------- */
  .wrap{max-width:1240px}
  /* 148px: com o cartão da grade em volta, 158 estourava e caía pra 1 coluna */
  /* 142px e não 148: num aparelho de 360px sobram 298px pra grade, e com 148
     duas colunas pediriam 307 — a grade caía pra UMA coluna e o card virava
     um bloco gigante. Mexer aqui pra cima derruba a segunda coluna de novo. */
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:11px;margin-top:14px}
  @media(min-width:900px){.grid{grid-template-columns:repeat(auto-fill,minmax(198px,1fr));gap:16px}}
  /* Card no tema claro: SEM cartão, SEM borda e SEM sombra. O que existe é o
     tile cinza da foto e, embaixo, nome e preço em texto puro — é assim que o
     YNS apresenta produto. O hover levanta a foto de leve, e só. */
  .prod{padding:0;display:flex;flex-direction:column;background:transparent;border:none;
    border-radius:0;box-shadow:none}
  .prod .ph{transition:transform var(--mo-comp) var(--ez-out)}
  .prod:hover .ph{transform:translateY(-3px)}
  /* Quadro 3:4 + contain. Medido em 125 fotos de 6 coleções: 78% perdiam
     algo no quadro 1:1 com cover (17,5% em média, 44% no pior caso), e a
     proporção dominante do catálogo é justamente 3:4 (38% das fotos, e
     quase todo o resto por perto). Com contain nada é cortado; o fundo é
     branco pra sobra de foto quadrada sumir dentro do card. */
  /* O quadro é 3:4 e a foto entra INTEIRA nele (contain): nada de tênis
     cortado. A sobra é preenchida com a PRÓPRIA foto ampliada e desfocada, e
     não com cinza — é por isso que não há mais "borda".
     Por que a sobra existe: medidas em 40 fotos do catálogo deram 60% em 3:4
     e 30% em 1:1. Não há proporção de quadro que sirva às duas ao mesmo
     tempo, então em vez de escolher quem fica com faixa, a faixa deixa de
     aparecer.
     O fundo desfocado é a MESMA imagem que o <img> já baixou: o navegador
     reaproveita do cache, sem requisição nova. */
  .ph{position:relative;border-radius:10px;overflow:hidden;background:var(--tile);
    background-size:cover;background-position:center}
  .ph::before{content:'';position:absolute;inset:-14%;
    background-image:inherit;background-size:cover;background-position:center;
    filter:blur(22px) saturate(1.15);opacity:.9;transform:scale(1.04)}
  /* z-index acima do preenchimento — e o selo, que vem antes no HTML, fica
     acima dos dois. */
  .ph img{position:relative;z-index:1;aspect-ratio:3/4;object-fit:contain;width:100%;display:block}
  .off{z-index:2}
  /* selo de desconto: percentual calculado do preço "de" que veio do catálogo */
  .off{position:absolute;left:8px;top:8px;background:var(--promo);color:#fff;font-size:11px;
    font-weight:500;padding:4px 9px;border-radius:999px;display:flex;align-items:center;gap:2px;
    box-shadow:none}
  .off svg{width:11px;height:11px}
  .tag{position:absolute;right:8px;top:8px;background:var(--acao);color:#fff;font-size:9.5px;
    font-weight:800;padding:4px 8px;border-radius:999px;letter-spacing:.03em}
  .prod h3{font-size:14px;font-weight:400;margin:12px 0 4px;line-height:1.35;min-height:0;color:var(--ink);letter-spacing:0;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  @media(min-width:900px){.prod h3{font-size:14px;min-height:38px}}
  .prod .ttl{color:inherit;display:block}
  .prod .ttl:hover{text-decoration:none}
  /* Preço em texto, não em destaque colorido: no tema claro quem chama a
     atenção é a foto, e o verde de "confirmar" fica para o botão de comprar. */
  .price{font-weight:500;font-size:15px;margin:0 0 2px;color:var(--ink);display:flex;
    align-items:baseline;gap:7px;flex-wrap:wrap}
  @media(min-width:900px){.price{font-size:16px;gap:8px}}
  .price s{color:#6e6a78;font-weight:500;font-size:12px}
  @media(min-width:900px){.price s{font-size:13px}}
  .parc{color:var(--soft);font-size:12px;margin:0 0 8px}
  /* Card DENTRO de painel escuro (os Mais Vendidos da home e o mesmo painel na
     oferta pós-compra). No tema claro o card perdeu a moldura branca que antes
     servia de fundo para o texto — sem ela, nome e preço caíam direto sobre o
     magenta e sumiam. Aqui a tinta se inverte. O tile da foto continua claro,
     que é o que separa o produto do fundo. */
  /* (o painel dos Mais Vendidos deixou de ser escuro — os cards dele seguem a
     mesma tinta do resto da loja) */
  /* A nota de 5 estrelas saiu do card no tema claro. Ela era FIXA — o catálogo
     não guarda avaliação por produto, então toda a vitrine exibia 5,0 sem um
     único dado por trás. Some junto com as molduras: o card passa a ser foto,
     nome e preço, como no YNS. O seletor restrito a .prod deixa os
     depoimentos (que têm nota de verdade) intactos. */
  .prod .stars{display:none}
  .parc b{font-weight:700}
  /* avaliação fixa — não há nota por produto no catálogo */
  .stars{display:flex;align-items:center;gap:3px;margin:0 2px 2px;color:#f5b301}
  .stars svg{width:14px;height:14px}
  .stars span{color:#8b8794;font-size:11.5px;margin-left:3px}
  .sizes{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
  .sz{border:1.5px solid #e2dfe8;background:#fff;border-radius:9px;min-width:44px;height:42px;
    padding:0 8px;font:inherit;font-size:13.5px;font-weight:700;color:#0b0a0f;cursor:pointer}
  .sz.on{border-color:var(--brand);background:var(--brand-soft);color:var(--brand-d)}
  .sz:disabled{opacity:.3;cursor:not-allowed;text-decoration:line-through}
  /* ---------- esqueleto ---------- */
  .sk{padding:10px;border:1px solid #ecebf1;border-radius:14px;background:#fff}
  .sk .b{background:linear-gradient(90deg,#eceaf1 25%,#f6f5f8 50%,#eceaf1 75%);
    background-size:200% 100%;animation:sh 1.2s infinite;border-radius:10px}
  .sk .b1{aspect-ratio:1}.sk .b2{height:12px;margin-top:11px}.sk .b3{height:12px;width:55%;margin-top:7px}
  @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @media(prefers-reduced-motion:reduce){.sk .b{animation:none}.prod:hover{transform:none}.drawer{transition:none}}
  /* ---------- institucional ---------- */
  .about{background:#f6f5f8;padding:34px 0;margin-top:24px}
  .about-in{max-width:1240px;margin:0 auto;padding:0 16px;display:grid;gap:22px}
  /* o max-height segura a altura da foto pra não passar do bloco de texto ao
     lado — a coluna dela é um pouco mais estreita justamente por isso */
  @media(min-width:900px){.about-in{grid-template-columns:48fr 52fr;align-items:center;gap:38px}}
  /* height:auto: a moldura segue a proporção da foto. A desta loja é DEITADA
     (1200x724) e cabe inteira, sem corte. Sem ele, a altura vinha do atributo
     height do <img>, travava no max-height e o cover comia as laterais da
     parede de tênis — a mesma armadilha que esticou a tabela de medidas na A
     Fonte. O max-height fica de teto para uma foto em pé no futuro; aí vale
     puxar o enquadramento com object-position (a A Fonte usava center 25%
     para o corte não passar pelo letreiro). */
  .about-img img{width:100%;height:auto;border-radius:16px;max-height:520px;object-fit:cover;
    object-position:center}
  @media(max-width:899px){.about-img img{max-height:340px}}
  .about-tx h2{font-size:24px;margin:0 0 12px;color:#0b0a0f}
  .about-tx p{font-size:14px;line-height:1.65;color:#3a3742;margin:0 0 11px}
  .about-tx strong{color:#0b0a0f}
  /* ---------- chamada do Instagram (arte à esquerda, texto à direita) ---------- */
  .insta{background:#fff;padding:38px 0 44px}
  .insta-in{max-width:1240px;margin:0 auto;padding:0 16px;display:grid;gap:26px;align-items:center}
  @media(min-width:900px){.insta-in{grid-template-columns:1fr 1fr;gap:52px;padding:0 24px}}
  /* mesmo canto do painel desenhado (.insta-art): ligar ou desligar
     LOJA_INSTAGRAM_FOTO não pode mudar o recorte da seção. */
  .insta-img img{width:100%;height:auto;display:block;border-radius:20px}
  /* a arte do dono na coluna da esquerda: mesmo canto e mesma largura da foto
     e do painel desenhado, com o <a> em volta sem virar linha de texto. */
  .insta-arte{display:block;width:100%;border-radius:20px;overflow:hidden}
  .insta-arte img{width:100%;height:auto;display:block}
  .insta-tx h2{font-size:26px;line-height:1.2;margin:0 0 16px;color:#0b0a0f;font-weight:700}
  @media(min-width:900px){.insta-tx h2{font-size:34px}}
  .insta-tx p{font-size:16px;line-height:1.75;color:#3a3742;margin:0 0 30px}
  .insta-btn{display:inline-flex;align-items:center;justify-content:center;
    background:var(--black);color:#fff;font-weight:700;font-size:15px;
    padding:19px 34px;border-radius:999px}
  .insta-btn svg{width:19px;height:19px;margin-right:9px;flex:none}
  .insta-btn:hover{background:#241f33;color:#fff;text-decoration:none}
  /* Painel desenhado no lugar da arte. Mesma proporção quadrada que a foto
     tinha (1/1), para ligar LOJA_INSTAGRAM_FOTO depois não mudar a altura da
     seção. Mesmo gradiente dos banners do topo, então acompanha a cor do
     /admin sozinho. */
  .insta-art{aspect-ratio:1/1;border-radius:20px;overflow:hidden;position:relative;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:10px;text-align:center;padding:28px;
    background:linear-gradient(150deg,var(--brand-xd) 0%,var(--black) 62%)}
  .insta-art:before{content:"";position:absolute;inset:-20% -10% auto;height:110%;
    background:radial-gradient(58% 52% at 50% 42%,var(--brand) 0%,transparent 70%);
    opacity:.45;pointer-events:none}
  .insta-art > *{position:relative;z-index:1}
  .insta-art-ico{color:#fff;display:block}
  .insta-art-ico svg{width:54px;height:54px}
  @media(min-width:900px){.insta-art-ico svg{width:66px;height:66px}}
  .insta-art-logo{height:66px;width:auto;max-width:78%;object-fit:contain;margin-top:8px}
  @media(min-width:900px){.insta-art-logo{height:88px}}
  /* fallback de marcaHtml quando não há arte: o nome escrito herda a classe */
  .insta-art .marca-tx{height:auto;font-size:27px;margin-top:8px}
  @media(min-width:900px){.insta-art .marca-tx{font-size:34px}}
  .insta-art-arroba{color:#fff;opacity:.9;font-size:15px;font-weight:600;letter-spacing:.02em}
  .insta-art-tag{margin-top:8px;color:#fff;opacity:.72;font-size:11.5px;font-weight:700;
    letter-spacing:.16em;text-transform:uppercase;line-height:1.6}
  /* ---------- rodapé ---------- */
  .foot{background:#0b0a0f;color:#918ca0;margin-top:0}
  .foot .gbar{margin-bottom:26px}
  .foot-in{max-width:1240px;margin:0 auto;padding:0 16px 26px;display:grid;gap:22px;text-align:center}
  @media(min-width:900px){.foot-in{grid-template-columns:1fr 1fr 1fr;text-align:left;align-items:start}}
  /* com a coluna INSTITUCIONAL a logo ganha um pouco menos de espaço, senão as
     três colunas de texto ficam apertadas demais no 900px */
  @media(min-width:900px){.foot-in--4{grid-template-columns:1.1fr 1fr 1fr .9fr}}
  .foot-logo{height:96px;width:auto;margin:0 auto}
  @media(min-width:900px){.foot-logo{margin:0}}
  .foot h4{color:#fff;font-size:12.5px;letter-spacing:.06em;margin:0 0 10px}
  .foot p{margin:0 0 6px;font-size:13px}
  .foot b{color:var(--volt)}.foot i{color:#c9c4d6;font-style:normal}
  /* links institucionais: cinza do rodapé, não o roxo da marca — o rodapé é
     escuro e o --brand some no #0b0a0f. Sublinha só no hover. */
  .foot-legal p{margin:0 0 8px}
  .foot-legal a{color:#c9c4d6}
  .foot-legal a:hover{color:var(--volt);text-decoration:underline}
  /* mesmo tratamento dos links institucionais: no rodapé escuro o roxo da
     marca some, então o link fica cinza claro e só acende no hover. */
  .foot-insta{color:#c9c4d6}
  .foot-insta:hover{color:var(--volt);text-decoration:underline}
  .foot .pix{display:inline-block;background:#15131d;border:1px solid #272233;border-radius:8px;
    padding:7px 16px;color:var(--volt);font-weight:800;letter-spacing:.08em}
  .foot-bt{border-top:1px solid #1c1926;padding:15px 16px calc(15px + env(safe-area-inset-bottom));
    text-align:center;font-size:11.5px;color:#6b6577}
  /* ---------- WhatsApp flutuante ---------- */
  /* o bottom:78px de antes era a folga da barra fixa do carrinho, que saiu */
  .zap{position:fixed;right:16px;bottom:18px;z-index:45;width:54px;height:54px;border-radius:999px;
    background:#25d366;color:#fff;display:grid;place-items:center;
    box-shadow:0 10px 24px -8px rgba(37,211,102,.8)}
  .zap:hover{background:#1fbb59}
  .zap svg{width:32px;height:32px}
  @media(min-width:900px){.zap{right:24px;bottom:24px}}
`;

// ---------------------------------------------------------------- VITRINE ("/")
// Contato da loja, num lugar só. Agora vem do banco (aba WhatsApp do /admin),
// então trocar o número não pede redeploy — as páginas são montadas a cada
// request, o valor novo aparece no próximo F5. Enquanto `whatsapp` estiver
// vazio, o botão flutuante e as menções ao número somem sozinhos: melhor não
// ter WhatsApp do que mandar o cliente para um número errado.
// O padrão de fábrica está em checkout/contato.js.

// O perfil do Instagram mora em LOJA.instagram (variável LOJA_INSTAGRAM) e não
// mais numa constante: uma URL cravada no código viaja junto quando a pasta é
// copiada para uma loja nova, e o botão passa a mandar o cliente pro perfil da
// loja errada. Vazio = a seção inteira some (ver instaSection).

// A conversa já abre com a mensagem escrita (aba WhatsApp do /admin), pra
// ninguém chegar só com "oi" e a loja saber de onde veio o contato.
const zapBtn = () => {
  const { whatsapp, mensagem } = getContato();
  const href = linkWhatsapp(whatsapp, mensagem);
  return href
    ? `<a class="zap" href="${href}" target="_blank" rel="noopener"
        aria-label="Falar no WhatsApp">${svgWhats()}</a>`
    : '';
};

// Topo comum às páginas da loja (header + menu + busca + drawer).
//
// O botão "Rastrear Pedido" saiu do topo em 28/08/2026 e a página de rastreio
// inteira saiu em 06/10/2026, as duas a pedido do dono: a linha do tempo era
// uma previsão que andava sozinha por dia corrido, sem consultar os Correios.
// A tela de obrigado e a da oferta pós-compra agora levam "Voltar para a loja"
// no lugar de "Acompanhar meu pedido". O código de rastreio REAL continua no
// pedido (campo do /admin) — o que saiu foi só a página onde o cliente o via.
// A sacola do topo virou BOTÃO (abre o painel lateral) em vez de link para
// /carrinho. `sacola: false` devolve o link antigo: é o que a oferta pós-compra
// e a recuperação usam, porque lá o carrinho é OUTRO (o da oferta) e abrir a
// sacola da loja por cima delas misturaria duas compras diferentes.
function shopHeader(placeholder = 'O que está buscando?', { sacola = true, noHero = false } = {}) {
  return `
  <header class="hdr${noHero ? ' hdr--hero' : ''}">
    <button class="burger" id="burger" aria-label="Menu">
      <span class="bars"><i></i><i></i><i></i></span><b>Menu</b>
    </button>
    <a class="logo" href="/">${marcaHtml(getCustomization(), 'escura', 'marca-escura')}${
      marcaHtml(getCustomization(), 'clara', 'marca-clara')}</a>
    <div class="searchwrap">
      <input id="q" class="search" type="search" placeholder="${placeholder}" autocomplete="off" aria-label="Buscar">
      <button class="sbtn" id="btnSearch" aria-label="Buscar">${svgSearch()}</button>
      <div id="sresults" class="sresults"></div>
    </div>
    <div class="acts">
      <button class="ico" id="openSearch" aria-label="Buscar" aria-expanded="false">${svgSearch()}</button>
      <span class="sep"></span>
      ${sacola
        ? `<button class="ico bag" id="openCart" type="button" aria-label="Abrir o carrinho"
            aria-expanded="false" aria-controls="sacDrawer">${svgCart()}<b id="cartCount">0</b><span>Carrinho</span></button>`
        : `<a class="ico bag" href="/carrinho">${svgCart()}<b id="cartCount">0</b><span>Carrinho</span></a>`}
    </div>
  </header>
  <script>(function(){var h=document.currentScript.previousElementSibling;
    if(h)document.documentElement.style.setProperty('--hdr-h',
      Math.round(h.getBoundingClientRect().height)+'px')})();</script>

  <div class="drawer" id="drawer"><div class="drawer-in">
    <div class="drawer-hd"><span>Menu</span><button id="closeDrawer" aria-label="Fechar">&times;</button></div>
    <div id="drawernav"></div>
  </div></div>
  <div class="scrim" id="scrim"></div>
  ${sacola ? cartDrawerHtml() : ''}`;
}

// Casca do carrinho lateral. Nasce VAZIA de propósito: quem a preenche é o
// CART_DRAWER_JS, com o que o /api/variants devolve — nenhum preço escrito no
// HTML, senão haveria um valor no fonte da página e outro no PIX.
function cartDrawerHtml() {
  return `
  <div class="sac-scrim" id="sacScrim"></div>
  <aside class="sac" id="sacDrawer" role="dialog" aria-modal="true"
         aria-label="Seu carrinho" aria-hidden="true">
    <div class="sac-hd" id="sacHd">
      <h2>Seu carrinho</h2><span class="n" id="sacCount">0</span>
      <button class="sac-x" id="sacX" type="button" aria-label="Fechar o carrinho">&times;</button>
    </div>
    <div class="sac-body" id="sacBody"></div>
    <div class="sac-ft" id="sacFoot" hidden></div>
    <!-- Escolha do 2º par: painel que desliza por cima da sacola, dentro do
         mesmo drawer. Não é outra página, e por isso a sacola continua
         montada atrás — voltar não recarrega nada. -->
    <div class="sac-sel" id="sacSel" aria-label="Escolha o seu segundo par">
      <div class="sac-sel-hd" id="sacSelHd"></div>
      <div class="sac-sel-body" id="sacSelBody"></div>
      <div class="sac-conf" id="sacSelConf" hidden></div>
    </div>
  </aside>`;
}

// Rodapé comum à vitrine e às páginas institucionais. Morava dentro do
// storePage até as políticas existirem; virou função porque agora ele também
// fecha /politica-de-privacidade, /politica-de-trocas e /termos-de-uso — e
// rodapé duplicado é rodapé que sai do ar em metade do site quando alguém
// troca o e-mail de atendimento.
//
// A coluna INSTITUCIONAL some sozinha quando linksLegais() vem vazia
// (LOJA_LEGAL=0), e aí o grid volta a ter três colunas.
function shopFooter() {
  const CT = getContato();
  const legais = linksLegais();
  return `
  <footer class="foot">
    <div class="gbar"></div>
    <div class="foot-in${legais.length ? ' foot-in--4' : ''}">
      ${marcaHtml(getCustomization(), 'escura', 'foot-logo')}
      <div class="foot-col">
        <h4>ATENDIMENTO AO CLIENTE</h4>
        <p>E-mail: <i>${escHtml(CT.email)}</i></p>
        ${CT.whatsapp ? `<p>WhatsApp: <b>${zapFormatado(CT.whatsapp)}</b></p>` : ''}
        ${LOJA.instagram ? `<p>Instagram: <a class="foot-insta"
          href="${escHtml(LOJA.instagram)}" target="_blank" rel="noopener"
          >${escHtml(arrobaDoPerfil(LOJA.instagram) || 'ver perfil')}</a></p>` : ''}
      </div>
      ${legais.length ? `<div class="foot-col foot-legal">
        <h4>INSTITUCIONAL</h4>
        ${legais.map((l) => `<p><a href="${l.href}">${escHtml(l.texto)}</a></p>`).join('')}
      </div>` : ''}
      <div class="foot-col">
        <h4>FORMAS DE PAGAMENTO</h4>
        <p class="pix">PIX</p>
      </div>
    </div>
    <div class="foot-bt">© ${escHtml(LOJA.nomeCompleto)} · Todos os direitos reservados</div>
  </footer>`;
}

// O @ tirado da URL do perfil, para aparecer escrito no painel. Aceita as
// formas que se costuma colar: URL cheia, com ou sem barra no fim, e "@nome"
// digitado direto na variável.
function arrobaDoPerfil(url) {
  // Fora ?utm_source=... e #âncora: o botão "compartilhar" do Instagram cola um
  // punhado de parâmetros de rastreio no link, e nada disso é o @.
  const limpo = String(url || '').trim().split(/[?#]/)[0].replace(/^https?:\/\//i, '');
  // O domínio sai por NOME, não por "tem ponto". A versão anterior pegava o
  // último pedaço do caminho e recusava qualquer um com ponto, para não virar
  // "@instagram.com" quando a variável tivesse só o domínio — mas ponto é
  // legítimo dentro de um @ do Instagram, e isso apagava justamente o
  // "a_fonte.ofc" desta loja. Tirando o domínio pelo nome, o que sobra é o @,
  // com ponto e tudo; e uma URL sem perfil nenhum sobra vazia, como antes.
  const semHost = limpo.replace(/^([a-z0-9-]+\.)*instagram\.com(\/|$)/i, '');
  const nome = (semHost.split('/').filter(Boolean)[0] || '').replace(/^@/, '');
  return nome ? '@' + nome : '';
}

// Chamada do Instagram, no MEIO da home (entre as duas metades das vitrines).
//
// A arte da esquerda é DESENHADA em CSS, como os banners do topo. A que existia
// aqui era um JPG com a logo, o @ e a contagem de seguidores da loja de origem
// cravados na imagem — trocar o texto ao redor não resolvia nada.
//
// Sem LOJA_INSTAGRAM a seção inteira não sai: um bloco "siga a gente" com botão
// que não leva a lugar nenhum é pior do que não ter bloco. LOJA_INSTAGRAM_FOTO
// é opcional e, quando existe, entra no lugar do painel desenhado.
function instaSection() {
  if (!LOJA.instagram) return '';
  const foto = process.env.LOJA_INSTAGRAM_FOTO || '';
  const arroba = arrobaDoPerfil(LOJA.instagram);
  // A arte do dono ocupa a MESMA coluna da esquerda que a foto e o painel
  // desenhado — arte de um lado, título, texto e botão do outro, que é o
  // formato das outras lojas. Ela é quadrada como os outros dois, então ligar
  // ou desligar não mexe na altura da seção.
  //
  // Ela também é o link: o botão desenhado DENTRO dela não clica, e é nele que
  // o dedo vai. O botão de verdade continua na coluna de texto, com o mesmo
  // destino — é ele que aparece pra quem navega por teclado ou ouve a página.
  const painel = ARTE_INSTA && !foto
    ? `<a class="insta-arte" href="${escHtml(LOJA.instagram)}" target="_blank" rel="noopener"><img
        src="${ARTE_INSTA}" width="1254" height="1254" loading="lazy" decoding="async"
        alt="Acompanhe o Instagram da ${escHtml(LOJA.nome)}: promoções exclusivas, lançamentos em primeira mão e ofertas toda semana"></a>`
    : foto
    ? `<div class="insta-img"><img src="${escHtml(foto)}" width="900" height="900"
        loading="lazy" alt="Instagram de ${escHtml(LOJA.nome)}"></div>`
    : `<div class="insta-art">
        <span class="insta-art-ico">${svgInsta()}</span>
        ${marcaHtml(getCustomization(), 'escura', 'insta-art-logo')}
        ${arroba ? `<span class="insta-art-arroba">${escHtml(arroba)}</span>` : ''}
        <span class="insta-art-tag">promoções · lançamentos · bastidores</span>
      </div>`;
  return `
  <section class="insta">
    <div class="insta-in">
      ${painel}
      <div class="insta-tx">
        <h2>Siga ${escHtml(LOJA.nome)} no Instagram</h2>
        <p>Acompanhe nosso Instagram e fique por dentro das promoções exclusivas, novos
        lançamentos e ofertas que postamos toda semana. Lá você também encontra vídeos
        reais dos produtos, feedbacks de clientes e novidades em primeira mão.</p>
        <a class="insta-btn" href="${escHtml(LOJA.instagram)}" target="_blank" rel="noopener">
          ${svgInsta()}<span>Acessar Instagram</span></a>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- DEPOIMENTOS
// Mensagens REAIS de clientes DESTA loja. Formato:
// { nome, foto, foco, nota, verificada, data, texto }. Lista vazia = a seção
// some sozinha da vitrine, do produto e do checkout.
//
// VAZIA de propósito. Os seis que vieram na cópia são clientes da A Fonte, com
// foto de rosto e autorização dada ÀQUELA loja — autorização não viaja junto
// com o código. Mesma decisão já tomada na Lumeni, na A Fonte e na Nação 13.
//
// Ao preencher: autorização e pareamento nome-foto confirmados pelo dono, e
// `verificada: true` só com pedido pago conferido no /admin — o selo afirma ao
// cliente que a compra existiu, e o campo é escrito à mão, não consulta a
// tabela `orders`. Preço citado em depoimento envelhece junto com PROMO_*.
// Depoimentos da loja. VAZIO de propósito: os que vinham no código eram de
// clientes reais e identificáveis de OUTRA loja, e reaproveitá-los seria
// atribuir a fala de alguém a uma compra que não aconteceu aqui.
//
// A seção inteira (e o muro 3D) se esconde sozinha enquanto esta lista estiver
// vazia — ver depoimentosSection. Para publicar, basta preencher:
//
//   { nome: 'Nome do cliente',
//     nota: 5,                      // 1 a 5
//     texto: 'O que a pessoa escreveu.',
//     produto: 'Tesla Coil',        // opcional
//     verificada: true,             // opcional: selo de compra verificada
//     data: '12/09',                // opcional, usado quando não há selo
//     foto: '/assets/dep/ana.webp', // opcional
//     foco: 'center 30%' }          // opcional: enquadramento da foto
//
// Com 8 ou mais depoimentos a seção vira o MURO 3D; abaixo disso fica a
// fileira que rola, porque quatro colunas com poucos cards repetiriam o mesmo
// rosto lado a lado — e repetição em prova social denuncia a falta dela.
const DEPOIMENTOS = [];

const svgStarVazia = () => svgStar().replace('fill="currentColor"', 'fill="#e2dfe8"');

function estrelasHtml(nota) {
  const cheias = Math.max(0, Math.min(5, Math.round(Number(nota) || 0)));
  return `<div class="stars">${svgStar().repeat(cheias)}${svgStarVazia().repeat(5 - cheias)}</div>`;
}

// `mini` é a variante do checkout: card menor e sem subtítulo.
//
// A trava do LOJA_DEPOIMENTOS mora AQUI, e não em quem chama. Antes ela existia
// só no checkout, e `LOJA_DEPOIMENTOS=0` — que se lê como "desliga os
// depoimentos" — deixava a seção no ar na vitrine e na página de produto. Foi o
// que aconteceu em produção em 29/08/2026: a variável no painel do Render ainda
// estava em 0, os depoimentos apareceram nas duas telas e sumiram só do
// checkout. Com a trava aqui, a variável vale para as três de uma vez.
// Monta o muro: distribui os depoimentos em 4 colunas em rodízio (e não em
// blocos), para colunas vizinhas nunca mostrarem o mesmo par de cards lado a
// lado. Cada coluna sai DUPLICADA — é o par duplicado + o translate de -50%
// que fecha o laço sem emenda.
//
// As colunas ímpares correm ao contrário: duas velocidades opostas é o que dá
// a sensação de parede em movimento em vez de lista subindo.
function muroHtml(cardFn) {
  const COLUNAS = 4;
  const colunas = Array.from({ length: COLUNAS }, () => []);
  DEPOIMENTOS.forEach((d, i) => colunas[i % COLUNAS].push(d));
  return `<div class="dep-muro"><div class="dep-muro-in">${colunas.map((col, i) => {
    const html = col.map(cardFn).join('');
    // duração diferente por coluna: com todas iguais o olho percebe a grade
    const dur = 40 + i * 6;
    return `<div class="dep-col${i % 2 ? ' dep-col--rev' : ''}" style="--dur:${dur}s"
      aria-hidden="${i ? 'true' : 'false'}">${html}${html}</div>`;
  }).join('')}</div></div>`;
}

function depoimentosSection({ mini = false } = {}) {
  if (!LOJA.depoimentos || !DEPOIMENTOS.length) return '';
  const cardHtmlDep = (d) => `
      <article class="dep-card">
        <div class="dep-who">
          <span class="dep-av" aria-hidden="true">${d.foto
            ? `<img src="${escHtml(d.foto)}" alt="" loading="lazy" width="76" height="76"${
                d.foco ? ` style="object-position:${escHtml(d.foco)}"` : ''}>`
            : escHtml(String(d.nome || '?').trim().charAt(0).toUpperCase())}</span>
          <div>
            <div class="dep-nm">${escHtml(d.nome)}${d.verificada
              ? `<span class="dep-selo" title="Compra verificada" aria-label="Compra verificada">${svgVerif()}</span>`
              : ''}</div>
            <div class="dep-meta">${d.verificada
              ? '<span class="dep-ver">Compra verificada</span>'
              : escHtml(d.data || '')}</div>
          </div>
        </div>
        ${estrelasHtml(d.nota)}
        <p class="dep-tx">“${escHtml(d.texto)}”</p>
        ${d.produto ? `<span class="dep-prod">${escHtml(d.produto)}</span>` : ''}
      </article>`;
  const cards = DEPOIMENTOS.map(cardHtmlDep).join('');
  // O muro 3D só entra com material suficiente para encher as colunas. Com
  // menos de 8 depoimentos ele repetiria o mesmo card lado a lado, e repetição
  // visível em prova social parece exatamente o que é: pouco depoimento. Nesse
  // caso fica a fileira que rola, que é honesta com qualquer quantidade.
  // No checkout (mini) a fileira também fica: ali a pessoa está pagando, não
  // passeando.
  const cabeMuro = !mini && DEPOIMENTOS.length >= 8;
  const corpo = cabeMuro ? muroHtml(cardHtmlDep) : `
    <div class="dep-wrap">
      <div class="dep-row">${cards}
      </div>
      <button class="dep-btn prev" type="button" aria-label="Anterior" hidden>${svgSeta('prev')}</button>
      <button class="dep-btn next" type="button" aria-label="Próximos">${svgSeta('next')}</button>
    </div>`;
  return `
  <section class="dep${mini ? ' dep--mini' : ''}">
    <div class="dep-hd">
      <h2>${mini ? 'Quem já comprou' : 'O que dizem quem já comprou'}</h2>
      ${mini ? '' : `<p>Avaliações de clientes ${escHtml(LOJA.nome)}</p>`}
    </div>
    ${corpo}
  </section>`;
}

// Carrossel dos depoimentos. Vive separado do ligarSetas() do SHOP_JS de
// propósito: o checkout não carrega o JS da loja, e a seção aparece nas duas
// páginas. A rolagem é nativa — as setas só empurram, então nada trava se
// este script falhar.
const DEP_JS = `
(function(){
  document.querySelectorAll('.dep-wrap').forEach(function(wrap){
    var row=wrap.querySelector('.dep-row');
    var prev=wrap.querySelector('.dep-btn.prev'), next=wrap.querySelector('.dep-btn.next');
    if(!row||!prev||!next)return;
    var passo=function(){return Math.max(200,Math.round(row.clientWidth*0.85))};
    var atualiza=function(){
      var max=row.scrollWidth-row.clientWidth;
      prev.hidden=row.scrollLeft<=2;
      next.hidden=row.scrollLeft>=max-2;
    };
    prev.addEventListener('click',function(){row.scrollBy({left:-passo(),behavior:'smooth'})});
    next.addEventListener('click',function(){row.scrollBy({left:passo(),behavior:'smooth'})});
    row.addEventListener('scroll',atualiza,{passive:true});
    window.addEventListener('resize',atualiza);
    atualiza();
  });
})();`;

// Carrossel do topo. Sai na primeira linha quando existe um slide só: sem o
// segundo banner a home continua sendo a arte parada de sempre.
const HERO_JS = `
// ---- hero: entrada da headline, profundidade e parallax ----
(function(){
  var hero=document.getElementById('hero');
  if(!hero)return;
  var calmo=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Duas linhas da headline sobem de dentro da própria caixa, uma atrás da
  // outra. Dois rAF: o primeiro fecha a pintura inicial, o segundo garante que
  // o navegador já viu o estado de partida — sem isso ele pula a transição.
  requestAnimationFrame(function(){requestAnimationFrame(function(){hero.classList.add('pronto')})});

  var palco=document.getElementById('heroPalco');
  if(!palco||calmo)return;
  var img=palco.querySelector('img');
  var temIO='IntersectionObserver' in window;

  // A aurora congela junto com o resto quando o hero sai da tela.
  var aurora=document.getElementById('aurora');
  // A flutuação do par PARA quando o hero sai da tela. Animação rodando fora
  // da viewport é bateria gasta sem ninguém ver.
  var filme=document.getElementById('heroVideo');
  var heroNaTela=true;
  // Tocar só quando FAZ SENTIDO tocar: hero na tela e aba à frente. As duas
  // condições moram aqui para não existirem dois lugares decidindo isso.
  function tocarSePuder(){
    if(!filme||!filme.src)return;
    if(!heroNaTela||document.hidden){filme.pause();return}
    var p=filme.play(); if(p&&p.catch)p.catch(function(){});
  }
  if(temIO){
    new IntersectionObserver(function(es){
      heroNaTela=es[0].isIntersecting;
      if(img)img.style.animationPlayState=heroNaTela?'running':'paused';
      if(aurora)aurora.classList.toggle('parada',!heroNaTela);
      // Fora da tela o vídeo pausa e volta de onde parou quando a pessoa sobe.
      // Isso não é "parar": é não gastar bateria desenhando quadro que ninguém
      // está vendo. Com o hero na tela ele roda em loop, sem fim.
      tocarSePuder();
    },{threshold:0}).observe(hero);
  }
  // Trocar de aba e voltar. O navegador suspende vídeo de aba em segundo plano
  // e NÃO retoma sozinho quando ela volta (o elemento não é autoplay, quem deu
  // o play foi o nosso código). Sem isto, quem saísse e voltasse encontrava o
  // loop congelado num quadro qualquer.
  document.addEventListener('visibilitychange',tocarSePuder);

  // ---- o filme do produto ----
  // Regra de ouro do LCP: ele NÃO concorre com a foto. A foto é o elemento
  // prioritário e carrega sozinha; o vídeo só começa a ser baixado depois do
  // load da página, e mesmo assim só onde faz sentido. Falhou, foi recusado
  // pelo navegador ou nem foi baixado? A foto continua lá — o hero nunca
  // depende do vídeo para existir.
  (function(){
    if(!filme)return;
    var fonte=filme.getAttribute('data-src');
    if(!fonte)return;
    var con=navigator.connection||{};
    // Quem pediu economia de dados ou está em rede lenta fica só com a foto.
    if(con.saveData)return;
    if(/(^|-)2g$/.test(con.effectiveType||''))return;
    function comecar(){
      filme.addEventListener('canplay',function(){
        palco.classList.add('filmando');
        filme.classList.add('on');
        var p=filme.play(); if(p&&p.catch)p.catch(function(){});
      },{once:true});
      filme.src=fonte;
      filme.load();
      heroNaTela=true;
    }
    // 600ms depois do load: dá folga para as fotos da vitrine, que são o que a
    // pessoa vai rolar para ver em seguida.
    if(document.readyState==='complete')setTimeout(comecar,600);
    else window.addEventListener('load',function(){setTimeout(comecar,600)});
  })();

  // Um transform só para o tilt E o parallax: dois transforms no mesmo
  // elemento se sobrescrevem, então os dois ângulos e o deslocamento entram
  // juntos, num rAF por quadro.
  var rx=0, ry=0, desloc=0, pede=0;
  function aplicar(){
    pede=0;
    palco.style.transform='translate3d(0,'+desloc.toFixed(1)+'px,0) rotateX('+
      rx.toFixed(2)+'deg) rotateY('+ry.toFixed(2)+'deg)';
  }
  function pedir(){if(!pede)pede=requestAnimationFrame(aplicar)}

  // Tilt só com mouse de verdade: 3 graus em X, 5 em Y. Em tela de toque o
  // listener nem é registrado.
  if(window.matchMedia&&window.matchMedia('(pointer: fine)').matches){
    hero.addEventListener('pointermove',function(e){
      var r=hero.getBoundingClientRect();
      if(!r.width)return;
      var x=(e.clientX-r.left)/r.width-0.5, y=(e.clientY-r.top)/r.height-0.5;
      rx=-y*6; ry=x*10;
      palco.style.transition='transform 120ms var(--ez-out)';
      pedir();
    });
    hero.addEventListener('pointerleave',function(){
      rx=0; ry=0;
      palco.style.transition='transform var(--mo-comp) var(--ez-out)';
      pedir();
    });
  }

  // Parallax ao começar a descer: o par desce um pouco, a headline sobe e o
  // que é secundário desbota. O CTA NÃO desbota — ele tem que continuar
  // legível e clicável durante todo o movimento. Nada de travar a rolagem.
  var tx=hero.querySelector('.hero-tx');
  var fracos=hero.querySelectorAll('.hero-eyebrow,.hero-nota');
  var dentro=true, pedeS=0;
  if(temIO)new IntersectionObserver(function(es){dentro=es[0].isIntersecting},{threshold:0}).observe(hero);
  window.addEventListener('scroll',function(){
    if(!dentro||pedeS)return;
    pedeS=requestAnimationFrame(function(){
      pedeS=0;
      var y=window.scrollY;
      if(y>700)return;
      desloc=Math.min(26,y*0.08);
      if(tx)tx.style.transform='translate3d(0,'+(-Math.min(20,y*0.06)).toFixed(1)+'px,0)';
      var o=String(Math.max(0,1-y/420));
      for(var i=0;i<fracos.length;i++)fracos[i].style.opacity=o;
      pedir();
    });
  },{passive:true});
})();
(function(){
  var trilho=document.getElementById('heroTrilho');
  if(!trilho||trilho.children.length<2)return;
  var n=trilho.children.length;
  var dots=[].slice.call(document.querySelectorAll('.hero-dot'));
  var prev=document.querySelector('.hero-seta.prev'),next=document.querySelector('.hero-seta.next');
  // Quem prefere menos movimento não recebe giro automático nenhum, e as
  // bolinhas saltam direto pro slide em vez de deslizar.
  var calmo=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t=null,solto=false;
  // O slide atual sai da POSIÇÃO DO SCROLL, não de um contador nosso: o dedo
  // arrasta o trilho direto, e um contador à parte sairia de sincronia com o
  // que está na tela na primeira arrastada.
  function atual(){return Math.round(trilho.scrollLeft/Math.max(1,trilho.clientWidth))}
  function marca(){var i=atual();dots.forEach(function(d,k){d.classList.toggle('on',k===i)})}
  function vai(i){trilho.scrollTo({left:trilho.clientWidth*(((i%n)+n)%n),
    behavior:calmo?'auto':'smooth'})}
  function liga(){if(solto||calmo||t)return;
    t=setInterval(function(){if(document.hidden)return;vai(atual()+1)},6000)}
  function desliga(){if(t){clearInterval(t);t=null}}
  // Mexeu no carrossel (arrastou, clicou na seta ou na bolinha), o automático
  // não volta: puxar o banner debaixo de quem está lendo é pior do que deixar
  // parado onde a pessoa deixou.
  function soltar(){solto=true;desliga()}
  trilho.addEventListener('scroll',marca,{passive:true});
  trilho.addEventListener('pointerdown',soltar);
  window.addEventListener('resize',marca);
  // no computador o automático espera enquanto o mouse está em cima da arte
  trilho.addEventListener('mouseenter',desliga);
  trilho.addEventListener('mouseleave',liga);
  dots.forEach(function(d,k){d.addEventListener('click',function(){soltar();vai(k)})});
  if(prev)prev.addEventListener('click',function(){soltar();vai(atual()-1)});
  if(next)next.addEventListener('click',function(){soltar();vai(atual()+1)});
  marca();liga();
})();`;

// O topo da home: a arte da promoção sozinha, ou ela e a "Compre com segurança"
// passando em carrossel — quem manda é o que existe na pasta assets.
//
// A promoção é sempre o slide 1: é ela que vende, e é a maior imagem da dobra
// (o LCP da home), então leva o fetchpriority alto. O segundo carrega junto,
// com prioridade BAIXA pra não disputar banda com o primeiro. `loading="lazy"`
// seria pior aqui: dentro de um trilho horizontal o navegador nem sempre
// enxerga que a imagem está por vir, e o slide entraria em branco no primeiro
// giro, seis segundos depois.
//
// Bolinhas e setas só nascem com dois slides — com um, seriam enfeite sem função.
// Aurora: as manchas de luz e os pontos, montados no servidor.
//
// As posições dos pontos saem de um gerador com SEMENTE FIXA, e não de
// Math.random a cada requisição. Motivo prático: o HTML da home leva
// `Cache-Control: no-cache`, que revalida por ETag — marcação diferente a cada
// visita mataria todo 304 e obrigaria a baixar a página inteira sempre. Com a
// semente, o HTML é byte a byte o mesmo até o próximo deploy.
const PONTOS_AURORA = (() => {
  let semente = 20260928;
  const rnd = () => {
    // gerador congruencial simples: não precisa ser bom, precisa ser estável
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
  return Array.from({ length: 14 }, () => ({
    x: (rnd() * 96 + 2).toFixed(2),
    y: (rnd() * 92 + 4).toFixed(2),
    atraso: (rnd() * 6).toFixed(2),
    duracao: (rnd() * 4 + 4).toFixed(2),
  }));
})();

function auroraHtml() {
  const pontos = PONTOS_AURORA.map((p) => `<span class="aur-p" style="left:${p.x}%;top:${p.y}%;`
    + `animation-delay:${p.atraso}s;animation-duration:${p.duracao}s"></span>`).join('');
  return `<div class="aur" id="aurora" aria-hidden="true">
    <span class="aur-pulso"></span>
    <span class="aur-b aur-b1"></span>
    <span class="aur-b aur-b2"></span>
    <span class="aur-b aur-b3"></span>
    ${pontos}
  </div>`;
}

// ------------------------------------------------------------------- HERO
// O par do hero é uma ESCOLHA, não "a primeira foto que houver". A primeira
// dobra é o lugar mais caro da loja e não pode receber o que sobrou do
// catálogo — foi assim que ela acabou com uma foto de revendedor segurando o
// tênis com a mão.
//
// A arte é o Tesla Coil Pro Preto Refletivo (o #1 dos Mais Vendidos) fotografado
// de novo em estúdio: as 17 fotos que o catálogo tem dele e dos outros focos
// foram conferidas uma a uma e NENHUMA servia — todas têm mão, pé, etiqueta no
// chão ou piso de concreto. A que está aqui saiu da foto real do catálogo
// passada pelo Kairo (nano-banana-pro) só para trocar cenário e luz: o produto
// é o mesmo, conferido detalhe a detalhe contra a foto original (cadarço branco
// nas presilhas pretas, TESLA nas duas linguetas, logo no mesh, entressola
// branca com friso preto). Ver "Hero" no LEIA-ME.
//
// Trocar o par do hero = trocar as três linhas abaixo e pôr a arte nova em
// /assets. O handle é conferido contra o catálogo antes de virar link.
const HERO_PAR = {
  handle: 'tesla-coil-pro-preto-refletivo',
  titulo: 'Tesla Coil Pro Preto Refletivo',
  arte: '/assets/hero-tesla-coil-pro-preto-refletivo.webp',
  arteMobile: '/assets/hero-tesla-coil-pro-preto-refletivo-700.webp',
  // Filme gerado a partir da MESMA arte (mesmo primeiro quadro), então a troca
  // da foto para o vídeo não tem salto. Roda em LOOP contínuo (pedido do dono,
  // 28/09/2026) e por isso o arquivo é vai-e-volta: o original ia do escuro ao
  // claro e emendar o fim com o começo daria um pulo de luz a cada volta. Com
  // a volta invertida concatenada, o movimento fecha em si mesmo e não há
  // emenda visível. Vazio = o hero fica só na foto.
  filme: '/assets/hero-tesla-coil-pro-preto-refletivo.mp4',
};

// Hero: pouco texto, produto grande. A ordem no HTML é a do CELULAR — marca,
// headline, PRODUTO, oferta, CTA — e o computador reposiciona por grid areas,
// sem duplicar markup. Toda a explicação da promoção desceu para a faixa de
// baixo: na primeira dobra ficam o produto e o número.
//
// O preço sai de PRECO, derivado de config.promo: a MESMA conta do carrinho e
// do servidor. Nenhum valor escrito à mão, nenhum valor dentro de imagem.
function heroSection(temProduto) {
  const freteGratis = availableShipping().some((o) => o.cents === 0);
  const linhas = ['Seu estilo.', 'Suas regras.'];
  const arte = comVersao(HERO_PAR.arte);
  const arteMobile = comVersao(HERO_PAR.arteMobile);
  return `<section class="hero grao" id="hero">
    <div class="hero-bg" aria-hidden="true"></div>
    ${auroraHtml()}
    <div class="hero-luz" aria-hidden="true"></div>
    <div class="hero-in">
      <div class="hero-tx">
        <span class="hero-eyebrow">${escHtml(LOJA.nome)}</span>
        <h1 class="hero-h1">${linhas
          .map((l, i) => `<span><i style="--i:${i}">${escHtml(l)}</i></span>`).join('')}</h1>
      </div>

      <div class="hero-prod" id="heroProd">
        <div class="hero-palco" id="heroPalco">
          <picture>
            <source media="(min-width:900px)" srcset="${arte}">
            <img src="${arteMobile}" width="1200" height="1200"
              fetchpriority="high" decoding="async"
              alt="${escHtml(HERO_PAR.titulo)} em foto de estúdio">
          </picture>
          ${HERO_PAR.filme ? `<video class="hero-video" id="heroVideo" muted playsinline loop
            preload="none" aria-hidden="true" tabindex="-1"
            data-src="${comVersao(HERO_PAR.filme)}"></video>` : ''}
          <span class="hero-sombra" aria-hidden="true"></span>
        </div>
      </div>

      <p class="hero-of">
        <span class="n">${PRECO.minQty} pares por <b>R$&nbsp;${PRECO.dupla}</b></span>
        ${freteGratis ? '<span class="f">Frete grátis</span>' : ''}
      </p>

      <div class="hero-acao">
        <a class="hero-cta" href="/colecao/mais-vendidos">ESCOLHER MEUS PARES<i class="sac-ar" aria-hidden="true">→</i></a>
        ${temProduto ? `<a class="hero-tag" href="/produto/${escHtml(HERO_PAR.handle)}">Ver o ${escHtml(HERO_PAR.titulo)}</a>` : ''}
      </div>
    </div>
  </section>`;
}

// Só confere se o par do hero ainda existe no catálogo — é o que decide se o
// link "Ver o ..." aparece. Handle removido do catálogo não vira link morto.
async function heroTemProduto() {
  try {
    const achados = await getProductsByHandles([HERO_PAR.handle]);
    return achados.length > 0;
  } catch (e) {
    console.error('[hero] conferência do par falhou:', e.message);
    return false;
  }
}

export async function storePage() {
  const css = STORE_CSS_SHARED;
  const heroProduto = await heroTemProduto();
  const body = `
  ${shopHeader('O que está buscando?', { noHero: true })}

  ${heroSection(heroProduto)}

  <!-- Faixa logo abaixo do hero. É PARA CÁ que veio a explicação da promoção
       que ocupava a primeira dobra: lá em cima ficam o produto e o número, aqui
       fica o que eles significam. Os valores saem de PRECO (config.promo) e o
       frete grátis só aparece se a opção de R$ 0 existir de verdade. -->
  <section class="icons">
    <div class="ic" data-rev="up" style="--i:0"><div class="ic-i">${svgTag()}</div>
      <div><b>1 par R$ ${PRECO.unit}</b><span>${PRECO.minQty} pares R$ ${PRECO.dupla}</span></div></div>
    ${availableShipping().some((o) => o.cents === 0)
      ? `<div class="ic" data-rev="up" style="--i:1"><div class="ic-i">${svgTruck()}</div>
      <div><b>Frete grátis</b><span>Para todo o Brasil</span></div></div>` : ''}
    <div class="ic" data-rev="up" style="--i:2"><div class="ic-i">${svgShield()}</div>
      <div><b>Você escolhe</b><span>Modelo, cor e numeração</span></div></div>
    <div class="ic" data-rev="up" style="--i:3"><div class="ic-i">${svgLock()}</div>
      <div><b>Pagamento via PIX</b><span>Ambiente seguro</span></div></div>
  </section>

  <div id="feats"></div>

  ${instaSection()}

  <div id="feats2"></div>

  <section class="about">
    <div class="about-in${LOJA.fotoSobre ? '' : ' about-in--solo'}">
      ${LOJA.fotoSobre ? `<div class="about-img" data-rev="left"><img src="${escHtml(comVersao(LOJA.fotoSobre))}" width="1200" height="724"
        loading="lazy" alt="Parede de tênis com o letreiro ${escHtml(LOJA.nomeCompleto)}"></div>` : ''}
      <div class="about-tx" data-rev="right">
        <h2>Quem é ${escHtml(LOJA.nome)}</h2>
        <p>${escHtml(LOJA.nome)} nasceu de uma ideia simples: tênis que a rua respeita, chegando na sua casa sem enrolação.</p>
        <p>A gente é focado. Não vende de tudo — vende <strong>TN, Tesla, Hocks, Vans e Puma</strong> e os modelos que realmente importam pra quem entende do assunto. Cada par que entra no catálogo passa por curadoria. Se a gente não usaria, não vende.</p>
        <p><strong>Rastreio desde o primeiro dia.</strong> Comprou, recebeu o código. Dá pra acompanhar o pedido do envio até a sua porta.</p>
        <p><strong>Deu errado, a gente resolve.</strong> Tamanho não serviu, chegou diferente do que você esperava, veio com defeito? Troca ou devolução — sem discussão e sem letra miúda.</p>
        <p><strong>Atendimento com gente de verdade.</strong> WhatsApp respondido por pessoa, não por robô. Se bater dúvida antes de comprar, chama.</p>
        <p><strong>${escHtml(LOJA.nome)} — o par certo, na sua porta.</strong></p>
      </div>
    </div>
  </section>

  ${depoimentosSection()}


  ${shopFooter()}

  ${zapBtn()}
  <script>${STORE_JS}</script>
  <script>${DEP_JS}</script>`;
  return html(`${LOJA.nomeCompleto} — O par certo, na sua porta`, body, css);
}

// ---------------------------------------------------------- COLEÇÃO ("/colecao/:h")
export function collectionPage(handle) {
  const css = STORE_CSS_SHARED;
  const body = `
  ${shopHeader()}
  <div class="wrap">
    <nav class="crumb"><a href="/">Página inicial</a> <i>›</i> <b id="crumbNow">Coleção</b></nav>
    <div class="colwrap">
      <aside class="side">
        <h3>Menu principal</h3>
        <a class="side-home" href="/">Início</a>
        <div id="sidenav"></div>
      </aside>
      <div class="colmain">
        <h1 class="ctitle" id="ctitle">Carregando…</h1>
        <div class="ctrls">
          <span class="ctrl-n" id="csub"></span>
          <label class="ctrl-f">Ordenar por:
            <select id="sort">
              <option value="destaque">Destaques</option>
              <option value="az">Ordem alfabética, A–Z</option>
              <option value="za">Ordem alfabética, Z–A</option>
              <option value="preco-asc">Preço: menor primeiro</option>
              <option value="preco-desc">Preço: maior primeiro</option>
            </select>
          </label>
          <div class="ctrl-v" role="group" aria-label="Visualização">
            <button id="viewGrid" class="on" aria-label="Grade">${svgGrid()}</button>
            <button id="viewList" aria-label="Lista">${svgList()}</button>
          </div>
        </div>
        <div class="gridcard">
          <div id="grid" class="grid"></div>
          <div style="text-align:center;padding:6px 0 4px">
            <button id="more" class="btn btn--ghost" style="display:none">Ver mais</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  ${zapBtn()}
  <script>window.__HANDLE=${jsonSeguro(String(handle || ''))};</script>
  <script>${COLLECTION_JS}</script>`;
  return html(`Coleção — ${LOJA.nomeCompleto}`, body, css);
}

// ---------------------------------------------------------- CARRINHO ("/carrinho")
// Passo intermediário entre "Adicionar ao carrinho" e o checkout: a pessoa vê
// o que juntou, muda quantidade e tira item antes de começar a preencher
// dados. O "Comprar" da página de produto continua pulando direto pro
// checkout — quem já escolheu não precisa desta parada.
export function cartPage() {
  const css = `${STORE_CSS_SHARED}
  .cartpg{max-width:1240px;margin:0 auto;padding:10px 16px 60px}
  .cartpg h1{font-size:27px;font-weight:600;margin:14px 0 20px;letter-spacing:-.01em}
  @media(min-width:900px){.cartpg h1{font-size:32px;margin:18px 0 26px}}
  .cartgrid{display:grid;gap:18px;align-items:start;grid-template-columns:minmax(0,1fr)}
  @media(min-width:1000px){.cartgrid{grid-template-columns:minmax(0,1fr) 360px;gap:24px}}
  /* ---- lista de itens ---- */
  .citems{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:0 18px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4)}
  .chead{display:none;padding:16px 0 12px;border-bottom:1px solid #ecebf1;
    color:#3a3742;font-size:13.5px}
  @media(min-width:760px){.chead{display:grid;grid-template-columns:minmax(0,1fr) 170px 110px;
    align-items:center;gap:12px}}
  .chead .q{text-align:center}.chead .t{text-align:right}
  .cline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px 14px;
    align-items:center;padding:18px 0;border-bottom:1px solid #f2f1f5}
  .cline:last-child{border-bottom:none}
  @media(min-width:760px){.cline{grid-template-columns:minmax(0,1fr) 170px 110px;gap:12px}}
  .cprod{display:flex;gap:14px;align-items:center;min-width:0}
  .cprod img{width:78px;height:78px;flex:none;border-radius:10px;object-fit:cover;background:#f2f1f5}
  @media(min-width:760px){.cprod img{width:92px;height:92px}}
  .cprod .nm{font-size:14.5px;line-height:1.3;color:#0b0a0f;font-weight:500}
  .cprod .nm:hover{color:var(--brand)}
  .cprod .pr{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin-top:6px}
  .cprod .pr b{color:var(--comprar);font-size:15px;font-weight:700}
  .cprod .pr s{color:#8b8794;font-size:13px}
  /* coluna do meio: contador + remover, igual ao print */
  .cqty{display:flex;flex-direction:column;align-items:center;gap:6px}
  .cstep{display:inline-flex;align-items:center;background:#f2f1f5;border-radius:999px;overflow:hidden}
  .cstep button{width:42px;height:42px;border:none;background:none;cursor:pointer;
    font-size:19px;color:#3a3742;line-height:1}
  .cstep button:hover{background:#e7e5ec}
  .cstep button:disabled{opacity:.35;cursor:not-allowed}
  .cstep span{min-width:44px;text-align:center;font-size:14.5px;font-weight:600}
  .crm{background:none;border:none;padding:0;cursor:pointer;font:inherit;
    font-size:13px;color:#6e6a78;text-decoration:underline}
  .crm:hover{color:#c2334d}
  .cltot{text-align:right;font-size:14.5px;font-weight:600;color:#0b0a0f;white-space:nowrap}
  /* no mobile o total da linha senta ao lado do contador */
  @media(max-width:759px){.cline{grid-template-columns:minmax(0,1fr)}
    .cfoot{display:flex;align-items:center;justify-content:space-between;gap:12px}}
  @media(min-width:760px){.cfoot{display:contents}}
  /* ---- resumo ---- */
  .csum{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:20px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4)}
  @media(min-width:1000px){.csum{position:sticky;top:16px}}
  .csum-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
    font-size:14px;color:#3a3742;margin-bottom:9px}
  .csum-row.big{font-size:19px;font-weight:700;color:#0b0a0f;margin-bottom:12px}
  .csum-row.big b{font-size:22px;letter-spacing:-.02em}
  .csum-row .desc{color:var(--brand)}
  .csave{color:var(--brand);font-weight:700;font-size:14.5px;margin:0 0 12px}
  .cbadge{display:inline-block;background:var(--volt);color:#0a0a0a;font-size:11px;font-weight:800;
    letter-spacing:.05em;padding:6px 13px;border-radius:999px;margin-bottom:4px}
  .cnudge{background:var(--brand-soft);color:var(--brand-d);border-radius:12px;padding:11px 13px;
    font-size:13px;font-weight:600;margin:12px 0 0}
  .csum hr{border:none;border-top:1px solid #ecebf1;margin:16px 0}
  .cbtn{display:flex;align-items:center;justify-content:center;width:100%;border-radius:999px;
    padding:17px 18px;font:inherit;font-weight:800;font-size:14.5px;letter-spacing:.04em;
    cursor:pointer;border:2px solid transparent}
  .cbtn--go{background:var(--comprar);color:var(--comprar-tinta)}
  .cbtn--go:hover{background:var(--comprar-d)}
  .cbtn--back{background:#fff;color:var(--brand-d);border-color:var(--brand);margin-top:11px}
  .cbtn--back:hover{background:var(--brand-soft);text-decoration:none}
  .csafe{display:flex;align-items:center;justify-content:center;gap:9px;
    margin:18px 0 6px;color:#3a3742;font-size:13.5px;font-weight:600}
  .csafe svg{width:17px;height:17px}
  .cpix{display:flex;justify-content:center}
  .cpix svg{width:30px;height:30px}
  /* ---- carrinho vazio ---- */
  .cempty{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:46px 22px;
    text-align:center;box-shadow:0 6px 20px -16px rgba(11,10,15,.4)}
  .cempty p{color:#6e6a78;margin:0 0 20px}
  .cempty .cbtn{max-width:280px;margin:0 auto}
  .cskel{height:112px;border-radius:12px;background:#f2f1f5;margin:16px 0}`;

  const body = `
  ${shopHeader()}
  <div class="cartpg">
    <nav class="crumb"><a href="/">Página inicial</a> <i>›</i> <b>Carrinho</b></nav>
    <h1>Meu carrinho</h1>
    <div id="cartRoot"><div class="citems"><div class="cskel"></div><div class="cskel"></div></div></div>
  </div>
  ${zapBtn()}
  <script>${CART_JS}</script>`;
  return html(`Meu carrinho — ${LOJA.nomeCompleto}`, body, css);
}

// ---------------------------------------------------------------- CHECKOUT ("/checkout")
export function checkoutPage() {
  const cx = getCustomization();
  // Sombra de foco na cor da marca a 7%. Sai calculada aqui (e não como var no
  // CSS) porque rgba() precisa dos componentes, e a cor vem do /admin.
  const [bR, bG, bB] = hexRgb(cx.colors.brand);
  const brandFoco = `rgba(${bR},${bG},${bB},.07)`;
  // A faixa do /admin manda; CONFIANCA é o que aparece enquanto ninguém mexeu lá.
  const confianca = (cx.topbar ? cx.topbar.split('·') : CONFIANCA)
    .map((s) => s.trim()).filter(Boolean);

  const css = `${DEP_CSS}
    /* ============================================================
       CHECKOUT — folha própria. Todo seletor daqui começa com .ck ou
       .ck- de propósito: este mesmo BASE_CSS é importado pelas páginas
       da vitrine e do rastreio, e um nome curto como .card ou .row
       vazaria para lá.
       ============================================================ */
    .ck{--ck-bg:#f2f3f5;--ck-card:#fff;--ck-tinta:#1a1a1a;--ck-tinta-2:#3f4450;
      --ck-cinza:#6b7280;--ck-tinta-inv:#fff;--ck-placeholder:#9aa0ab;
      --ck-linha:#dddddd;--ck-linha-suave:#e8eaee;--ck-linha-forte:#c9ccd3;--ck-btn-tinta:#fff;
      --ck-fraca:#f4f5f7;
      --ck-verde:#0d874c;--ck-verde-d:#0a693b;--ck-verde-rgb:13,135,76;--ck-vermelho:#d92d20;
      --ck-erro-bg:#fdecea;--ck-erro-tinta:#b42318}
    body:has(.ck){background:var(--ck-bg)}
    .ck{background:var(--ck-bg);color:var(--ck-tinta);padding-bottom:40px}

    /* ---- cronômetro (barra escura, grudada no topo) ---- */
    .ck-timer{position:sticky;top:0;z-index:20;background:var(--black);color:var(--ck-tinta-inv);
      display:flex;align-items:center;justify-content:center;gap:12px;
      padding:10px 14px;font-size:12.5px;font-weight:700;letter-spacing:.4px}
    .ck-timer b{font-size:15px;font-variant-numeric:tabular-nums;letter-spacing:1px}
    /* ---- faixa de confiança (clara, texto puro, ~40px) ---- */
    .ck-trust{background:var(--ck-card);border-bottom:1px solid var(--ck-linha-suave);
      display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 26px;
      padding:11px 16px;font-size:12.5px;color:var(--ck-tinta-2)}
    .ck-trust span{display:inline-flex;align-items:center;gap:6px}
    .ck-trust svg{width:14px;height:14px;color:var(--brand);flex:none}
    /* ---- logotipo ---- */
    .ck-logo{display:flex;justify-content:center;padding:22px 16px 20px}
    .ck-logo img{height:76px;width:auto}
    /* Marca escrita, para quando ainda não há arte de logo. Repetida aqui de
       propósito: esta folha é a do checkout e não herda o STORE_CSS_SHARED.
       Fundo do topo do checkout é CLARO, então a tinta é escura. */
    .ck-logo .marca-tx{display:inline-flex;align-items:center;height:56px;
      color:#0b0a0f;font-weight:800;font-size:26px;letter-spacing:.06em;
      text-transform:uppercase;white-space:nowrap;line-height:1}
    .ck-logo a{text-decoration:none}
    /* ---- banner "Compra segura" (arte do dono), no lugar do topo com a logo ---- */
    /* .ck-wrap vem DEPOIS nesta folha e zera o padding de cima; a classe
       dupla ganha dela sem depender da ordem. */
    .ck-wrap.ck-topo-banner{padding-top:24px}
    .ck-topo-banner a,.ck-topo-banner picture{display:block}
    .ck-banner{display:block;width:100%;height:auto;border-radius:12px;margin:0 0 24px}

    /* ---- grade: formulário + carrinho ---- */
    .ck-wrap{max-width:1080px;margin:0 auto;padding:0 16px}
    .ck-grid{display:grid;grid-template-columns:minmax(0,1fr) 21.75rem;gap:32px;align-items:start}
    /* Sem isto o <input> impõe a largura intrínseca dele (~20 caracteres,
       609px medidos) e estoura a grade inteira para a direita no celular. */
    .ck-grid > *{min-width:0}
    .ck-cart{position:sticky;top:24px;display:flex;flex-direction:column;gap:16px}

    /* ---- opções de estrutura (/admin → Personalizar) ----
       São modificadores na raiz .ck, e não folhas alternativas: o checkout
       continua sendo UM arranjo de HTML, então corrigir um bug conserta todas
       as combinações de uma vez. Sem crase nestes comentários: esta folha
       inteira é um template literal, e uma crase solta encerraria a string. */

    /* resumo do pedido acima do formulário, também no desktop */
    .ck--resumo-topo .ck-grid{grid-template-columns:minmax(0,1fr)}
    .ck--resumo-topo .ck-cart{position:static;order:-1}

    /* resumo recolhido atrás de uma barra que abre ao toque */
    .ck--resumo-recolhivel .ck-grid{grid-template-columns:minmax(0,1fr)}
    .ck--resumo-recolhivel .ck-cart{position:static;order:-1}
    .ck-dobra{border:none;padding:0;background:none}
    .ck-dobra > summary{list-style:none;cursor:pointer;background:var(--ck-card);
      border:1px solid var(--ck-linha-suave);border-radius:12px;padding:15px 18px;
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      font-size:14.5px;font-weight:600}
    .ck-dobra > summary::-webkit-details-marker{display:none}
    .ck-dobra > summary .vlr{font-weight:700}
    .ck-dobra > summary .seta{transition:transform .18s ease;color:var(--ck-cinza)}
    .ck-dobra[open] > summary{border-radius:12px 12px 0 0;border-bottom:none}
    .ck-dobra[open] > summary .seta{transform:rotate(180deg)}
    .ck-dobra[open] .ck-card{border-radius:0 0 12px 12px}
    @media (prefers-reduced-motion:reduce){.ck-dobra > summary .seta{transition:none}}

    /* cantos retos: um lugar só decide o raio de tudo que é caixa */
    .ck--reto .ck-card,.ck--reto .ck input,.ck--reto .ck-btn,.ck--reto .ck-metodo,
    .ck--reto .ck-lembre,.ck--reto .ck-lgpd,.ck--reto .ck-pm,.ck--reto .ck-tag,
    .ck--reto .ck-err,.ck--reto .ck-dobra > summary,.ck--reto .ck-dobra[open] .ck-card,
    .ck--reto .ck-it img,.ck--reto .ck-bump-head,.ck--reto .ck-bump-head img,
    .ck--reto .ck-banner{border-radius:0}

    /* ---- cartão ---- */
    .ck-card{background:var(--ck-card);border-radius:12px;padding:24px;
      box-shadow:0 1px 2px rgba(16,16,26,.05)}
    .ck-card + .ck-card{margin-top:16px}
    .ck-h{font-size:16px;font-weight:700;letter-spacing:-.2px;margin:0 0 20px}
    .ck-h .ck-num{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;
      background:var(--brand);color:var(--ck-tinta-inv);font-size:12px;margin-right:8px;vertical-align:2px}

    /* ---- campos ---- */
    .ck-fs{display:flex;flex-direction:column;gap:18px}
    .ck-fs .ck-row{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .ck-f{display:flex;flex-direction:column;min-width:0}
    .ck-f label{font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ck-tinta)}
    /* O rótulo fica ACIMA do campo, não como placeholder: placeholder some no
       primeiro caractere, e quem volta para conferir não sabe mais o que era
       cada campo. O placeholder continua, só como exemplo do formato. */
    .ck input,.ck select,.ck textarea{min-width:0;width:100%;height:47px;padding:0 14px;
      border:1px solid var(--ck-linha);border-radius:8px;background:var(--ck-card);
      font:inherit;font-size:14px;color:var(--ck-tinta)}
    .ck input::placeholder{color:var(--ck-placeholder)}
    /* Vem DEPOIS da regra global input:focus do BASE_CSS de propósito: as duas
       especificidades empatam e ganha a última do arquivo. */
    .ck input:focus,.ck select:focus{outline:none;border-color:var(--brand);
      box-shadow:0 0 0 3px ${brandFoco}}
    /* Erro: a mensagem já está escrita no HTML, escondida. Validar só liga a
       classe .erro — nenhum texto de erro nasce dentro do JavaScript. */
    .ck-msg{display:none;font-size:12px;color:var(--ck-vermelho);margin-top:6px;line-height:1.35}
    .ck-f.erro input{border-color:var(--ck-vermelho)}
    .ck-f.erro input:focus{box-shadow:0 0 0 3px rgba(217,45,32,.08)}
    .ck-f.erro .ck-msg{display:block}
    .ck-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ck-cinza);cursor:pointer}
    .ck-check input{width:auto;height:auto;min-width:0;accent-color:var(--brand);cursor:pointer}
    .ck-link{font-size:13px;color:var(--brand)}

    /* status do CEP dentro da própria caixa do campo */
    .ck-cep{position:relative}
    .ck-cep input{padding-right:42px}
    /* 40px = altura do rótulo (13px, entrelinha 1.5) + os 6px de respiro +
       metade dos 47px do campo, menos metade do ícone. Centraliza o status
       dentro da própria caixa do CEP. */
    .ck-st{position:absolute;right:13px;top:40px;width:18px;height:18px;display:none}
    .ck-cep.buscando .ck-st--load{display:block}
    .ck-cep.achou .ck-st--ok{display:block}
    .ck-st--ok{color:var(--brand)}
    .ck-st--load{border:2px solid var(--ck-linha-suave);border-top-color:var(--brand);border-radius:50%;
      animation:ckgira .7s linear infinite}
    @keyframes ckgira{to{transform:rotate(360deg)}}

    /* ---- caixa tracejada "usamos seus dados" ---- */
    .ck-lgpd{border:1px dashed var(--ck-linha-forte);border-radius:10px;padding:16px;margin-top:18px}
    .ck-lgpd b{display:block;font-size:13px;font-weight:600;margin-bottom:10px}
    .ck-lgpd ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
    .ck-lgpd li{display:flex;gap:9px;font-size:13px;color:var(--ck-cinza);line-height:1.4}
    .ck-lgpd li svg{width:15px;height:15px;color:var(--brand);flex:none;margin-top:2px}

    /* ---- frete ---- */
    .ck-sub{font-size:13px;font-weight:600;margin:20px 0 10px}
    .ck-opts{display:flex;flex-direction:column;gap:10px}
    .ck-opt{display:flex;align-items:center;gap:12px;border:1px solid var(--ck-linha);
      border-radius:8px;padding:13px 14px;cursor:pointer}
    .ck-opt.sel{border-color:var(--brand);background:${softTint(cx.colors.brand, 0.94)}}
    .ck-opt input{width:auto;height:auto;min-width:0;accent-color:var(--brand);flex:none}
    .ck-opt .n{font-size:13.5px;font-weight:600;line-height:1.2}
    .ck-opt .e{font-size:12px;color:var(--ck-cinza)}
    .ck-opt .p{margin-left:auto;font-size:13.5px;font-weight:700}
    .ck-opt .p.free{color:var(--brand)}

    /* ---- pagamento ---- */
    .ck-pms{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
    .ck-pm{width:100px;padding:0;border:1px solid var(--ck-linha);border-radius:8px;background:var(--ck-card);
      cursor:pointer;overflow:hidden}
    .ck-pm .face{height:54px;display:grid;place-items:center}
    .ck-pm .face svg{width:44px;height:auto}
    .ck-pm.sel{border-color:var(--brand);box-shadow:0 0 0 2px ${brandFoco}}
    .ck-pm .off{display:block;background:var(--volt);color:#0a0a0a;font-size:10.5px;font-weight:700;
      padding:3px 0;letter-spacing:.2px}
    .ck-metodo{border:1px solid var(--ck-linha-suave);border-radius:10px;padding:18px}
    .ck-tag{display:inline-block;background:var(--volt);color:#0a0a0a;font-size:10.5px;font-weight:700;
      letter-spacing:.6px;padding:4px 9px;border-radius:4px;margin-bottom:12px}
    .ck-metodo .hl{font-size:14.5px;font-weight:600;margin:0 0 8px}
    .ck-metodo p{font-size:13px;color:var(--ck-cinza);line-height:1.55;margin:0}
    .ck-lembre{background:var(--ck-fraca);border-radius:8px;padding:13px 15px;margin-top:14px}
    .ck-lembre b{display:block;font-size:12.5px;margin-bottom:7px}
    .ck-lembre ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
    .ck-lembre li{font-size:12.5px;color:var(--ck-cinza);line-height:1.45}

    /* ---- order bump ----
       Cada oferta é um bloco fechado em si: a moldura saiu do container e foi
       para o card, então duas ofertas são dois quadros, e não uma lista dentro
       de uma caixa só. O container agora só empilha e dá o respiro entre eles. */
    /* gap generoso: com 12px as tres ofertas liam como um bloco so, e o olho
       nao separava onde uma acabava e a outra comecava. */
    .ck-bump{margin-top:22px;display:flex;flex-direction:column;gap:20px}
    /* Cartao neutro: o fundo e a borda eram na cor da marca e pesavam demais
       tres vezes seguidas, ainda mais logo abaixo do bloco do PIX. Agora e o
       mesmo cartao branco do resto do checkout, e quem destaca a oferta e o
       preco verde. A marca ficou so no quadradinho de marcar. */
    .ck-bump-head{display:flex;gap:12px;align-items:center;cursor:pointer;
      border:1px solid var(--ck-linha);background:var(--ck-card);
      border-radius:10px;padding:16px;transition:border-color .15s,box-shadow .15s}
    .ck-bump-head:hover{border-color:var(--ck-linha-forte)}
    /* A oferta marcada precisa se distinguir das outras duas sem voltar a
       pintar o cartao: borda na cor da marca e uma sombra curta. */
    .ck-bump-head.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
    .ck-bump-head input{width:20px;height:20px;min-width:0;accent-color:var(--brand);flex:none}
    .ck-bump-head img{width:52px;height:52px;border-radius:6px;object-fit:cover;background:var(--ck-fraca);flex:none}
    .ck-bump-t{font-weight:700;font-size:14px;line-height:1.25;color:var(--ck-tinta)}
    .ck-bump-d{font-size:12.5px;margin-top:2px}
    .ck-bump-pr{font-size:13px;font-weight:700;margin-top:5px}
    .ck-bump-pr .old{color:var(--ck-cinza);text-decoration:line-through;font-weight:500;margin-right:6px}
    .ck-bump-pr .new{color:var(--comprar)}
    /* Grade do bump (a calça é P/M/G/GG). Fica na mesma linha do preço, e
       não numa linha nova, para o card não crescer e empurrar o botão de
       pagar para fora da primeira tela no celular. */
    /* '.ck .ck-bump-sz' e nao '.ck-bump-sz': a folha do checkout tem
       '.ck input,.ck select,.ck textarea{width:100%;height:47px}' para os campos
       do formulario, e essa regra ganha de uma classe sozinha na especificidade.
       Sem os dois seletores o seletor de tamanho vira uma caixa de largura
       inteira numa linha propria, em vez de ficar ao lado do preco.
       width e height voltam a 'auto' pelo mesmo motivo. */
    .ck .ck-bump-sz{width:auto;height:auto;margin-left:10px;padding:3px 22px 3px 8px;border-radius:7px;
      border:1px solid var(--ck-linha);background:var(--ck-card);color:var(--ck-tinta);
      font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;vertical-align:1px;
      appearance:none;-webkit-appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 7px center;background-size:9px}
    .ck .ck-bump-sz:focus{outline:none;border-color:var(--brand)}

    /* ---- botões ---- */
    .ck-nav{display:flex;justify-content:flex-end;gap:12px;margin-top:20px}
    .ck-btn{border:none;cursor:pointer;font:inherit;font-weight:700;font-size:13.5px;
      text-transform:uppercase;letter-spacing:.3px;border-radius:6px;padding:15px 24px;
      display:inline-flex;align-items:center;justify-content:center;gap:8px}
    .ck-btn--main{background:var(--ck-verde);color:var(--ck-btn-tinta)}
    .ck-btn--main:hover:not(:disabled){background:var(--ck-verde-d)}
    .ck-btn--main:disabled{opacity:.5;cursor:not-allowed}
    .ck-btn--ghost{background:var(--ck-card);border:1px solid var(--ck-linha);color:var(--ck-cinza)}
    .ck-btn--ghost svg{width:15px;height:15px}
    .ck-err{background:var(--ck-erro-bg);color:var(--ck-erro-tinta);border-radius:8px;padding:12px 15px;
      margin-bottom:16px;display:none;font-size:13.5px}

    /* ---- carrinho ---- */
    .ck-sum-h{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:700;
      letter-spacing:-.2px;margin-bottom:20px}
    /* Rede de segurança: SVG sem width/height desenha no tamanho padrão de
       elemento substituído (300x150) e estoura o painel. Vale para qualquer
       ícone que venha a entrar aqui. */
    .ck svg{max-width:100%}
    .ck-cnt{margin-left:auto;width:23px;height:23px;border-radius:50%;background:var(--brand);
      color:var(--ck-tinta-inv);display:grid;place-items:center;font-size:12px;font-weight:700}
    .ck-it{display:flex;gap:12px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--ck-linha-suave)}
    .ck-it:last-child{border-bottom:none;padding-bottom:0;margin-bottom:0}
    .ck-it img{width:48px;height:48px;border-radius:6px;object-fit:cover;background:var(--ck-fraca);flex:none}
    .ck-it .nm{font-size:13px;font-weight:600;line-height:1.3;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .ck-it .bt{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}
    .ck-it .pr{font-size:13px;font-weight:700}
    .ck-it .tag{font-size:11.5px;color:var(--ck-cinza)}
    /* Gravacao personalizada: uma linha por texto gravado, logo abaixo do nome
       do produto. Usa os tokens do checkout (--ck-*) para acompanhar a cor
       escolhida no /admin em vez de cravar cor aqui. */
    .ck-grav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;font-size:11.5px}
    .ck-grav-tag{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      padding:2px 6px;border-radius:999px;background:var(--ck-fraca);color:var(--ck-cinza)}
    .ck-grav-txt{font-weight:700;letter-spacing:.05em;text-transform:uppercase;
      word-break:break-word;min-width:0}
    .ck-grav-est,.ck-grav-qtd{color:var(--ck-cinza)}
    .ck-grav--sem{color:var(--ck-cinza);font-style:italic}
    /* Pílula de quantidade. As barrinhas são <i>, não os caracteres − e +:
       caractere muda de tamanho conforme a fonte que carregar. */
    .ck-qty{display:inline-flex;align-items:center;border:1px solid var(--ck-linha);border-radius:30px;
      padding:2px}
    .ck-qty button{width:26px;height:26px;border:none;background:none;cursor:pointer;padding:0;
      position:relative;display:grid;place-items:center}
    .ck-qty button i{position:absolute;display:block;border-radius:1px}
    .ck-qty .menos i{width:9px;height:2px;background:var(--ck-vermelho)}
    .ck-qty .mais i:first-child{width:9px;height:2px;background:var(--brand)}
    .ck-qty .mais i:last-child{width:2px;height:9px;background:var(--brand)}
    .ck-qty span{min-width:26px;text-align:center;font-size:13px;font-weight:600}
    .ck-tot{border-top:1px solid var(--ck-linha-suave);margin-top:16px;padding-top:14px;
      display:flex;flex-direction:column;gap:8px}
    .ck-tot .l{display:flex;justify-content:space-between;font-size:13px;color:var(--ck-cinza)}
    .ck-tot .l.desc{color:var(--brand);font-weight:600}
    .ck-tot .l.big{font-size:15px;font-weight:700;color:var(--comprar);margin-top:2px}
    .ck-safe{display:flex;gap:12px;align-items:flex-start}
    .ck-safe svg{width:20px;height:20px;color:var(--brand);flex:none}
    .ck-safe b{display:block;font-size:13px;margin-bottom:3px}
    .ck-safe p{margin:0;font-size:12.5px;color:var(--ck-cinza);line-height:1.45}
    .ck-vazio{padding:28px;text-align:center;color:var(--ck-cinza)}

    /* ---- PIX / sucesso ---- */
    .ck-pix,.ck-ok{max-width:460px;margin:0 auto;text-align:center}
    .ck-pix h2,.ck-ok h2{font-size:19px;margin:0 0 6px}
    .ck-pix .qr{margin:18px auto;border:1px solid var(--ck-linha);border-radius:10px;padding:10px}
    .ck-copy{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;
      background:var(--ck-fraca);border-radius:8px;padding:12px;text-align:left;line-height:1.5}
    .ck-wait{display:inline-flex;gap:8px;align-items:center;color:var(--ck-cinza);
      margin-top:16px;font-size:13.5px}
    .ck-dot{width:9px;height:9px;border-radius:50%;background:var(--brand);animation:ckp 1s infinite}
    @keyframes ckp{50%{opacity:.3}}
    .ck-ok .big{font-size:44px}
    .ck-ok .ck-btn{width:100%;margin-top:10px}

    /* ---- oferta pós-compra na tela de obrigado ---- */
    .ck-oferta{margin-top:20px;padding:18px 16px;border-radius:14px;text-align:center;
      border:1px dashed var(--brand);background:rgba(var(--brand-rgb),.06)}
    .ck-oferta-selo{display:inline-block;background:var(--brand);color:#fff;font-size:11px;
      font-weight:800;letter-spacing:.02em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
    .ck-oferta-tt{margin:10px 0 4px;font-size:17px;font-weight:700;color:var(--ck-tinta)}
    .ck-oferta-tt b{color:var(--brand)}
    .ck-oferta-sub{margin:0;font-size:13px;line-height:1.5;color:var(--ck-cinza)}
    /* Verde e não o roxo da marca: é o mesmo verde do "Comprar agora" da página
       da oferta, então o botão daqui e o de lá são visivelmente a mesma ação.
       Hoje ele é o único botão da tela — rastreio e "voltar para a loja" saíram
       de propósito, pra oferta ser o único caminho adiante. */
    .ck-ok .ck-oferta-btn{margin-top:14px;background:var(--ck-verde);border-color:var(--ck-verde)}

    /* ---- rodapé ---- */
    .ck-foot{max-width:1080px;margin:36px auto 0;padding:20px 16px 0;border-top:1px solid var(--ck-linha-suave);
      display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 18px;
      font-size:12px;color:var(--ck-cinza)}
    .ck-foot .flags{display:flex;gap:6px}
    .ck-foot .flags svg{width:34px;height:23px;border:1px solid var(--ck-linha-suave);border-radius:3px}
    .ck-foot .sep{display:inline-flex;align-items:center;gap:6px}
    .ck-foot .sep svg{width:13px;height:13px}
    /* políticas: quebram para a própria linha (flex-basis:100%) pra não
       espremer o "Ambiente seguro" no celular */
    .ck-foot .ck-legal{flex-basis:100%;display:flex;flex-wrap:wrap;justify-content:center;
      gap:6px 14px;padding-top:4px}
    .ck-foot .ck-legal a{color:var(--ck-cinza);text-decoration:underline;text-underline-offset:2px}
    .ck-foot .ck-legal a:hover{color:var(--ck-tinta)}

    /* ---- depoimentos dentro do cartão ---- */
    .ck-deps{margin-top:16px}
    .ck-deps .dep--mini{padding:0}
    .ck-deps .dep-hd{text-align:left;margin-bottom:14px}
    .ck-deps .dep-hd h2{font-size:16px;font-weight:700;letter-spacing:-.2px}

    /* ---- até 900px: uma coluna, carrinho ANTES do formulário ----
       A pessoa confere o que está levando antes de começar a digitar; e o
       sticky sai, senão o resumo cobriria o formulário na rolagem. */
    @media(max-width:900px){
      .ck-grid{grid-template-columns:minmax(0,1fr);gap:16px}
      .ck-cart{position:static;order:-1}
      .ck-fs .ck-row{grid-template-columns:minmax(0,1fr)}
      .ck-nav{flex-direction:column-reverse;gap:10px}
      .ck-btn{width:100%}
      .ck-logo{padding:18px 16px 16px}
      .ck-logo img{height:64px}
      .ck-logo .marca-tx{height:46px;font-size:22px}
      .ck-card{padding:18px}
      .ck-wrap.ck-topo-banner{padding-top:16px}
      .ck-banner{margin-bottom:16px}
    }
  `;

  const iCheck = svgCheck();
  const bandeiras = `<span class="flags">${svgPixBrand()}</span>`;
  // Políticas no rodapé do checkout. Abrem em ABA NOVA de propósito: quem está
  // no meio do pagamento e clica em "Trocas" não pode perder o carrinho e o
  // formulário já preenchido pra ler três parágrafos.
  const legaisCk = linksLegais();

  // Métodos de pagamento: só o que a loja processa de verdade. O app fecha
  // pedido por PIX (gateway em /admin), então é UM chip. Botão que o cliente
  // clica e não acontece nada é defeito, não enfeite.
  const metodos = `
        <div class="ck-pms">
          <button type="button" class="ck-pm sel" aria-pressed="true">
            <span class="face">${svgPix()}</span>
          </button>
        </div>`;

  const L = cx.layout;
  const mods = [
    L.resumo === 'topo' ? 'ck--resumo-topo' : '',
    L.resumo === 'recolhivel' ? 'ck--resumo-recolhivel' : '',
    L.cantos === 'reto' ? 'ck--reto' : '',
  ].filter(Boolean).join(' ');

  const body = `
  <div class="ck${mods ? ' ' + mods : ''}">
    ${L.cronometro ? `<div class="ck-timer" id="ckTimer">
      <span>${escHtml(CRONOMETRO.titulo)}</span>
      <b id="ckClock" data-min="${CRONOMETRO.minutos}">00 : 00 : 00</b>
    </div>` : ''}
    ${L.trust && confianca.length ? `<div class="ck-trust">${
      confianca.map((t) => `<span>${iCheck} ${escHtml(t)}</span>`).join('')}</div>` : ''}

    ${TEM_BANNER_CK ? `<header class="ck-wrap ck-topo-banner"><a href="/"><picture>
      <source media="(min-width:600px)" width="2172" height="724" srcset="${BANNER_CK_DESKTOP}">
      <img class="ck-banner" src="${BANNER_CK_MOBILE}" width="1774" height="887" decoding="async"
        alt="${escHtml(LOJA.nome)} — compra segura: seus dados estão protegidos durante o pagamento">
    </picture></a></header>` : `<header class="ck-logo"><a href="/">${marcaHtml(cx, 'clara')}</a></header>`}

    <div class="ck-wrap">
      <div id="root" class="ck-grid">
        <section class="ck-form">
          <div id="err" class="ck-err" data-rede="Falha de conexão. Confira a internet e tente de novo."></div>

          <!-- ================= ETAPA 1: identificação + entrega ================= -->
          <div id="etapa1">
            <div class="ck-card">
              <h2 class="ck-h"><span class="ck-num">1</span>Identificação</h2>
              <div class="ck-fs">
                <div class="ck-f" id="femail">
                  <label for="email">E-mail</label>
                  <input id="email" type="email" autocomplete="email" placeholder="voce@email.com">
                  <span class="ck-msg">Digite um e-mail válido — é para lá que vai o comprovante.</span>
                </div>
                <div class="ck-row">
                  <div class="ck-f" id="fphone">
                    <label for="phone">Telefone</label>
                    <input id="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="11 98765-4321">
                    <span class="ck-msg">Confira o DDD e o número, como 11 98765-4321.</span>
                  </div>
                  <div class="ck-f" id="fcpf">
                    <label for="cpf">CPF</label>
                    <input id="cpf" inputmode="numeric" placeholder="000.000.000-00">
                    <span class="ck-msg">Esse CPF não confere. Confira os números digitados.</span>
                  </div>
                </div>
                <div class="ck-f" id="fname">
                  <label for="name">Nome completo</label>
                  <input id="name" autocomplete="name" placeholder="Como está no documento">
                  <span class="ck-msg">Escreva o nome e o sobrenome.</span>
                </div>
              </div>
              ${L.lgpd ? `<div class="ck-lgpd">
                <b>Usamos seus dados de forma 100% segura e protegida para:</b>
                <ul>
                  <li>${iCheck} Enviar o comprovante da compra e do pagamento;</li>
                  <li>${iCheck} Ativar a garantia de devolução em até 7 dias;</li>
                  <li>${iCheck} Acompanhar o andamento do seu pedido.</li>
                </ul>
              </div>` : ''}
            </div>

            <div class="ck-card">
              <h2 class="ck-h"><span class="ck-num">2</span>Entrega</h2>
              <div class="ck-fs">
                <div class="ck-f ck-cep" id="fcep">
                  <label for="cep">CEP</label>
                  <input id="cep" inputmode="numeric" placeholder="00000-000">
                  <span class="ck-st ck-st--load"></span>
                  <span class="ck-st ck-st--ok">${iCheck}</span>
                  <span class="ck-msg">Não encontramos esse CEP. Confira os 8 números.</span>
                </div>
                <a class="ck-link" href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                  target="_blank" rel="noopener">Não sei meu CEP</a>
              </div>

              <div id="addr" style="display:none">
                <div class="ck-fs" style="margin-top:18px">
                  <div class="ck-row">
                    <div class="ck-f" id="fstreet">
                      <label for="street">Endereço</label>
                      <input id="street" placeholder="Rua, avenida…">
                      <span class="ck-msg">Preencha o endereço.</span>
                    </div>
                    <div class="ck-f" id="fnumber">
                      <label for="number">Número</label>
                      <input id="number" inputmode="numeric" placeholder="123">
                      <span class="ck-msg">Preencha o número, ou marque "não tem número".</span>
                    </div>
                  </div>
                  <label class="ck-check"><input type="checkbox" id="noNumber"> Não tem número (S/N)</label>
                  <div class="ck-row">
                    <div class="ck-f">
                      <label for="neighborhood">Bairro</label>
                      <input id="neighborhood" placeholder="Centro">
                    </div>
                    <div class="ck-f">
                      <label for="complement">Complemento</label>
                      <input id="complement" placeholder="Apto, bloco (opcional)">
                    </div>
                  </div>
                  <div class="ck-row">
                    <div class="ck-f" id="fcity">
                      <label for="city">Cidade</label>
                      <input id="city" placeholder="Sua cidade">
                      <span class="ck-msg">Preencha a cidade.</span>
                    </div>
                    <div class="ck-f" id="fstate">
                      <label for="state">UF</label>
                      <input id="state" maxlength="2" placeholder="SP">
                      <span class="ck-msg">Use a sigla do estado, como SP.</span>
                    </div>
                  </div>
                  <div class="ck-f">
                    <label for="recipient">Quem vai receber</label>
                    <input id="recipient" placeholder="Só se for outra pessoa (opcional)">
                  </div>
                </div>

                <div class="ck-sub">Escolha o frete</div>
                <div id="shipopts" class="ck-opts"></div>
                <div class="ck-f" id="fship"><span class="ck-msg">Escolha uma opção de frete.</span></div>
              </div>
            </div>

            <div class="ck-nav">
              <button id="toPay" type="button" class="ck-btn ck-btn--main">Ir para o pagamento</button>
            </div>
          </div>

          <!-- ================= ETAPA 2: pagamento ================= -->
          <!-- Barra de progresso de frete grátis entraria aqui; esta loja não
               tem meta de valor (as opções de frete têm preço fixo no /admin),
               então uma barra sem meta seria enfeite mentindo sobre um prêmio
               que não existe. -->
          <div id="etapa2" style="display:none">
            <div class="ck-card">
              <h2 class="ck-h"><span class="ck-num">3</span>Pagamento</h2>
              ${metodos}
              <div class="ck-metodo">
                <span class="ck-tag">APROVAÇÃO IMEDIATA</span>
                <p class="hl">Pagamento aprovado <b>na hora</b></p>
                <p>Ao confirmar, geramos o QR Code e o código copia-e-cola do PIX. Você paga
                  pelo app do seu banco e a confirmação chega automaticamente — sem enviar
                  comprovante para ninguém.</p>
                <div class="ck-lembre">
                  <b>Lembre-se:</b>
                  <ul>
                    <li>No app do banco, escolha <b>PIX → Pagar → Copia e cola</b> e cole o código.</li>
                    <li>Deixe esta página aberta: assim que o banco liberar, ela avança sozinha.</li>
                  </ul>
                </div>
              </div>
              <div id="bumpBox" class="ck-bump" style="display:none"></div>
            </div>

            <div class="ck-nav">
              <button id="back" type="button" class="ck-btn ck-btn--ghost">${svg('M15 5l-7 7 7 7')} Voltar</button>
              <button id="pay" type="button" class="ck-btn ck-btn--main">Comprar</button>
            </div>
          </div>

          ${(() => {
            // monta primeiro e só embrulha se veio conteúdo: a trava agora é da
            // própria seção, e um `.ck-card` vazio deixaria um retângulo branco
            // no meio do resumo do pedido.
            const deps = depoimentosSection({ mini: true });
            return deps ? `<div class="ck-card ck-deps">${deps}</div>` : '';
          })()}
        </section>

        <aside class="ck-cart">
          ${L.resumo === 'recolhivel' ? '<details class="ck-dobra">' : ''}
          ${L.resumo === 'recolhivel' ? `<summary>
            <span>Resumo do pedido</span>
            <span><span class="vlr" id="sTotalMini">—</span>
              <span class="seta">${svg('M6 9l6 6 6-6')}</span></span>
          </summary>` : ''}
          <div class="ck-card">
            <!-- Sem ícone de carrinho ao lado do título: o painel inteiro já é
                 o carrinho, e o desenho só competia com as fotos dos produtos. -->
            <div class="ck-sum-h">Seu carrinho <span class="ck-cnt" id="cartCount">0</span></div>
            <div id="items"></div>
            <div class="ck-tot">
              <div class="l"><span>Subtotal</span><span id="sSub">—</span></div>
              <div class="l desc" id="sDiscLine" style="display:none"><span id="sDiscLbl">Desconto</span><span id="sDisc">—</span></div>
              <div class="l"><span>Frete</span><span id="sShip">—</span></div>
              <div class="l big"><span>Total</span><span id="sTotal">—</span></div>
            </div>
          </div>
          ${L.resumo === 'recolhivel' ? '</details>' : ''}
          <div class="ck-card ck-safe">
            ${svgShield()}
            <div>
              <b>Ambiente seguro</b>
              <p>Conexão criptografada. Seus dados são usados só para faturar e entregar este pedido.</p>
            </div>
          </div>
        </aside>
      </div>

      <div id="pixScreen" class="ck-card ck-pix" style="display:none">
        <h2>Pague o PIX para concluir</h2>
        <img class="qr" id="qr" alt="QR Code do PIX" width="260" height="260">
        <p style="font-size:13px;color:#6b7280;margin:0">Escaneie o QR ou use o copia-e-cola:</p>
        <div id="copyCode" class="ck-copy" style="margin-top:12px"></div>
        <button id="copyBtn" type="button" class="ck-btn ck-btn--ghost" style="margin-top:12px">Copiar código</button>
        <div class="ck-wait"><span class="ck-dot"></span> Aguardando a confirmação do pagamento…</div>
      </div>

      <div id="okScreen" class="ck-card ck-ok" style="display:none">
        <div class="big">✅</div>
        <h2>Pagamento confirmado!</h2>
        <p style="font-size:13.5px;color:#6b7280">Obrigado pela compra! Seu pedido foi registrado e os detalhes vão para o seu e-mail.</p>
        <!-- Oferta pós-compra: nasce escondida e só aparece se o /status disser
             que este pedido tem oferta viva. Assim a tela de obrigado continua
             inteira se a promoção for desligada. -->
        <div id="okOferta" class="ck-oferta" style="display:none">
          <span class="ck-oferta-selo">Você desbloqueou este preço</span>
          <p class="ck-oferta-tt">Leve mais um par por <b id="okOfertaPreco">R$ 69</b></p>
          <p class="ck-oferta-sub">Qualquer tênis da loja por este preço, e ele <b>entra na mesma
            caixa</b> — sem frete novo e sem preencher nada de novo. Você tem
            <span id="okOfertaMin">30</span> minutos.</p>
          <a class="ck-btn ck-btn--main ck-oferta-btn" id="okOfertaBtn" href="#">Ver os tênis por R$ 69</a>
        </div>
      </div>
    </div>

    <footer class="ck-foot">
      ${bandeiras}
      <span>© ${new Date().getFullYear()} ${escHtml(LOJA.nomeCompleto)}</span>
      <span class="sep">${svgLock()} Ambiente seguro</span>
      ${legaisCk.length ? `<nav class="ck-legal">${legaisCk
        .map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${escHtml(l.texto)}</a>`)
        .join('')}</nav>` : ''}
    </footer>
  </div>
  <script>${CHECKOUT_JS}</script>
  <script>${DEP_JS}</script>`;
  return html(`${LOJA.nome} — Checkout`, body, css);
}

// helpers de ícone (SVG inline)
function svg(d, multi) {
  const paths = String(d).split(' M').map((p, i) => `<path d="${i ? 'M' + p : p}"/>`).join('');
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
function svgCheck() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
}

// ------------------------------------------------------------------- JS do front
const MONEY = `function money(c){return (c/100).toLocaleString('pt-BR',{style:'currency',currency:__CFG.currency})}`;
const CART = `
  function getCart(){try{return JSON.parse(localStorage.getItem('cart')||'{}')}catch(e){return {}}}
  // O getCart já era protegido; este não era. Em aba anônima do Safari e com
  // armazenamento de terceiros bloqueado, o setItem LANÇA — e como ele roda no
  // topo do script do checkout (quando a URL traz ?items=), a exceção matava a
  // página inteira: máscaras, etapas e validação nunca chegavam a existir.
  function setCart(c){try{localStorage.setItem('cart',JSON.stringify(c))}catch(e){}}
  function cartCount(c){return Object.values(c).reduce((s,q)=>s+q,0)}
  // MESMA regra do servidor (src/checkout/promo.js: itemElegivel). Preço tem
  // que bater e, quando promo.handles está configurada, o handle também.
  // Fica aqui, e não em cada tela, porque vitrine, carrinho e checkout
  // precisam responder igual: se divergirem, o cliente vê um selo de promoção
  // que o PIX não cobra.
  function promoElegivel(it){
    var P=(window.__CFG&&__CFG.promo)||{};
    if(it.priceCents!==P.eligiblePriceCents)return false;
    var L=P.handles||[];
    if(!L.length)return true;
    var h=String(it.handle||'').toLowerCase();
    if(!h)return false;
    for(var i=0;i<L.length;i++){if(h.indexOf(L[i])>=0)return true}
    return false;
  }
  // MESMA conta do servidor (promo.js: computeDiscount). Mora aqui porque o
  // carrinho lateral, a página /carrinho e o checkout precisam chegar no mesmo
  // centavo — três cópias da regra divergiriam na primeira correção, e a
  // divergência aparece pro cliente como um total na tela e outro no PIX.
  function promoDesconto(lista){
    var P=(window.__CFG&&__CFG.promo)||{};
    var q=0,c=0;
    for(var i=0;i<lista.length;i++){
      var it=lista[i], n=it.qty||1;
      if(promoElegivel(it)){q+=n;c+=it.priceCents*n}
    }
    if(!P.minQty||q<P.minQty||c<=0)return 0;
    return Math.round(c*P.num/P.den);
  }
`;

// ---------------------------------------------- JS do carrinho lateral (drawer)
// Vai junto com o SHOP_JS, então roda na vitrine, na coleção, na página de
// produto e no /carrinho. Nas páginas que NÃO montam o painel (a oferta
// pós-compra e a recuperação, que têm carrinho próprio) ele sai na primeira
// linha e nada muda.
//
// Regra que sustenta o resto: a ÚNICA coisa que este arquivo escreve é o
// localStorage 'cart', no mesmo formato de sempre ({variante:quantidade}).
// Preço, desconto, estoque e nome do produto vêm do servidor a cada mudança
// (/api/variants e /api/combo) — nada de guardar preço no navegador. É por isso
// que o total do painel não pode divergir do PIX: quem cobra é o POST /orders,
// que recalcula tudo do catálogo, exatamente como antes deste carrinho existir.
const CART_DRAWER_JS = `
(function(){
  var painel=document.getElementById('sacDrawer');
  if(!painel)return;
  var scrim=document.getElementById('sacScrim');
  var corpo=document.getElementById('sacBody');
  var rodape=document.getElementById('sacFoot');
  var conta=document.getElementById('sacCount');
  var sel=document.getElementById('sacSel');
  var selHd=document.getElementById('sacSelHd');
  var selBody=document.getElementById('sacSelBody');
  var selConf=document.getElementById('sacSelConf');
  var P=(window.__CFG&&__CFG.promo)||{};
  var OPC=((window.__CFG&&__CFG.shipping)||{}).options||[];
  var TEM_FRETE_GRATIS=OPC.some(function(o){return o.cents===0});
  // Check que se DESENHA (o stroke-dasharray da folha faz o traço correr).
  var SVG_TICK='<svg class="sac-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor"'+
    ' stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    '<path d="M20 6 9 17l-5-5"/></svg>';
  var SVG_LOCK=${JSON.stringify(svgLock())};
  var SVG_LUPA=${JSON.stringify(svgSearch())};

  var itens=[], carregado=false, aberto=false, req=0;
  var totalMostrado=0, ofertaVista=false, focoAntes=null;
  var idsAntes={}, escalonarProx=false;

  // Os MESMOS milissegundos dos tokens do CSS (--sac-micro/comp/hero).
  var MO={micro:170,comp:380,hero:560};

  function reduzido(){
    return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function pontoFino(){
    return !!(window.matchMedia&&window.matchMedia('(pointer: fine)').matches);
  }
  // TODO setTimeout de animação passa por aqui. Fechar a sacola cancela os
  // pendentes: sem isto um timeout disparava depois de a tela ter mudado e
  // repintava por cima de outro estado — o jeito mais fácil de a animação
  // virar fonte da verdade, que é justamente o que não pode acontecer.
  var timers=[];
  function aguarda(fn,ms){
    if(reduzido()){fn();return 0}
    var t=setTimeout(function(){
      var i=timers.indexOf(t); if(i>=0)timers.splice(i,1);
      fn();
    },ms);
    timers.push(t);
    return t;
  }
  function limparTimers(){timers.forEach(clearTimeout);timers=[]}
  // Reinicia uma animação CSS no MESMO elemento (sem o reflow ela não repete).
  function repetirAnim(el,cls){
    if(!el||reduzido())return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  // Pulo único do ícone da sacola. Nunca fica pulando: a classe sai no fim.
  function pulsarIcone(){
    var b=document.getElementById('openCart');
    if(!b||reduzido())return;
    repetirAnim(b,'pop');
    aguarda(function(){b.classList.remove('pop')},420);
  }
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
  // O "0" ao lado do título não informa nada: com a sacola vazia o corpo já diz
  // isso em letra grande. A bolinha só aparece quando há par dentro.
  function pintarConta(n){conta.textContent=n;conta.hidden=!n}

  // ---- medição do funil ----
  // Reaproveita o que a loja já carrega: o Pixel da Meta (fbq) e, se o dia que
  // entrar um GTM/GA4, o dataLayer e o gtag deles. Nenhum script novo, nenhum
  // pixel duplicado — se não houver nada instalado, o evento simplesmente não vai.
  function ev(nome,dados){
    var d=dados||{};
    try{if(window.fbq)fbq('trackCustom',nome,d)}catch(e){}
    try{if(window.dataLayer&&window.dataLayer.push)window.dataLayer.push(Object.assign({event:nome},d))}catch(e){}
    try{if(typeof window.gtag==='function')window.gtag('event',nome,d)}catch(e){}
  }

  // ---- contas (espelho da promo do servidor: src/checkout/promo.js) ----
  function subtotal(){var s=0;itens.forEach(function(it){s+=it.priceCents*it.qty});return s}
  function desconto(){return promoDesconto(itens)}
  function total(){return Math.max(0,subtotal()-desconto())}
  function economiaDe(){var s=0;itens.forEach(function(it){
    if(it.compareCents&&it.compareCents>it.priceCents)s+=(it.compareCents-it.priceCents)*it.qty});return s}
  function qtdElegivel(){var q=0;itens.forEach(function(it){if(promoElegivel(it))q+=it.qty});return q}
  function faltam(){var q=qtdElegivel();return (q>0&&P.minQty&&q<P.minQty)?(P.minQty-q):0}
  // Handle de um item elegível que JÁ está no carrinho. Só importa quando a
  // promo está restrita a certos produtos (PROMO_HANDLES): sem ele, a conta de
  // quanto o combo vai custar daria zero de desconto e o cartão mentiria.
  function handleRef(){
    for(var i=0;i<itens.length;i++){if(promoElegivel(itens[i]))return itens[i].handle||''}
    return '';
  }
  // Quanto sai o combo fechado com N pares no preço elegível.
  function comboPara(n){
    var unit=P.eligiblePriceCents||0, cheio=unit*n;
    var d=promoDesconto([{priceCents:unit,qty:n,handle:handleRef()}]);
    return {cheio:cheio,total:Math.max(0,cheio-d),economia:d};
  }
  // Quanto o 2º par ACRESCENTA ao que já está na sacola (o "+R$ 50" do resumo).
  // Sai da mesma regra, não de subtração escrita à mão: com 3 ou 4 pares o
  // número muda sozinho.
  function marginal(){
    var futuros=itens.slice();
    futuros.push({priceCents:P.eligiblePriceCents||0,qty:1,handle:handleRef()||(corAtual?corAtual.handle:'')});
    var sub=0;futuros.forEach(function(it){sub+=it.priceCents*it.qty});
    return Math.max(0,(sub-promoDesconto(futuros))-total());
  }

  // ---- abrir / fechar ----
  function travar(v){
    var d=document.documentElement;
    if(v){
      // compensa a barra de rolagem: sem isto a página inteira "pula" 15px
      // para a direita no instante em que o painel abre.
      var barra=window.innerWidth-d.clientWidth;
      d.style.overflow='hidden';
      if(barra>0)document.body.style.paddingRight=barra+'px';
    }else{d.style.overflow='';document.body.style.paddingRight=''}
  }
  function abrir(motivo){
    if(!aberto){
      focoAntes=document.activeElement;
      aberto=true; ofertaVista=false;
      painel.classList.add('on'); scrim.classList.add('on');
      painel.setAttribute('aria-hidden','false');
      var b=document.getElementById('openCart');
      if(b)b.setAttribute('aria-expanded','true');
      travar(true);
      // O conteúdo entra em ordem na ABERTURA (e só nela).
      escalonarProx=!reduzido();
      // Foco no fechar, não no botão da sacola: é o teclado entrando no painel.
      // Com atraso porque o clique que abriu ainda vai devolver o foco pro
      // ícone do topo, e porque o painel só fica visível no fim da transição —
      // focar um elemento invisível não faz nada.
      setTimeout(function(){var x=document.getElementById('sacX');if(x&&aberto)x.focus()},120);
      ev('cart_open',{origem:motivo||'icone',itens:cartCount(getCart())});
    }
    if(motivo==='add')pulsarIcone();
    carregar(false);
  }
  function fechar(){
    if(!aberto)return;
    aberto=false;
    limparTimers();
    fecharSeletor();
    painel.classList.remove('on'); scrim.classList.remove('on');
    painel.setAttribute('aria-hidden','true');
    var b=document.getElementById('openCart');
    if(b)b.setAttribute('aria-expanded','false');
    travar(false);
    if(focoAntes&&focoAntes.focus)focoAntes.focus();
  }
  // O SHOP_JS chama isto no "Adicionar ao carrinho"; onde o painel não existe
  // ele cai no /carrinho de antes.
  window.sacolaAbrir=abrir;

  scrim.addEventListener('click',fechar);
  document.getElementById('sacX').addEventListener('click',fechar);
  var botaoSacola=document.getElementById('openCart');
  if(botaoSacola)botaoSacola.addEventListener('click',function(e){e.preventDefault();abrir('icone')});
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||!aberto)return;
    if(sel.classList.contains('on'))fecharSeletor(); else fechar();
  });
  // Tab não sai do painel enquanto ele está aberto (e não sai do seletor
  // enquanto ele está por cima): é o mínimo para o teclado.
  painel.addEventListener('keydown',function(e){
    if(e.key!=='Tab')return;
    var alvo=sel.classList.contains('on')?sel:painel;
    var todos=alvo.querySelectorAll('button,[href],input,select,textarea,[tabindex]');
    var vis=[];
    for(var i=0;i<todos.length;i++){
      var el=todos[i];
      if(el.disabled||el.offsetParent===null)continue;
      if(alvo===painel&&sel.contains(el))continue;
      vis.push(el);
    }
    if(!vis.length)return;
    var pri=vis[0], ult=vis[vis.length-1];
    if(e.shiftKey&&document.activeElement===pri){e.preventDefault();ult.focus()}
    else if(!e.shiftKey&&document.activeElement===ult){e.preventDefault();pri.focus()}
  });

  // ---- carregar itens (preço e nome sempre do servidor) ----
  function carregar(anima){
    var ids=Object.keys(getCart());
    pintarConta(cartCount(getCart()));
    if(!ids.length){itens=[];carregado=true;pintar(false);return}
    if(!carregado){corpo.innerHTML='<div class="sac-skel"></div><div class="sac-skel"></div>';rodape.hidden=true}
    var meu=++req;
    fetch('/api/variants?det=1&ids='+ids.map(encodeURIComponent).join(','))
      .then(function(r){return r.json()})
      .then(function(d){
        if(meu!==req)return;
        var c=getCart(), vivos={};
        itens=(d.variants||[]).filter(function(v){return c[v.id]!=null}).map(function(v){
          vivos[v.id]=c[v.id]||1;
          return {variantId:v.id,qty:c[v.id]||1,priceCents:v.priceCents,
            compareCents:v.compareCents||0,title:v.title||'',option:v.option||'',
            modelo:v.modelo||'',cor:v.cor||'',image:v.image||'',handle:v.handle||''};
        });
        // Variante que saiu do catálogo não pode ficar presa no localStorage:
        // ela desaparece da tela mas continuaria contando no ícone e no checkout.
        setCart(vivos); refreshCart(); pintarConta(cartCount(vivos));
        carregado=true; pintar(anima);
      })
      .catch(function(){
        if(meu!==req||carregado)return;
        corpo.innerHTML='<div class="sac-vazio"><p>Não foi possível carregar a sacola. '+
          'Confira a conexão e tente de novo.</p>'+
          '<a class="sac-go" href="/carrinho">VER MEU CARRINHO</a></div>';
        rodape.hidden=true;
      });
  }
  // Quem mexer no carrinho FORA do painel (a página /carrinho) avisa por aqui.
  // O filtro do próprio remetente não é detalhe: sem ele o painel ouvia o
  // aviso que ELE mesmo acabou de emitir, buscava /api/variants de novo e
  // repintava no meio da animação — a linha que estava saindo sumia de uma
  // vez, o par novo não chegava a receber a entrada dele, e cada clique de
  // quantidade virava uma ida à rede sem nenhuma informação nova.
  document.addEventListener('sacola:mudou',function(e){
    if(e&&e.detail&&e.detail.de==='drawer')return;
    if(aberto)carregar(false);
  });
  // Voltar do checkout pelo botão do navegador devolve a página do cache com
  // o CTA congelado em "PREPARANDO SEU PEDIDO…". Repinta o rodapé.
  window.addEventListener('pageshow',function(e){
    if(e.persisted&&carregado&&itens.length)pintarRodape(false);
  });
  function avisar(){
    try{document.dispatchEvent(new CustomEvent('sacola:mudou',{detail:{de:'drawer'}}))}catch(e){}
  }

  // ---- desenho da sacola ----
  function nomeDe(it){
    if(it.modelo)return it.modelo;
    return String(it.title||'').split(' — ')[0];
  }
  function metaDe(it){
    var p=[];
    if(it.cor)p.push(it.cor);
    if(it.option)p.push('Tam. '+it.option);
    return p.join(' · ');
  }
  function linhaHtml(it,i){
    var de=(it.compareCents&&it.compareCents>it.priceCents)?'<s>'+money(it.compareCents)+'</s>':'';
    var meta=metaDe(it);
    var podeTrocar=promoElegivel(it)&&qtdElegivel()>=P.minQty;
    // "nova" = não estava na pintura ANTERIOR. Só vale quando existiu uma
    // pintura anterior: na primeira, quem anima é a entrada escalonada, e as
    // duas animações no mesmo elemento brigariam (a última da folha ganha e a
    // cascata se perderia). Assim cada momento tem uma animação só.
    var houveAntes=false;
    for(var k in idsAntes){if(idsAntes[k]){houveAntes=true;break}}
    var nova=(!reduzido()&&houveAntes&&!idsAntes[it.variantId])?' nova':'';
    return '<div class="sac-line'+nova+'" data-vid="'+esc(it.variantId)+'">'+
      '<img loading="lazy" decoding="async" src="'+esc(it.image)+'" alt="'+esc(nomeDe(it))+'">'+
      '<div>'+
        '<span class="nm">'+esc(nomeDe(it))+'</span>'+
        (meta?'<p class="meta">'+esc(meta)+'</p>':'')+
        '<div class="pr">'+money(it.priceCents)+de+'</div>'+
        '<div class="acoes">'+
          '<span class="sac-step">'+
            '<button type="button" data-d="-1" data-i="'+i+'" aria-label="Diminuir"'+(it.qty<=1?' disabled':'')+'>−</button>'+
            '<span>'+it.qty+'</span>'+
            '<button type="button" data-d="1" data-i="'+i+'" aria-label="Aumentar"'+(it.qty>=20?' disabled':'')+'>+</button>'+
          '</span>'+
          (podeTrocar?'<button type="button" class="sac-mini tro" data-troca="'+esc(it.variantId)+'">Trocar</button>':'')+
          '<button type="button" class="sac-mini" data-rm="'+i+'">Remover</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }
  function ofertaHtml(f){
    var alvo=qtdElegivel()+f, c=comboPara(alvo);
    return '<div class="sac-of" id="sacOf">'+
      '<div class="sac-of-tp">COMPLETE SEU COMBO 🔥</div>'+
      '<div class="sac-of-in">'+
        '<h3>Leve mais '+f+(f>1?' pares':' par')+' e complete <b>'+alvo+' por '+money(c.total)+'</b></h3>'+
        '<p>Você já escolheu seu primeiro par. Agora escolha o segundo e complete a promoção'+
          (TEM_FRETE_GRATIS?' — com frete grátis':'')+'.</p>'+
        (c.economia>0?'<div class="sac-of-eco"><s>'+money(c.cheio)+'</s> '+money(c.total)+
          ' · você economiza '+money(c.economia)+'</div>':'')+
        '<button type="button" class="sac-go" id="sacEscolher">ESCOLHER MEU 2º PAR'+
          '<i class="sac-ar" aria-hidden="true">→</i></button>'+
      '</div></div>';
  }
  // A promo NÃO para no 2º par: a regra é proporcional (4900/19800 sobre o total
  // elegível), então o 3º, o 4º e o 5º entram com o mesmo desconto — cada par a
  // mais sai por ~R$ 74,50 em vez de R$ 99. Antes o painel calava depois do
  // combo fechado e o cliente não tinha como saber disso. O número sai de
  // marginal(), que é a diferença real entre o total de agora e o total com
  // mais um par: muda sozinho se PROMO_* mudar.
  function maisUmHtml(){
    var unit=P.eligiblePriceCents||0, extra=marginal();
    var poupa=unit-extra;
    if(!unit||extra<=0||poupa<=0)return '';
    return '<div class="sac-of" id="sacMaisUm">'+
      '<div class="sac-of-tp">QUANTO MAIS PARES, MAIS BARATO 🔥</div>'+
      '<div class="sac-of-in">'+
        '<h3>Leve mais 1 par por <b>'+money(extra)+'</b></h3>'+
        '<p>O desconto vale para todos os pares: o próximo sai por '+money(extra)+
          ' em vez de '+money(unit)+'.</p>'+
        '<div class="sac-of-eco"><s>'+money(unit)+'</s> '+money(extra)+
          ' · você economiza '+money(poupa)+' neste par</div>'+
        '<button type="button" class="sac-go" id="sacEscolher">ADICIONAR MAIS UM PAR'+
          '<i class="sac-ar" aria-hidden="true">→</i></button>'+
      '</div></div>';
  }
  function comboOkHtml(piscar){
    var q=qtdElegivel(), desc=desconto(), sub=subtotal();
    var pares=itens.filter(function(it){return promoElegivel(it)});
    var lista=pares.map(function(it,i){
      return '<p><b>'+(i+1)+'. '+esc(nomeDe(it))+'</b>'+(metaDe(it)?' — '+esc(metaDe(it)):'')+'</p>';
    }).join('');
    // "SEU DROP": os pares vistos como CONJUNTO, levemente tortos, com sombra.
    // Três fotos no máximo — a quarta começaria a competir com o CTA.
    var fotos=pares.slice(0,3).map(function(it,i){
      return '<img loading="lazy" decoding="async" src="'+esc(it.image)+'" alt="'+esc(nomeDe(it))+
        '" style="--r:'+(i%2?'3deg':'-3deg')+';--d:'+i+'">';
    }).join('<span class="sac-drop-sinal">+</span>');
    var drop=pares.length>1
      ? '<div class="sac-drop"><span class="sac-drop-tt">SEU DROP</span>'+
        '<div class="sac-drop-fotos">'+fotos+
        (pares.length>3?'<span class="sac-drop-sinal">+'+(pares.length-3)+'</span>':'')+
        '</div></div>'
      : '';
    return '<div class="sac-ok'+(piscar?' pisca':'')+'" id="sacOk">'+
      '<div class="sac-ok-tt">'+SVG_TICK+'COMBO ATIVADO · '+q+' pares por '+money(Math.max(0,sub-desc))+
        (TEM_FRETE_GRATIS?' · FRETE GRÁTIS':'')+'</div>'+
      drop+lista+
      (desc>0?'<p><s>'+money(sub)+'</s> → <b>'+money(sub-desc)+'</b> · você economizou '+
        money(desc+economiaDe())+'</p>':'')+
    '</div>';
  }
  function pintar(anima){
    pintarConta(cartCount(getCart()));
    if(!itens.length){
      corpo.innerHTML='<div class="sac-vazio"><p>Sua sacola está vazia.</p>'+
        '<a class="sac-go" href="/">CONTINUAR COMPRANDO</a></div>';
      rodape.hidden=true; totalMostrado=0; idsAntes={}; escalonarProx=false; return;
    }
    var f=faltam(), html='';
    itens.forEach(function(it,i){html+=linhaHtml(it,i)});
    if(f>0)html+=ofertaHtml(f);
    else if(P.minQty&&qtdElegivel()>=P.minQty)html+=comboOkHtml(!!anima)+maisUmHtml();
    corpo.innerHTML=html;
    rodape.hidden=false;
    pintarRodape(anima);
    // Guarda quem está na tela para a próxima pintura saber o que é novo.
    idsAntes={};
    itens.forEach(function(it){idsAntes[it.variantId]=1});
    if(escalonarProx){escalonarProx=false;escalonar()}
    var bt=document.getElementById('sacEscolher');
    if(bt){
      bt.addEventListener('click',function(){abrirSeletor(null)});
      if(!ofertaVista){
        ofertaVista=true;
        ev('combo_offer_view',{faltam:f,combo_fechado:f===0,
          valor:(f>0?comboPara(qtdElegivel()+f).total:marginal())/100});
      }
    }
  }
  // Entrada em cascata dos blocos, só na abertura. Teto de 8 porque a partir
  // daí o atraso acumulado passaria de 320ms e o último bloco (o CTA) chegaria
  // atrasado — justamente o que não pode demorar.
  function escalonar(){
    var blocos=[].slice.call(corpo.children).concat([].slice.call(rodape.children));
    blocos.forEach(function(el,i){
      if(i>7)return;
      el.style.setProperty('--i',i);
      el.classList.add('sac-entra');
    });
  }
  function pintarRodape(anima){
    var sub=subtotal(), desc=desconto(), tot=total();
    rodape.innerHTML=
      '<div class="sac-row"><span>Subtotal</span><span>'+money(sub)+'</span></div>'+
      (desc>0?'<div class="sac-row"><span class="desc">'+esc(P.label||'Desconto')+'</span>'+
        '<span class="desc">- '+money(desc)+'</span></div>':'')+
      '<div class="sac-row"><span>Frete</span><span>'+
        (TEM_FRETE_GRATIS?'grátis':'escolhido no checkout')+'</span></div>'+
      '<div class="sac-row tot"><span>Total</span><b id="sacTotal">'+money(tot)+'</b></div>'+
      '<a class="sac-go" href="/checkout" id="sacGo">FINALIZAR COMPRA — <span id="sacGoV">'+money(tot)+'</span>'+
        '<i class="sac-ar" aria-hidden="true">→</i></a>'+
      (TEM_FRETE_GRATIS?'<p class="sac-frete">'+SVG_TRUCK+'Frete grátis para todo o Brasil</p>':'')+
      '<p class="sac-seg">'+SVG_LOCK+'Pagamento via PIX · ambiente seguro</p>';
    document.getElementById('sacGo').addEventListener('click',function(){
      ev('checkout_click',{valor:total()/100,itens:cartCount(getCart()),combo:qtdElegivel()>=P.minQty});
      // Só o rótulo muda. A navegação é a do próprio link e NÃO espera
      // animação nenhuma — o que se vê aqui é o tempo que o checkout leva
      // para responder, preenchido com um aviso em vez de um botão morto.
      this.classList.add('indo');
      this.innerHTML='<span class="sac-spin"></span>PREPARANDO SEU PEDIDO…';
    });
    if(anima&&totalMostrado&&totalMostrado!==tot)animarTotal(totalMostrado,tot);
    totalMostrado=tot;
  }
  // Contador entre o preço antigo e o novo: 420ms, uma vez. É o que comunica
  // "o combo entrou" sem precisar de texto.
  function animarTotal(de,para){
    var el=document.getElementById('sacTotal'), el2=document.getElementById('sacGoV');
    if(!el)return;
    if(reduzido()){el.textContent=money(para);return}
    el.classList.add('up');
    var t0=0, dur=420;
    function passo(t){
      if(!t0)t0=t;
      var k=Math.min(1,(t-t0)/dur);
      var v=Math.round(de+(para-de)*(1-Math.pow(1-k,3)));
      el.textContent=money(v); if(el2)el2.textContent=money(v);
      if(k<1)requestAnimationFrame(passo);
      else{el.textContent=money(para);if(el2)el2.textContent=money(para);
        setTimeout(function(){el.classList.remove('up')},200)}
    }
    requestAnimationFrame(passo);
  }

  // quantidade, remover e trocar
  corpo.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');
    if(!b||b.disabled)return;
    var c=getCart(), linha=b.closest&&b.closest('.sac-line');
    // ---- trocar ----
    if(b.dataset.troca!=null){
      var alvo=b.dataset.troca;
      // O par que vai ser trocado sai de cena; o primeiro fica parado.
      if(linha)linha.classList.add('trocando');
      aguarda(function(){abrirSeletor(alvo)},160);
      return;
    }
    // ---- remover ----
    if(b.dataset.rm!=null){
      var it=itens[+b.dataset.rm]; if(!it)return;
      delete c[it.variantId];
      ev('combo_remove',{variante:it.variantId,modelo:it.modelo||'',combo_antes:qtdElegivel()>=P.minQty});
      itens.splice(+b.dataset.rm,1);
      // ESTADO PRIMEIRO: o par já saiu do carrinho e das contas. O que vem
      // abaixo é só o espaço se fechando — se a animação não rodar, o
      // repintar acontece do mesmo jeito (o aguarda() cai direto no fn
      // quando o usuário pediu menos movimento).
      setCart(c); refreshCart(); avisar();
      if(linha&&!reduzido()){
        linha.style.height=linha.offsetHeight+'px';
        void linha.offsetWidth;
        linha.classList.add('saindo');
        linha.style.height='0px';
        aguarda(function(){pintar(true)},280);
      }else pintar(true);
      return;
    }
    // ---- quantidade ----
    if(b.dataset.d!=null&&b.dataset.i!=null){
      var i2=itens[+b.dataset.i]; if(!i2)return;
      i2.qty=Math.max(1,Math.min(20,i2.qty+(+b.dataset.d)));
      c[i2.variantId]=i2.qty;
    }else return;
    setCart(c); refreshCart(); avisar();
    // Repinta com a conta refeita: tirar um par derruba o desconto, devolve a
    // oferta do 2º par e atualiza o total — tudo derivado, nada guardado.
    pintar(true);
  });

  // =================== ESCOLHA DO 2º PAR (modelo > cor > tamanho) ===================
  var cat=null, busca='', marca='', passo=1, carregandoCat=false;
  var modeloAtual=null, corAtual=null, tamAtual=null, trocaId=null, offsetCores=0;
  var ctaPronto=false, modeloChegou=false, cacheCores={}, trocaCor=0, reqModelo=0;

  function abrirSeletor(idTroca){
    trocaId=idTroca||null;
    passo=1; modeloAtual=null; corAtual=null; tamAtual=null; busca=''; marca='';
    ctaPronto=false; modeloChegou=false;
    sel.classList.add('on'); painel.classList.add('larga','escolhendo');
    selConf.hidden=true;
    ev('combo_selector_open',{troca:!!trocaId});
    pintarSeletor();
    if(!cat)carregarCatalogo();
  }
  function fecharSeletor(){
    sel.classList.remove('on'); painel.classList.remove('larga','escolhendo');
    // Linha que tinha saído para a troca volta ao lugar se a pessoa desistiu.
    corpo.querySelectorAll('.sac-line.trocando').forEach(function(l){l.classList.remove('trocando')});
  }
  // Troca de etapa: a atual recua e some, a nova entra do outro lado. O
  // A trava trocandoPasso barra clique repetido: — sem ela, dois toques rápidos
  // em modelos diferentes disparavam duas pinturas e a segunda chegava em cima
  // da primeira (a foto piscava e o passo ficava trocado).
  var trocandoPasso=false;
  function irPasso(n,antes){
    if(trocandoPasso)return;
    if(reduzido()){if(antes)antes();passo=n;pintarSeletor();return}
    trocandoPasso=true;
    selBody.classList.add('sai');
    aguarda(function(){
      selBody.classList.remove('sai');
      if(antes)antes();
      passo=n; pintarSeletor();
      trocandoPasso=false;
    },140);
  }
  function passosHtml(){
    return '<div class="sac-passos">'+
      '<span class="'+(passo>1?'fez':'')+'">'+(passo===1?'<b>1. Modelo</b>':'1. Modelo')+'</span><span>›</span>'+
      '<span class="'+(passo>2?'fez':'')+'">'+(passo===2?'<b>2. Cor</b>':'2. Cor')+'</span><span>›</span>'+
      '<span>'+(passo===3?'<b>3. Tamanho</b>':'3. Tamanho')+'</span></div>';
  }
  // Palco do produto: a foto, a sombra no chão e o wrapper que inclina.
  // A classe chega entra só na primeira pintura de um modelo novo — trocar de cor tem a
  // animação dela, e as duas juntas dariam giro em cima de giro.
  function pvHtml(c,chega){
    return '<div class="sac-pv" id="sacPvBox"><div class="sac-pv-palco">'+
      '<img id="sacPv"'+(chega?' class="chega"':'')+' decoding="async" src="'+esc(c?c.image:'')+
        '" alt="'+esc(c?c.title:'')+'">'+
      '<span class="sac-pv-sombra" aria-hidden="true"></span>'+
    '</div></div>';
  }
  // Profundidade no desktop: 3,5 graus em X e 5,5 em Y, no máximo. Só com
  // mouse de verdade (pointer: fine) — em tela de toque não existe "passar o
  // mouse", e o listener seria peso morto. Um rAF por quadro, nunca um loop:
  // fora do movimento do mouse nada roda.
  function ligarTilt(){
    var box=document.getElementById('sacPvBox');
    if(!box||reduzido()||!pontoFino())return;
    var palco=box.querySelector('.sac-pv-palco'), pedido=0;
    box.addEventListener('pointermove',function(e){
      if(pedido||!palco)return;
      pedido=requestAnimationFrame(function(){
        pedido=0;
        var r=box.getBoundingClientRect();
        if(!r.width)return;
        var x=(e.clientX-r.left)/r.width-0.5, y=(e.clientY-r.top)/r.height-0.5;
        palco.style.transform='rotateX('+(-y*7).toFixed(2)+'deg) rotateY('+(x*11).toFixed(2)+'deg)';
      });
    });
    box.addEventListener('pointerleave',function(){
      if(pedido){cancelAnimationFrame(pedido);pedido=0}
      if(!palco)return;
      palco.classList.add('volta');
      palco.style.transform='';
      aguarda(function(){palco.classList.remove('volta')},MO.comp);
    });
  }
  function cabecaHtml(titulo,sub,voltarPara){
    selHd.innerHTML=(voltarPara?'<button type="button" class="sac-back" id="sacBack" aria-label="Voltar">‹</button>'
      :'<button type="button" class="sac-back" id="sacBack" aria-label="Voltar para a sacola">‹</button>')+
      '<div class="tt"><b></b><i></i></div>';
    selHd.querySelector('b').textContent=titulo;
    selHd.querySelector('i').textContent=sub||'';
    document.getElementById('sacBack').addEventListener('click',function(){
      if(voltarPara)irPasso(voltarPara); else fecharSeletor();
    });
  }
  function carregarCatalogo(){
    if(carregandoCat)return;
    carregandoCat=true;
    selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Carregando os modelos…</p>';
    fetch('/api/combo').then(function(r){return r.json()}).then(function(d){
      carregandoCat=false;
      if(!d||!d.modelos){selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Não foi possível carregar os modelos agora.</p>';return}
      cat=d; pintarSeletor();
    }).catch(function(){
      carregandoCat=false;
      selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Não foi possível carregar os modelos. Confira a conexão.</p>';
    });
  }
  function modelosFiltrados(){
    var q=norm(busca);
    return (cat.modelos||[]).filter(function(m){
      if(marca&&norm(m.marca)!==marca)return false;
      if(!q)return true;
      return norm(m.title).indexOf(q)>=0||norm(m.marca).indexOf(q)>=0;
    });
  }
  function pintarGrade(){
    var g=document.getElementById('sacGrid');
    if(!g)return;
    var lista=modelosFiltrados();
    if(!lista.length){g.innerHTML='<p class="sac-aviso">Nenhum modelo com esse nome. Tente pela marca.</p>';return}
    g.innerHTML=lista.map(function(m){
      return '<button type="button" class="sac-card" data-key="'+esc(m.key)+'">'+
        '<img loading="lazy" src="'+esc(m.image)+'" alt="'+esc(m.title)+'">'+
        (m.marca?'<span class="mk">'+esc(m.marca)+'</span>':'')+
        '<span class="nm">'+esc(m.title)+'</span>'+
        '<span class="qt">'+m.cores+(m.cores>1?' cores':' cor')+'</span>'+
      '</button>';
    }).join('');
  }
  function pintarSeletor(){
    if(passo===1){
      // Depois do combo fechado não existe "segundo par": o que a pessoa está
      // fazendo é acrescentar mais um pelo preço de dentro da promo.
      var fal=faltam();
      cabecaHtml(
        trocaId?'Troque o seu par':(fal>0?'Escolha seu segundo tênis':'Escolha mais um par'),
        (fal>0
          ? (P.minQty?'complete '+P.minQty+' por '+money(comboPara(P.minQty).total):'')
          : 'cada par a mais por '+money(marginal())),0);
      if(!cat){if(!carregandoCat)carregarCatalogo();return}
      var chips='<button type="button" class="sac-chip'+(marca?'':' on')+'" data-marca="">Todos</button>'+
        (cat.marcas||[]).map(function(b){
          return '<button type="button" class="sac-chip'+(marca===norm(b.title)?' on':'')+
            '" data-marca="'+esc(norm(b.title))+'">'+esc(b.title)+'</button>';
        }).join('');
      selBody.innerHTML=passosHtml()+
        '<div class="sac-busca">'+SVG_LUPA+'<input id="sacQ" type="search" placeholder="Buscar modelo" '+
          'autocomplete="off" aria-label="Buscar modelo" value="'+esc(busca)+'"></div>'+
        '<div class="sac-chips" id="sacChips">'+chips+'</div>'+
        '<div class="sac-grid" id="sacGrid"></div>';
      pintarGrade();
      var t=null;
      document.getElementById('sacQ').addEventListener('input',function(e){
        var v=e.target.value;
        clearTimeout(t); t=setTimeout(function(){busca=v;pintarGrade()},200);
      });
      document.getElementById('sacChips').addEventListener('click',function(e){
        var c=e.target.closest&&e.target.closest('.sac-chip'); if(!c)return;
        marca=c.dataset.marca||'';
        this.querySelectorAll('.sac-chip').forEach(function(x){x.classList.toggle('on',x===c)});
        pintarGrade();
      });
      var grade=document.getElementById('sacGrid');
      grade.addEventListener('click',function(e){
        var c=e.target.closest&&e.target.closest('.sac-card'); if(!c)return;
        escolherModelo(c.dataset.key);
      });
      // Preload do PRÓXIMO conteúdo necessário, e só dele: passar o mouse num
      // card é sinal suficiente para buscar as cores daquele modelo antes do
      // clique. Uma vez por modelo, só com mouse, e o resultado fica no cache
      // que carregarCores lê — no clique a etapa 2 abre sem espera.
      if(pontoFino())grade.addEventListener('pointerenter',function(e){
        var c=e.target.closest&&e.target.closest('.sac-card');
        if(c)prefetchCores(c.dataset.key);
      },true);
      selConf.hidden=true;
      return;
    }
    if(passo===2){
      cabecaHtml('Escolha a cor',modeloAtual?modeloAtual.title:'',1);
      selConf.hidden=true;
      // A barra de baixo é montada no fim deste bloco (pintarBarraCor): aqui
      // ela some porque o corpo pode acabar num aviso, sem cor nenhuma.
      if(!modeloAtual){selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Carregando as cores…</p>';return}
      if(!modeloAtual.cores.length){
        selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Este modelo está sem cor disponível '+
          'no momento. Volte e escolha outro.</p>';
        return;
      }
      var atual=corAtual||modeloAtual.cores[0];
      selBody.innerHTML=passosHtml()+
        pvHtml(atual,modeloChegou)+
        '<p class="sac-cor-nm" id="sacCorNm">'+esc(atual.cor)+'</p>'+
        '<p class="sac-dica">Toque nas cores para ver a foto grande. O tamanho vem depois.</p>'+
        '<div class="sac-cores" id="sacCores">'+modeloAtual.cores.map(function(c,i){
          return '<button type="button" class="sac-cor'+(c.handle===atual.handle?' on':'')+'" data-i="'+i+'">'+
            '<img loading="lazy" src="'+esc(c.thumb)+'" alt="'+esc(c.cor)+'"><i>'+esc(c.cor)+'</i></button>';
        }).join('')+'</div>'+
        (modeloAtual.cores.length<modeloAtual.total
          ?'<button type="button" class="sac-mais" id="sacMaisCores">Ver mais cores ('+
            (modeloAtual.total-modeloAtual.cores.length)+')</button>':'');
      document.getElementById('sacCores').addEventListener('click',function(e){
        var b=e.target.closest&&e.target.closest('.sac-cor'); if(!b)return;
        escolherCor(modeloAtual.cores[+b.dataset.i],b);
      });
      var mais=document.getElementById('sacMaisCores');
      if(mais)mais.addEventListener('click',function(){carregarCores(true)});
      corAtual=atual;
      modeloChegou=false;
      ligarTilt();
      pintarBarraCor();
      return;
    }
    // passo 3 — numeração
    cabecaHtml('Escolha seu tamanho',
      (modeloAtual?modeloAtual.title:'')+(corAtual?' · '+corAtual.cor:''),2);
    var vs=(corAtual&&corAtual.variants)||[];
    selBody.innerHTML=passosHtml()+
      pvHtml(corAtual,false)+
      '<p class="sac-cor-nm">'+esc(corAtual?corAtual.cor:'')+'</p>'+
      (vs.length
        ? '<p class="sac-lbl">Numeração <span>· toque para escolher</span></p><div class="sac-sizes" id="sacSizes">'+
          vs.map(function(v,i){
            var off=!v.available||v.elegivel===false;
            return '<button type="button" class="sac-sz'+(tamAtual&&tamAtual.id===v.id?' on':'')+'" data-i="'+i+'"'+
              (off?' disabled aria-label="'+esc((v.option||'')+' indisponível')+'"':'')+'>'+
              esc(v.option||'Único')+'</button>';
          }).join('')+'</div>'
        : '<p class="sac-aviso">Este modelo está sem numeração cadastrada. Escolha outra cor.</p>');
    var box=document.getElementById('sacSizes');
    if(box)box.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('.sac-sz');
      // Numeração esgotada não reage: nem estado, nem animação, nem evento.
      if(!b||b.disabled)return;
      tamAtual=vs[+b.dataset.i];
      box.querySelectorAll('.sac-sz').forEach(function(x){
        x.classList.toggle('on',x===b);
        if(x!==b)x.classList.remove('toque');
      });
      repetirAnim(b,'toque');
      ev('combo_size_select',{modelo:modeloAtual.title,cor:corAtual.cor,tamanho:tamAtual.option});
      pintarConfirmacao();
    });
    ligarTilt();
    pintarConfirmacao();
  }
  // Barra da etapa da COR. Existe porque tocar numa colorway passou a significar
  // "quero ver esta foto grande", e não "escolhi esta": quem estava só olhando
  // as cores caía na tela de numeração e tinha que voltar a cada miniatura.
  // Agora a foto troca na hora e quem avança é este botão.
  function pintarBarraCor(){
    selConf.hidden=false;
    selConf.innerHTML=
      '<div class="sac-conf-in">'+
        '<img src="'+esc(corAtual?corAtual.thumb:'')+'" alt="">'+
        '<div><b>'+esc(modeloAtual?modeloAtual.title:'')+'</b>'+
          '<i>'+esc(corAtual?corAtual.cor:'')+'</i></div>'+
      '</div>'+
      '<button type="button" class="sac-add" id="sacIrTam"'+(corAtual?'':' disabled')+'>'+
        'ESCOLHER O TAMANHO<i class="sac-ar" aria-hidden="true">→</i></button>';
    var b=document.getElementById('sacIrTam');
    if(b&&corAtual)b.addEventListener('click',function(){irPasso(3)});
  }
  // Resumo + botão. O botão SÓ liga com modelo, cor, variante e estoque — é a
  // última tranca antes de escrever no carrinho.
  function pintarConfirmacao(){
    var pronto=!!(modeloAtual&&corAtual&&tamAtual&&tamAtual.available&&tamAtual.elegivel!==false);
    selConf.hidden=false;
    // Troca não acrescenta nada ao total (sai um par, entra outro no mesmo
    // preço), então ali o "+R$ 50" seria mentira: mostra só o preço do par.
    var preco=pronto
      ? (trocaId
        ? '<s>'+money(tamAtual.compareCents&&tamAtual.compareCents>tamAtual.priceCents?tamAtual.compareCents:tamAtual.priceCents)+
          '</s> · sem mudança no total'
        : '<s>'+money(tamAtual.priceCents)+'</s> · no combo: <b>+'+money(marginal())+'</b>')
      : '';
    selConf.innerHTML=
      '<div class="sac-conf-in">'+
        '<img src="'+esc(corAtual?corAtual.thumb:'')+'" alt="">'+
        '<div><b>'+esc(modeloAtual?modeloAtual.title:'')+'</b>'+
          '<i>'+esc((corAtual?corAtual.cor:'')+(tamAtual?' · Tamanho '+tamAtual.option:''))+'</i>'+
          (pronto?'<div class="sac-conf-pr">'+preco+'</div>':'')+
        '</div>'+
      '</div>'+
      '<button type="button" class="sac-add" id="sacAdd"'+(pronto?'':' disabled')+'>'+
        (pronto?(trocaId?'TROCAR MEU 2º PAR':'ADICIONAR AO MEU COMBO')
          :(tamAtual?'Numeração indisponível':'Escolha o tamanho'))+
        '<i class="sac-ar" aria-hidden="true">→</i></button>';
    var add=document.getElementById('sacAdd');
    // O pulso acontece no instante em que o botão LIGA (desligado -> ligado),
    // e não a cada repintura: trocar de numeração com o botão já ativo não
    // pode fazer o CTA piscar de novo.
    if(pronto&&!ctaPronto)repetirAnim(add,'ligou');
    ctaPronto=pronto;
    if(pronto)add.addEventListener('click',adicionar);
  }
  function escolherModelo(key){
    var m=(cat.modelos||[]).filter(function(x){return x.key===key})[0];
    if(!m||trocandoPasso)return;
    ev('combo_model_select',{modelo:m.title,marca:m.marca,cores:m.cores});
    // modeloChegou avisa a etapa 2 de que a foto deve ENTRAR girando: é a
    // "troca de produto" pedida, e ela só vale quando o modelo mudou.
    // A carga vai DENTRO do reset, e não ao lado dele. Em paralelo havia
    // corrida: com a resposta em cache, as cores chegavam antes de o reset
    // rodar, e o reset (modeloAtual=null) apagava a etapa já montada — a tela
    // ficava em "Carregando as cores…" para sempre. Trocar de modelo rápido
    // quatro vezes reproduzia isso todas as vezes.
    irPasso(2,function(){
      modeloAtual=null; corAtual=null; tamAtual=null; offsetCores=0; modeloChegou=true;
      carregarCores(false,key,m.title);
    });
  }
  // Busca as cores de um modelo sem pintar nada. Guardada por chave, uma vez.
  function prefetchCores(k){
    if(!k||cacheCores[k])return;
    cacheCores[k]=fetch('/api/combo/modelo/'+encodeURIComponent(k)+'?limit=18&offset=0')
      .then(function(r){return r.json()})
      .catch(function(){cacheCores[k]=null;return null});
  }
  function carregarCores(mais,key,titulo){
    var k=key||(modeloAtual&&modeloAtual.key);
    if(!k)return;
    // Resposta de um modelo que já não é o escolhido é DESCARTADA. Sem isto,
    // a requisição lenta do primeiro clique chegava depois e pintava as cores
    // do modelo errado por cima do que a pessoa acabou de escolher.
    var meu=++reqModelo;
    var off=mais?offsetCores:0;
    var b=document.getElementById('sacMaisCores');
    if(b){b.disabled=true;b.textContent='Carregando…'}
    // Página 0 pode já estar no cache do hover; o resto sempre vai à rede.
    var p=(!mais&&off===0&&cacheCores[k])
      ? cacheCores[k]
      : fetch('/api/combo/modelo/'+encodeURIComponent(k)+'?limit=18&offset='+off)
          .then(function(r){return r.json()});
    p.then(function(d){
        if(meu!==reqModelo)return;
        if(!d||!d.cores){throw new Error('sem cores')}
        if(mais&&modeloAtual)modeloAtual.cores=modeloAtual.cores.concat(d.cores);
        // Cópia do objeto do cache: sem isto, "ver mais cores" emendaria a
        // página 2 DENTRO do cache e a próxima visita ao modelo abriria com a
        // lista crescendo sozinha a cada volta.
        else modeloAtual=Object.assign({},d,{cores:d.cores.slice()});
        offsetCores=modeloAtual.cores.length;
        if(!corAtual&&modeloAtual.cores.length)corAtual=modeloAtual.cores[0];
        if(passo===2)pintarSeletor();
      })
      .catch(function(){
        if(meu!==reqModelo)return;
        selBody.innerHTML=passosHtml()+'<p class="sac-aviso">Não foi possível carregar as cores de '+
          esc(titulo||'')+'. Tente de novo.</p>';
      });
  }
  // Troca de colorway: a foto gira de leve para fora, a nova entra do outro
  // lado. 340ms no total, uma vez só — e a foto nova é PRÉ-CARREGADA antes de
  // animar, senão a animação terminaria num quadrado vazio.
  function escolherCor(c,botao){
    if(!c)return;
    corAtual=c; tamAtual=null;
    if(botao){
      var pai=botao.parentNode;
      pai.querySelectorAll('.sac-cor').forEach(function(x){x.classList.toggle('on',x===botao)});
    }
    var nm=document.getElementById('sacCorNm');
    if(nm)nm.textContent=c.cor;
    ev('combo_color_select',{modelo:modeloAtual.title,cor:c.cor,handle:c.handle});
    pintarBarraCor();
    var img=document.getElementById('sacPv');
    if(!img)return;
    // A foto nova é PRÉ-CARREGADA antes de animar: sem isso a animação
    // terminaria num quadrado vazio esperando o CDN.
    if(reduzido()){img.src=c.image;return}
    var palco=img.parentNode;
    var meu=++trocaCor;
    var nova=new Image();
    nova.decoding='async';
    nova.onload=nova.onerror=function(){
      // Trocou de cor de novo no meio? esta troca perdeu a vez e para aqui —
      // é o que impede duas animações correndo na mesma foto.
      if(meu!==trocaCor)return;
      img.classList.add('sai');
      // A sombra encolhe enquanto o tênis está "no ar" e volta com o novo.
      if(palco)palco.classList.add('trocando');
      aguarda(function(){
        if(meu!==trocaCor)return;
        img.src=c.image; img.classList.remove('sai'); img.classList.add('entra');
        requestAnimationFrame(function(){requestAnimationFrame(function(){
          img.classList.remove('entra');
          if(palco)palco.classList.remove('trocando');
        })});
      },160);
    };
    nova.src=c.image;
  }
  // A foto encolhe e vai até o cabeçalho da sacola: é o "entrou no carrinho".
  function voar(src,entao){
    var alvo=document.getElementById('sacHd');
    var de=sel.querySelector('.sac-pv img');
    if(reduzido()||!src||!de||!alvo||!de.getBoundingClientRect){entao();return}
    var r=de.getBoundingClientRect(), ra=alvo.getBoundingClientRect();
    if(!r.width){entao();return}
    // O produto encolhe ANTES de sair: o olho vê o tênis "descolar" da tela
    // em vez de um clone aparecer do nada.
    de.style.transition='transform 160ms var(--sac-ease-in),opacity 160ms var(--sac-ease-in)';
    de.style.transform='scale(.92)'; de.style.opacity='.35';
    var fly=document.createElement('img');
    fly.className='sac-fly'; fly.src=src; fly.alt='';
    fly.style.left=r.left+'px'; fly.style.top=r.top+'px';
    fly.style.width=r.width+'px'; fly.style.height=r.height+'px';
    document.body.appendChild(fly);
    var dx=(ra.left+ra.width/2)-(r.left+r.width/2);
    var dy=(ra.top+ra.height/2)-(r.top+r.height/2);
    requestAnimationFrame(function(){
      fly.style.transform='translate('+dx+'px,'+dy+'px) scale(.14)';
      fly.style.opacity='0';
    });
    // O painel da escolha começa a sair no meio do voo: as duas transições se
    // sobrepõem e o conjunto fica abaixo de 800ms.
    aguarda(fecharSeletor,190);
    aguarda(function(){
      if(fly.parentNode)fly.parentNode.removeChild(fly);
      entao();
    },380);
  }
  function adicionar(){
    if(!corAtual||!tamAtual||!tamAtual.available||tamAtual.elegivel===false)return;
    var c=getCart(), id=tamAtual.id;
    var trocou=!!(trocaId&&c[trocaId]!=null), idAntigo=trocaId;
    if(trocou){
      // Troca: a variante nova herda a quantidade da antiga e a antiga sai na
      // MESMA escrita — nunca existe um instante com três pares no carrinho.
      var q=c[trocaId]; delete c[trocaId];
      c[id]=(c[id]||0)+q;
      ev('combo_change',{de:trocaId,para:id,modelo:modeloAtual.title,cor:corAtual.cor,tamanho:tamAtual.option});
    }else{
      c[id]=(c[id]||0)+1;
      ev('combo_add',{variante:id,modelo:modeloAtual.title,cor:corAtual.cor,
        tamanho:tamAtual.option,valor:tamAtual.priceCents/100});
    }
    setCart(c); refreshCart(); avisar();
    // AddToCart do Pixel: é uma adição de verdade, e usa o pixel que já existe.
    try{
      if(window.fbq)fbq('track','AddToCart',{content_type:'product',content_ids:[String(id)],
        contents:[{id:String(id),quantity:1}],content_name:modeloAtual.title+' '+corAtual.cor,
        value:tamAtual.priceCents/100,currency:__CFG.currency});
    }catch(e){}

    // A LISTA acompanha o carrinho na hora, com os dados que o PRÓPRIO
    // SERVIDOR devolveu no /api/combo (preço, cor, foto, variante). Antes a
    // tela esperava o /api/variants responder para desenhar o par novo, e a
    // rede entrava no meio da animação: em 4G o "combo ativado" chegava
    // depois de um segundo. A reconciliação continua acontecendo logo
    // adiante — ela é que manda, isto aqui só antecipa o que ela vai dizer.
    if(trocou){
      itens=itens.filter(function(x){return x.variantId!==idAntigo});
    }
    var existente=itens.filter(function(x){return x.variantId===id})[0];
    if(existente)existente.qty=getCart()[id]||existente.qty+1;
    else itens.push({variantId:id,qty:getCart()[id]||1,priceCents:tamAtual.priceCents,
      compareCents:tamAtual.compareCents||0,title:modeloAtual.title,option:tamAtual.option||'',
      modelo:modeloAtual.title,cor:corAtual.cor,image:corAtual.image,handle:corAtual.handle});

    var foto=corAtual.image;
    trocaId=null;
    pulsarIcone();
    voar(foto,function(){
      fecharSeletor();
      pintar(true);
      // Confere com o catálogo depois que a animação passou: mesmos dados,
      // sem repintar por cima do movimento. Se algo tiver mudado no servidor
      // (preço, variante que saiu), é esta volta que corrige a tela.
      aguarda(function(){if(aberto)carregar(false)},520);
    });
  }
})();
`;

// Base compartilhada pela vitrine e pela coleção: card, carrinho, menu,
// drawer, busca e Pixel. Sem template literal aqui dentro (isto já é um).
const SHOP_JS = `${MONEY}${CART}
var PROMO=__CFG.promo||{}, VAR={}, vcFired={}, io=null;
var SVG_SHIELD=${JSON.stringify(svgShield())};
var SVG_TRUCK=${JSON.stringify(svgTruck())};
var SVG_RETURN=${JSON.stringify(svgReturn())};
var SVG_DOWN=${JSON.stringify(svgDown())};
var SVG_CARET=${JSON.stringify(svgCaret())};
var SVG_ZOOM=${JSON.stringify(svgZoom())};
var SVG_VERIF=${JSON.stringify(svgVerif())};
var SVG_PIX=${JSON.stringify(svgPix())};
var SVG_SETA_PREV=${JSON.stringify(svgSeta('prev'))};
var SVG_SETA_NEXT=${JSON.stringify(svgSeta('next'))};

// Carrossel das vitrines: as setas rolam ~uma tela de cards por clique e somem
// nas pontas. O scroll continua nativo (dedo, roda do mouse), as setas só o
// empurram — por isso nada trava se o JS falhar.
function ligarSetas(wrap){
  var row=wrap.querySelector('.row,.hl-row');
  var prev=wrap.querySelector('.rowbtn.prev'), next=wrap.querySelector('.rowbtn.next');
  if(!row||!prev||!next)return;
  var passo=function(){return Math.max(200,Math.round(row.clientWidth*0.85))};
  var atualiza=function(){
    var max=row.scrollWidth-row.clientWidth;
    // Em repouso a fileira não para em 0: o scroll-snap encosta o primeiro card
    // depois do padding lateral. Sem contar essa folga, a seta da esquerda
    // apareceria já no começo, sem ter para onde voltar.
    var folga=(parseFloat(getComputedStyle(row).paddingLeft)||0)+2;
    prev.hidden=row.scrollLeft<=folga;
    next.hidden=row.scrollLeft>=max-2;
  };
  prev.addEventListener('click',function(){row.scrollBy({left:-passo(),behavior:'smooth'})});
  next.addEventListener('click',function(){row.scrollBy({left:passo(),behavior:'smooth'})});
  row.addEventListener('scroll',atualiza,{passive:true});
  window.addEventListener('resize',atualiza);
  atualiza();
}
function setasHtml(){
  return '<button class="rowbtn prev" type="button" aria-label="Anterior">'+SVG_SETA_PREV+'</button>'+
         '<button class="rowbtn next" type="button" aria-label="Próximos">'+SVG_SETA_NEXT+'</button>';
}
// mesma regra do servidor (collections.js) — handle de coleção a partir da tag
function slugTag(t){return String(t||'').trim().toLowerCase()
  .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
// Nota fixa: o catálogo não guarda avaliação por produto.
var STARS='<div class="stars">'+${JSON.stringify(svgStar())}.repeat(5)+'<span>(5.0)</span></div>';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function skel(el,n){var s='';for(var i=0;i<n;i++){
  s+='<div class="sk"><div class="b b1"></div><div class="b b2"></div><div class="b b3"></div></div>'}
  el.innerHTML=s}
function learn(list){list.forEach(function(p){(p.variants||[]).forEach(function(v){
  VAR[v.id]={priceCents:v.priceCents,title:p.title}})})}
function fbTrack(ev,vid,extra){
  if(!window.fbq||!vid)return;
  var v=VAR[vid]||{};
  var d={content_type:'product',content_ids:[String(vid)],contents:[{id:String(vid),quantity:1}],
    content_name:v.title||'',value:(v.priceCents||0)/100,currency:__CFG.currency};
  fbq('track',ev,Object.assign(d,extra||{}));
}
function viewContent(vid){if(!vid||vcFired[vid])return;vcFired[vid]=true;fbTrack('ViewContent',vid)}
// Card da vitrine: SEM numeração (a escolha do tamanho é na página do produto)
// e com "Comprar" levando pra lá, em vez de jogar direto na sacola.
function cardHtml(p){
  var vs=p.variants||[];
  var first=vs.filter(function(v){return v.available})[0]||vs[0]||null;
  var temDe=first&&first.compareCents&&first.compareCents>first.priceCents;
  var off=temDe
    ? '<span class="off">'+SVG_DOWN+Math.round((1-first.priceCents/first.compareCents)*100)+'%</span>'
    : ((first&&PROMO.eligiblePriceCents&&promoElegivel({priceCents:first.priceCents,handle:p.handle}))
        ? '<span class="tag">'+esc(PROMO.label||'PROMO')+'</span>' : '');
  var de=temDe?'<s>'+money(first.compareCents)+'</s>':'';
  var href='/produto/'+esc(p.handle||'');
  return '<div class="prod" data-vid="'+esc(first?first.id:'')+'">'+
    '<a class="ph" href="'+href+'" style="background-image:url('+esc(p.image)+')">'+off+
      '<img loading="lazy" src="'+esc(p.image||'')+'" alt="'+esc(p.title)+'"></a>'+
    '<a class="ttl" href="'+href+'"><h3>'+esc(p.title)+'</h3></a>'+
    '<div class="price">'+(first?money(first.priceCents):'')+de+'</div>'+
    '<div class="parc">à vista no <b>PIX</b></div>'+
    STARS+'</div>';
}
function observeCards(root){
  if(!window.IntersectionObserver)return;
  if(!io)io=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      var card=e.target;
      if(!e.isIntersecting){clearTimeout(card._vcT);return}
      card._vcT=setTimeout(function(){viewContent(card.dataset.vid);io.unobserve(card)},700);
    });
  },{threshold:.5});
  root.querySelectorAll('.prod').forEach(function(c){io.observe(c)});
}
function refreshCart(){
  var n=cartCount(getCart());
  var a=document.getElementById('cartCount');
  if(a){a.textContent=n;a.classList.toggle('on',n>0)}
}
// Um só listener no documento cobre home e coleção (cards chegam depois).
document.addEventListener('click',function(e){
  if(!e.target.closest)return;
  var sz=e.target.closest('.sz');
  if(sz&&!sz.disabled){
    // No card da vitrine o dono é .prod; na página de produto é o bloco .pdp.
    // Busca a partir do PAI: o próprio botão tem data-vid e closest() inclui
    // o elemento de origem — sem isso ele "acha" a si mesmo, o dono nunca
    // troca de variante e o Comprar manda sempre a primeira numeração.
    var card=sz.closest('.prod')||(sz.parentElement&&sz.parentElement.closest('[data-vid]'));
    if(!card)return;
    card.querySelectorAll('.sz').forEach(function(b){b.classList.remove('on')});
    sz.classList.add('on'); card.dataset.vid=sz.dataset.vid;
    var v=VAR[sz.dataset.vid], pr=card.querySelector('.price');
    if(v&&pr)pr.textContent=money(v.priceCents);
    viewContent(sz.dataset.vid); return;
  }
  // Os dois botões da página de produto põem o par no carrinho e abrem
  // /carrinho. O "Comprar" atalhava direto pro checkout até 21/09/2026, quando
  // o dono pediu a parada no carrinho antes. O "Comprar" do card é link, não
  // passa aqui.
  var buy=e.target.closest('.buy'), add=e.target.closest('.addcart');
  var bt=buy||add;
  if(bt&&!bt.disabled){
    var host=bt.closest('[data-vid]'), vid=host&&host.dataset.vid;
    if(!vid){alert('Escolha a numeração.');return}
    var c=getCart(); c[vid]=(c[vid]||0)+1; setCart(c); refreshCart();
    fbTrack('AddToCart',vid);
    // Desde o carrinho lateral (28/09/2026) a sacola ABRE por cima da loja em
    // vez de trocar de página: quem acabou de escolher um par vê na hora a
    // oferta do segundo, sem perder a vitrine de trás. Nas páginas que não
    // montam o painel (a oferta pós-compra tem carrinho próprio) segue o
    // caminho antigo, o /carrinho.
    if(window.sacolaAbrir)window.sacolaAbrir('add');
    else location.href='/carrinho';
  }
});
// ---- topo: altura real, estado sólido, e a entrada das seções ----
// Fica no SHOP_JS porque vale para a loja inteira (home, coleção, produto,
// institucionais), e não só para a home.
(function(){
  var hdr=document.querySelector('.hdr');
  var calmo=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // A altura do topo vira --hdr-h. O hero sobe por baixo dele com margem
  // negativa desse tamanho: medir em vez de chutar é o que evita o pulo de
  // layout quando a fonte da logo termina de carregar.
  function medir(){
    if(!hdr)return;
    var h=Math.round(hdr.getBoundingClientRect().height);
    if(h)document.documentElement.style.setProperty('--hdr-h',h+'px');
  }
  medir();
  window.addEventListener('resize',medir);
  if(document.fonts&&document.fonts.ready&&document.fonts.ready.then)document.fonts.ready.then(medir);

  // Na home o topo nasce transparente por cima do hero e ganha corpo ao rolar.
  if(hdr&&hdr.classList.contains('hdr--hero')){
    var pede=0;
    var ver=function(){pede=0;hdr.classList.toggle('solido',window.scrollY>28)};
    window.addEventListener('scroll',function(){if(!pede)pede=requestAnimationFrame(ver)},{passive:true});
    ver();
  }

  // Entrada das seções. Um observador só para a página inteira, e cada alvo
  // sai dele assim que aparece — nada fica acumulando observação nem
  // recalculando depois de já ter entrado.
  var io=null;
  if(!calmo&&'IntersectionObserver' in window){
    io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(!e.isIntersecting)return;
        e.target.classList.add('rev');
        io.unobserve(e.target);
      });
    },{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  }
  // Exposta porque as vitrines chegam depois, por JS: quem injeta chama isto.
  window.revelar=function(raiz){
    var alvos=(raiz||document).querySelectorAll('[data-rev]:not(.rev)');
    if(!io){[].forEach.call(alvos,function(e){e.classList.add('rev')});return}
    [].forEach.call(alvos,function(e){io.observe(e)});
  };
  revelar();
})();

// --- menu (drawer, aberto pelo botão Menu) ---
function renderMenu(menu){
  var dn=document.getElementById('drawernav');
  if(dn)dn.innerHTML=menu.map(function(m){
    var kids=[];
    (m.children||[]).forEach(function(c){
      kids.push('<a href="/colecao/'+esc(c.handle)+'">'+esc(c.title)+' ('+c.count+')</a>');
      (c.children||[]).forEach(function(g){
        kids.push('<a href="/colecao/'+esc(g.handle)+'" style="padding-left:44px">'+esc(g.title)+' ('+g.count+')</a>')});
    });
    return '<div class="dn"><button>'+esc(m.title)+'<span class="ar">›</span></button>'+
      '<div class="dsub"><a href="/colecao/'+esc(m.handle)+'"><b>Ver tudo de '+esc(m.title)+'</b></a>'+kids.join('')+'</div></div>';
  }).join('');
  if(dn)dn.querySelectorAll('.dn>button').forEach(function(b){
    b.addEventListener('click',function(){b.parentNode.classList.toggle('open')})});
}
(function(){
  var dr=document.getElementById('drawer'), sc=document.getElementById('scrim');
  var open=function(v){if(dr)dr.classList.toggle('on',v);if(sc)sc.classList.toggle('on',v)};
  var bg=document.getElementById('burger'); if(bg)bg.addEventListener('click',function(){open(true)});
  var cd=document.getElementById('closeDrawer'); if(cd)cd.addEventListener('click',function(){open(false)});
  if(sc)sc.addEventListener('click',function(){open(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')open(false)});
})();
// --- busca (servidor, com debounce) ---
// O campo vive no header; os resultados abrem num cartão ancorado nele.
(function(){
  var btn=document.getElementById('btnSearch'), open=document.getElementById('openSearch');
  var wrap=document.querySelector('.searchwrap');
  var q=document.getElementById('q'), out=document.getElementById('sresults');
  if(!q||!out)return;
  var show=function(html){out.innerHTML=html;out.classList.add('on')};
  var hide=function(){out.classList.remove('on')};

  // a barra fica minimizada: só existe depois de clicar na lupa
  function abrir(v){
    if(!wrap)return;
    wrap.classList.toggle('on',v);
    if(open)open.setAttribute('aria-expanded',v?'true':'false');
    if(v)q.focus(); else {hide();q.value=''}
  }
  if(open)open.addEventListener('click',function(){abrir(!wrap.classList.contains('on'))});

  var t;
  function buscar(){
    clearTimeout(t);
    var term=q.value.trim();
    if(term.length<2){hide();return}
    t=setTimeout(function(){
      fetch('/api/busca?q='+encodeURIComponent(term)).then(function(r){return r.json()}).then(function(d){
        var ps=d.products||[];
        if(!ps.length){show('<p class="msg">Nada encontrado para "'+esc(term)+'".</p>');return}
        learn(ps);
        // Busca relaxada: nem todo termo casou. Sem dizer isso, o cliente que
        // procurou "air max tn 95" acha que ESTES são o que ele pediu.
        var aviso=d.aproximado
          ? '<p class="msg">Nada exato para "'+esc(term)+'". Talvez você queira:</p>'
          : '';
        show(aviso+ps.map(function(p){
          var v=(p.variants||[])[0]||{};
          return '<a href="/produto/'+esc(p.handle||'')+'">'+
            '<img src="'+esc(p.image||'')+'" alt=""><span class="t">'+esc(p.title)+'</span>'+
            '<span class="p">'+(v.priceCents?money(v.priceCents):'')+'</span></a>';
        }).join(''));
      }).catch(function(){show('<p class="msg">Erro na busca.</p>')});
    },250);
  }
  q.addEventListener('input',buscar);
  q.addEventListener('focus',function(){if(out.innerHTML&&q.value.trim().length>1)out.classList.add('on')});
  if(btn)btn.addEventListener('click',function(e){e.preventDefault();q.focus();buscar()});
  // Clique fora: esconde os resultados e recolhe a barra se nada foi digitado
  // (com texto, recolher apagaria a busca de quem só clicou na página).
  // O clique no próprio botão da lupa não passa aqui — senão abriria e fecharia.
  document.addEventListener('click',function(e){
    var dentro=e.target.closest&&(e.target.closest('.searchwrap')||e.target.closest('#openSearch'));
    if(dentro)return;
    hide();
    if(!q.value.trim())abrir(false);
  });
  q.addEventListener('keydown',function(e){if(e.key==='Escape'){abrir(false)}});
})();
${CART_DRAWER_JS}`;

// ------------------------------------------------------------- JS da vitrine
const STORE_JS = `${SHOP_JS}${HERO_JS}
(async function(){
  var feats=document.getElementById('feats');
  skel(feats,0);
  feats.innerHTML='<div class="feat"><div class="feat-hd"><h2>Carregando…</h2></div><div class="row" id="skrow"></div></div>';
  skel(document.getElementById('skrow'),6);

  var d;
  try{d=await (await fetch('/api/home')).json()}
  catch(e){feats.innerHTML='<p class="muted" style="padding:24px 16px">Não foi possível carregar a loja. Recarregue a página.</p>';return}
  if(d.error){feats.innerHTML='<p class="muted" style="padding:24px 16px">'+esc(d.error)+'</p>';return}

  renderMenu(d.menu||[]);
  var secs=d.sections||[];
  secs.forEach(function(s){learn(s.products||[])});

  // vitrine curada: painel colorido à esquerda, produtos rolando à direita
  var dest=d.destaque;
  var destHtml='';
  if(dest&&(dest.products||[]).length){
    learn(dest.products);
    destHtml='<section class="hl"><div class="hl-in">'+
      '<div class="hl-tx"><h2>'+esc(dest.title||'')+'</h2>'+
      (dest.subtitle?'<p>'+esc(dest.subtitle)+'</p>':'')+
      (dest.href?'<a class="hl-btn" href="'+esc(dest.href)+'">'+esc(dest.botao||'Ver todos')+'</a>':'')+
      '</div>'+
      '<div class="rowwrap">'+
        '<div class="hl-row">'+dest.products.map(cardHtml).join('')+'</div>'+setasHtml()+
      '</div>'+
      '</div></section>';
  }

  function vitrineHtml(s){
    return '<section class="feat"><div class="feat-hd" data-rev="left"><h2>'+esc(s.title)+'</h2>'+
      '<a href="/colecao/'+esc(s.handle)+'">Ver Todos <i>('+s.total+')</i></a></div>'+
      '<div class="rowwrap"><div class="row">'+(s.products||[]).map(cardHtml).join('')+'</div>'+
      setasHtml()+'</div></section>';
  }

  // A chamada do Instagram fica no MEIO das vitrines, não no fim da página.
  // Ela é HTML do servidor (fica entre os dois contêineres), então as vitrines
  // são divididas em duas metades em vez de a seção ser movida por JS —
  // assim ela não pisca de lugar enquanto o /api/home carrega.
  var feats2=document.getElementById('feats2');
  var corte=feats2?Math.ceil(secs.length/2):secs.length;
  feats.innerHTML=destHtml+secs.slice(0,corte).map(vitrineHtml).join('');
  if(feats2)feats2.innerHTML=secs.slice(corte).map(vitrineHtml).join('');

  // As vitrines chegam por JS: o observador de entrada só as conhece agora.
  if(window.revelar)revelar(feats), revelar(feats2);
  [feats,feats2].forEach(function(box){
    if(!box)return;
    box.querySelectorAll('.rowwrap').forEach(ligarSetas);
    observeCards(box);
  });
  refreshCart();
})();`;

// ---------------------------------------------------------- PRODUTO ("/produto/:h")
export function productPage(handle) {
  const body = `
  ${shopHeader()}

  <div class="wrap">
    <nav class="crumb"><a href="/">Página inicial</a> <i>›</i> <a id="crumbCol" href="/">Catálogo</a> <i>›</i> <b id="crumbNow">Produto</b></nav>
    <div id="pdp">
    <p class="muted" style="padding:40px 0;text-align:center">Carregando…</p>
  </div></div>
  <!-- Prova social ANTES do "você também pode gostar": o #rel é preenchido por
       JS, então pôr os depoimentos depois dele faria a seção descer sozinha
       quando os relacionados chegassem. Aqui ela nasce no lugar definitivo. -->
  ${depoimentosSection()}
  <div id="rel"></div>

  ${zapBtn()}
  <script>window.__HANDLE=${jsonSeguro(String(handle || ''))};</script>
  <script>${PRODUCT_JS}</script>
  <script>${DEP_JS}</script>`;
  return html(`Produto — ${LOJA.nomeCompleto}`, body, STORE_CSS_SHARED + PDP_CSS);
}

const PDP_CSS = `
  /* ===================== PÁGINA DE PRODUTO =====================
     Duas colunas no computador: o PALCO do produto ocupa ~57% e fica grudado
     enquanto a coluna de compra rola. No celular vira uma coluna só, e a ordem
     do HTML já é a da leitura: produto, nome, preço, cor, numeração, CTA. */
  .pdp{display:grid;gap:22px;padding:0 0 10px;align-items:start}
  @media(min-width:1000px){
    .pdp{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:40px}
    .pdp-palco{position:sticky;top:calc(var(--hdr-h) + 14px)}
  }
  /* ---- palco: galeria + giro ---- */
  .pdp-stage{position:relative;border-radius:20px;overflow:hidden;background:#f4f3f7;
    border:1px solid var(--line)}
  .pdp-trilho{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;
    cursor:grab}
  .pdp-trilho::-webkit-scrollbar{display:none}
  .pdp-trilho.arrastando{cursor:grabbing;scroll-snap-type:none}
  .pdp-slide{flex:0 0 100%;min-width:0;scroll-snap-align:center;aspect-ratio:1;
    display:grid;place-items:center;background:#fff}
  .pdp-slide img{width:100%;height:100%;object-fit:contain;display:block;
    /* a foto entra quando carrega, em vez de aparecer de supetão */
    opacity:0;transition:opacity var(--mo-comp) var(--ez-out)}
  .pdp-slide img.veio{opacity:1}
  /* contador discreto no canto — substitui setas enormes */
  .pdp-conta{position:absolute;right:12px;bottom:12px;z-index:3;
    background:rgba(11,10,15,.68);color:#fff;font-size:11.5px;font-weight:700;
    letter-spacing:.06em;padding:6px 11px;border-radius:999px;
    -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .pdp-zoom{position:absolute;left:12px;bottom:12px;z-index:3;width:38px;height:38px;
    border-radius:999px;border:none;cursor:pointer;display:grid;place-items:center;
    background:rgba(11,10,15,.68);color:#fff;
    -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    transition:background var(--mo-micro) ease,transform var(--mo-micro) var(--ez-out)}
  .pdp-zoom:hover{background:#0b0a0f;transform:scale(1.06)}
  .pdp-zoom svg{width:18px;height:18px}
  /* ---- giro: fica POR CIMA da galeria, no mesmo palco ---- */
  .pdp-giro{position:absolute;inset:0;z-index:4;background:#fff;
    display:grid;place-items:center;
    /* pan-y: o arrasto horizontal é nosso (gira o tênis), o vertical continua
       sendo da página — no celular a pessoa precisa conseguir rolar com o dedo
       em cima da foto. */
    touch-action:pan-y;cursor:ew-resize;
    opacity:0;visibility:hidden;transition:opacity var(--mo-comp) var(--ez-out),visibility var(--mo-comp)}
  .pdp-giro.on{opacity:1;visibility:visible}
  .pdp-giro img{width:100%;height:100%;object-fit:contain;display:block;-webkit-user-drag:none;user-select:none}
  .pdp-giro-dica{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
    display:inline-flex;align-items:center;gap:8px;white-space:nowrap;
    background:rgba(11,10,15,.72);color:#fff;font-size:12px;font-weight:600;
    padding:8px 14px;border-radius:999px;pointer-events:none;
    transition:opacity var(--mo-comp) var(--ez-out)}
  .pdp-giro-dica.some{opacity:0}
  .pdp-giro-barra{position:absolute;left:14px;right:14px;bottom:0;height:3px;border-radius:999px;
    background:rgba(11,10,15,.12);overflow:hidden}
  .pdp-giro-barra i{display:block;height:100%;background:var(--brand);width:0%;
    transition:width .2s linear}
  /* ---- alternador fotos / girar ---- */
  .pdp-modos{display:flex;gap:8px;margin:12px 0 0}
  .pdp-modo{flex:1;min-height:44px;border:1.5px solid var(--line);background:#fff;border-radius:12px;
    font:inherit;font-size:13px;font-weight:700;color:#3a3742;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;gap:8px;
    transition:border-color var(--mo-micro) ease,background var(--mo-micro) ease,color var(--mo-micro) ease}
  .pdp-modo:hover{border-color:#0b0a0f}
  .pdp-modo.on{background:#0b0a0f;border-color:#0b0a0f;color:#fff}
  .pdp-modo svg{width:16px;height:16px}
  /* ---- miniaturas ---- */
  .pdp-thumbs{display:flex;gap:9px;overflow-x:auto;margin:11px 0 0;padding-bottom:4px;
    scrollbar-width:none}
  .pdp-thumbs::-webkit-scrollbar{display:none}
  .pdp-thumb{flex:0 0 70px;aspect-ratio:1;border:2px solid var(--line);border-radius:12px;
    background:#fff;padding:3px;cursor:pointer;
    transition:border-color var(--mo-micro) ease,transform var(--mo-micro) var(--ez-out)}
  .pdp-thumb:hover{transform:translateY(-2px)}
  .pdp-thumb.on{border-color:#0b0a0f}
  .pdp-thumb img{width:100%;height:100%;object-fit:contain;display:block;border-radius:8px}
  /* ---- coluna de compra ---- */
  .pdp-info{min-width:0}
  .pdp-marca{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;
    letter-spacing:.16em;text-transform:uppercase;color:var(--brand);margin:0 0 8px}
  .pdp-info h1{font-size:clamp(22px,5.2vw,32px);line-height:1.12;margin:0 0 8px;
    letter-spacing:-.02em;font-weight:700}
  .pdp-meta{font-size:12.5px;color:#6e6a78;margin:0 0 16px}
  .pdp-meta .stock{color:var(--comprar);font-weight:600}
  .pdp-meta .out{color:#c2334d;font-weight:600}
  /* preço */
  .pdp-preco{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 4px}
  .pdp-preco b{font-size:clamp(26px,6.5vw,34px);font-weight:600;color:var(--ink);
    letter-spacing:-.03em;line-height:1}
  .pdp-preco s{color:#9a96a4;font-size:15px}
  .pdp-preco .off{background:var(--promo);color:#fff;font-size:12px;
    font-weight:600;padding:4px 9px;border-radius:999px}
  .pdp-pix{font-size:13px;color:#6e6a78;margin:0 0 14px}
  .pdp-pix b{color:#0b0a0f}
  /* faixa da promoção, com os números vindos de config.promo */
  .pdp-promo{display:flex;align-items:center;gap:11px;border:1.5px solid var(--brand);
    background:var(--brand-soft);border-radius:14px;padding:11px 14px;margin:0 0 18px}
  .pdp-promo svg{width:20px;height:20px;color:var(--brand-d);flex:none}
  .pdp-promo b{display:block;font-size:14px;color:#0b0a0f;line-height:1.25}
  .pdp-promo span{display:block;font-size:12.5px;color:var(--brand-d);margin-top:1px}
  /* ---- cores irmãs ---- */
  .pdp-lbl{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
    font-size:13px;font-weight:700;margin:0 0 9px;color:#0b0a0f}
  .pdp-lbl span{font-weight:500;color:#6e6a78}
  .pdp-lbl a{font-size:12.5px;font-weight:600;cursor:pointer}
  .pdp-cores{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:9px;
    margin:0 0 20px}
  .pdp-cor{position:relative;border:2px solid var(--line);border-radius:12px;background:#fff;
    padding:3px;cursor:pointer;font:inherit;display:block;
    transition:border-color var(--mo-micro) ease,transform var(--mo-micro) var(--ez-out),
      box-shadow var(--mo-micro) ease}
  .pdp-cor:hover{transform:translateY(-2px);border-color:#8b8794}
  .pdp-cor.on{border-color:#0b0a0f;transform:translateY(-2px);
    box-shadow:0 10px 18px -12px rgba(11,10,15,.6)}
  .pdp-cor.on::after{content:'';position:absolute;top:-5px;right:-5px;width:15px;height:15px;
    border-radius:50%;background:#0b0a0f;border:2px solid #fff}
  .pdp-cor img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:#f6f5f8}
  .pdp-cor i{display:block;font-style:normal;font-size:10px;line-height:1.2;color:#4b4753;
    margin-top:3px;text-align:center;overflow:hidden;display:-webkit-box;
    -webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:24px}
  .pdp-cores-mais{grid-column:1/-1;min-height:44px;border:1.5px solid var(--line);background:#fff;
    border-radius:12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:#0b0a0f}
  .pdp-cores-mais:hover{border-color:#0b0a0f}
  /* ---- numeração ---- */
  .sizes{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:9px;margin:0 0 18px}
  .sz{position:relative;min-height:52px;border:1.5px solid #d3d0db;background:#fff;border-radius:12px;
    font:inherit;font-size:15px;font-weight:700;color:#0b0a0f;cursor:pointer;
    transition:border-color var(--mo-micro) ease,background var(--mo-micro) ease,
      transform var(--mo-micro) var(--ez-out)}
  .sz:hover:not(:disabled){border-color:#0b0a0f}
  .sz.on{border-color:#0b0a0f;border-width:2.5px;background:#f0eff3}
  .sz.toque{animation:sacToque 180ms var(--ez-out) 1}
  .sz:disabled{opacity:.32;cursor:not-allowed;text-decoration:line-through;
    transform:none!important;animation:none!important}
  .szgrupo{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    color:#8b8794;margin:0 0 7px}
  /* ---- CTA ---- */
  .buy,.addcart{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
    border-radius:999px;padding:18px;font:inherit;font-weight:800;font-size:15px;
    letter-spacing:.03em;cursor:pointer;border:2px solid transparent;
    transition:background var(--mo-micro) ease,transform var(--mo-micro) var(--ez-out)}
  /* Pílula preta, como o "Try it today" do YNS. O verde de confirmar não some
     da loja: continua no checkout e nos avisos de sucesso, que é onde ele quer
     dizer alguma coisa. Na vitrine ele só competia com a foto. */
  .buy{background:var(--acao);color:#fff;border:none;font-weight:500}
  .buy:hover{background:var(--acao-h)}
  .buy:active:not(:disabled){transform:scale(.985)}
  .buy .sac-ar{transition:transform var(--mo-micro) var(--ez-out)}
  .buy:hover .sac-ar{transform:translateX(4px)}
  .addcart{background:#fff;color:var(--ink);border-color:var(--line);margin-top:10px;font-weight:500}
  .addcart:hover{border-color:var(--ink)}
  .addcart:active:not(:disabled){transform:scale(.985)}
  .buy:disabled,.addcart:disabled{opacity:.4;cursor:not-allowed}
  .pdp-trust{display:grid;gap:9px;margin:18px 0 0;font-size:13px;color:#3a3742}
  .pdp-trust div{display:flex;align-items:center;gap:9px}
  .pdp-trust svg{width:17px;height:17px;color:var(--comprar);flex:none}
  /* ---- barra fixa do celular ---- */
  .pdp-sticky{position:fixed;left:0;right:0;bottom:0;z-index:55;background:#fff;
    border-top:1px solid var(--line);display:flex;align-items:center;gap:12px;
    padding:10px 14px calc(10px + env(safe-area-inset-bottom));
    box-shadow:0 -10px 26px -22px rgba(11,10,15,.8);
    transform:translateY(110%);transition:transform var(--mo-comp) var(--ez)}
  .pdp-sticky.on{transform:none}
  @media(min-width:1000px){.pdp-sticky{display:none}}
  /* no computador não existe barra fixa, então o rodapé da página volta ao normal */
  @media(min-width:1000px){.pdp-fim{padding-bottom:54px}}
  .pdp-sticky .v{flex:none}
  .pdp-sticky .v b{display:block;font-size:17px;font-weight:600;color:var(--ink);line-height:1.1}
  .pdp-sticky .v span{display:block;font-size:11px;color:#6e6a78}
  .pdp-sticky button{flex:1;min-height:48px;border:none;border-radius:999px;cursor:pointer;
    background:var(--acao);color:#fff;font:inherit;font-weight:500;font-size:14px;
    letter-spacing:.02em}
  .pdp-sticky button:disabled{opacity:.45}
  /* ===================== SEÇÃO CINEMATOGRÁFICA ===================== */
  /* A foto fica grudada de um lado e troca conforme cada bloco de texto entra.
     Sensação de filme sem WebGL e sem sequestrar o scroll. */
  /* A seção cinematográfica ganha a chapa de concreto por trás. A cor sólida
     continua declarada: se a textura não baixar, muda a matéria, não a
     legibilidade. O gradiente por cima segura o contraste do texto branco. */
  .pdp-cine{background:#0b0a0f;color:#fff;margin:34px 0 0;padding:0 0 10px;position:relative;
    background-image:linear-gradient(180deg,rgba(11,10,15,.94),rgba(11,10,15,.82)),
      url('${CHAPA_CONCRETO}');
    background-size:cover;background-position:center;background-attachment:local}
  .pdp-cine-in{max-width:1240px;margin:0 auto;padding:0 16px;display:grid;gap:0}
  @media(min-width:900px){
    .pdp-cine-in{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;padding:0 26px}
  }
  .pdp-cine-img{position:relative}
  @media(min-width:900px){
    .pdp-cine-img{position:sticky;top:calc(var(--hdr-h) + 40px);height:min(72vh,560px);
      display:grid;place-items:center}
  }
  @media(max-width:899px){
    /* 34vh, não 46vh. Com 46 a foto comia dois terços da tela e o bloco de
       texto entrava pela beirada de baixo, sem espaço para ser lido — que é o
       ponto inteiro da seção. Agora a foto ocupa um terço e o texto tem a
       metade de baixo só para ele. */
    .pdp-cine-img{position:sticky;top:calc(var(--hdr-h) + 8px);height:34vh;display:grid;
      place-items:center;z-index:2;background:#0b0a0f;padding-bottom:10px}
    .pdp-cine-bloco{min-height:46vh;padding:22px 0}
  }
  .pdp-cine-img img{width:100%;height:100%;object-fit:contain;
    transition:opacity var(--mo-comp) var(--ez-out),transform var(--mo-hero) var(--ez)}
  .pdp-cine-img img.trocando{opacity:0;transform:scale(.96) rotate(-1.5deg)}
  .pdp-cine-tx{display:grid;gap:0}
  .pdp-cine-bloco{min-height:64vh;display:flex;flex-direction:column;justify-content:center;
    padding:30px 0}
  @media(min-width:900px){.pdp-cine-bloco{min-height:78vh}}
  .pdp-cine-bloco .n{font-size:11px;font-weight:800;letter-spacing:.2em;color:var(--volt);
    text-transform:uppercase}
  .pdp-cine-bloco h3{font-size:clamp(24px,6vw,40px);line-height:1.04;margin:12px 0 12px;
    font-weight:800;letter-spacing:-.03em;text-transform:uppercase}
  .pdp-cine-bloco p{margin:0;font-size:15px;line-height:1.6;color:#c9c3d6;max-width:34em}
  .pdp-cine-bloco p b{color:#fff}
  /* ---- CTA final da página ---- */
  /* O padding de baixo reserva o espaço da barra fixa de comprar (altura do
     botão + safe area do iPhone). Sem isto ela cobria a última linha de texto
     da página — dava para ver metade da frase atrás do botão verde. */
  .pdp-fim{background:#0b0a0f;color:#fff;text-align:center;
    padding:38px 16px calc(54px + 72px + env(safe-area-inset-bottom));position:relative;
    background-image:linear-gradient(180deg,rgba(11,10,15,.86),rgba(11,10,15,.96)),
      url('${CHAPA_LUZ}');
    background-size:cover;background-position:center}
  .pdp-fim h3{font-size:clamp(22px,5.5vw,32px);margin:0 0 8px;font-weight:800;
    letter-spacing:-.02em;text-transform:uppercase}
  .pdp-fim p{margin:0 0 20px;color:#b9b3c6;font-size:14px}
  .pdp-fim .buy{max-width:380px;margin:0 auto}
  /* ---- descrição / tabela ---- */
  .pcard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px}
  .pcard.desc{margin-top:22px}
  .pcard.desc h2{font-size:17px;margin:0 0 12px}
  .desc-in{font-size:14.5px;line-height:1.65;color:#3a3742}
  .medidas{display:grid;gap:16px;align-items:center}
  @media(min-width:760px){.medidas{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
  .medidas img{width:100%;height:auto;border-radius:12px;cursor:zoom-in;border:1px solid var(--line)}
  .medidas-tx h3{font-size:15px;margin:0 0 8px}
  .medidas-tx p{margin:0 0 8px;font-size:13.5px;line-height:1.6;color:#4b4753}
  .medidas-zoom{color:#8b8794;font-size:12.5px}
  /* ---- ficha, montada dos dados REAIS do catálogo ---- */
  .pdp-ficha{display:grid;gap:0;margin:14px 0 0;border-top:1px solid var(--line)}
  .pdp-ficha div{display:flex;justify-content:space-between;gap:14px;padding:11px 0;
    border-bottom:1px solid var(--line);font-size:13.5px}
  .pdp-ficha dt{color:#6e6a78;margin:0}
  .pdp-ficha dd{margin:0;color:#0b0a0f;font-weight:600;text-align:right}
  /* ---- modal de zoom ---- */
  .modal{position:fixed;inset:0;z-index:95;background:rgba(11,10,15,.92);display:none;
    place-items:center;padding:20px}
  .modal.on{display:grid}
  .modal img{max-width:100%;max-height:92vh;object-fit:contain;border-radius:10px}
  .modal button{position:absolute;top:14px;right:16px;width:44px;height:44px;border-radius:999px;
    border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.4);color:#fff;font-size:26px;
    cursor:pointer;line-height:1}
  @media(prefers-reduced-motion:reduce){
    .pdp-slide img,.pdp-giro,.pdp-cine-img img,.pdp-sticky,.pdp-cor,.pdp-thumb,.sz{transition-duration:1ms!important}
    .pdp-cine-img img.trocando{transform:none}
    .sz.toque{animation:none}
  }
`;

// Endereço da tabela de medidas, num lugar só. Ela aparece em DOIS pontos da
// página do produto — o modal do link ao lado da numeração e a imagem dentro
// da descrição — e dois caminhos escritos à mão dariam, na primeira troca de
// arte, numa página mostrando duas tabelas diferentes para a mesma numeração.
// Trocou a arte? suba o ?v= aqui. O /assets tem cache de 7 dias, então
// reaproveitar o endereço inteiro deixaria quem já visitou vendo a tabela
// velha por uma semana.
//   v2 (29/08/2026) — a v1 pulava o 44, e o 44 está em TODOS os calçados do
//   catálogo. A arte nova tem as 12 numerações do 34 ao 45, na mesma ordem
//   crescente do começo ao fim.
// Arte SEM marca, 900x900, numeração 34 a 44 — a mesma grade que todo calçado
// desta loja vende. A da A Fonte (tabela-medidas.webp) tinha a logo dela e
// não veio. Nas cores da logo desde 13/09/2026 (assets/tabela-medidas-fonte.html,
// renderizada pelo gerar-arte.mjs); o ?v= sai da data do arquivo.
const TABELA_MEDIDAS = comVersao('/assets/tabela-medidas.png');

const PRODUCT_JS = `${SHOP_JS}
var TABELA_MEDIDAS=${JSON.stringify(TABELA_MEDIDAS)};
var SVG_CARTAO=${JSON.stringify(svgCartao())};
var SVG_GIRO=${JSON.stringify(svgGiro())};
var SVG_FOTOS=${JSON.stringify(svgFotos())};
var SVG_TAG=${JSON.stringify(svgTag())};
var PROMO_CFG=(window.__CFG&&__CFG.promo)||{};
(function(){
  var box=document.getElementById('pdp'), relBox=document.getElementById('rel');
  fetch('/api/menu').then(function(r){return r.json()}).then(function(d){renderMenu(d.menu||[])}).catch(function(){});

  // ---- um modal só, reaproveitado pelo zoom da foto e pela tabela ----
  var md=document.createElement('div');
  md.className='modal';
  md.innerHTML='<button aria-label="Fechar">&times;</button><img alt="">';
  document.body.appendChild(md);
  var mdImg=md.querySelector('img');
  function verFoto(src,alt){mdImg.src=src;mdImg.alt=alt||'';md.classList.add('on')}
  md.addEventListener('click',function(){md.classList.remove('on')});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')md.classList.remove('on')});

  // ---- barra fixa do celular: nasce fora da tela e só entra quando o CTA sai ----
  var sticky=document.createElement('div');
  sticky.className='pdp-sticky';
  document.body.appendChild(sticky);
  var ioCta=null;

  var calmo=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var timers=[];
  function limpar(){timers.forEach(clearTimeout);timers=[]}
  function depois(fn,ms){if(calmo){fn();return}var t=setTimeout(fn,ms);timers.push(t);return t}

  // ================= CARREGAR E MONTAR =================
  function carregar(handle,empurrar){
    box.innerHTML='<p class="muted" style="padding:40px 0;text-align:center">Carregando…</p>';
    return fetch('/api/produto/'+encodeURIComponent(handle))
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.error){box.innerHTML='<p class="muted" style="padding:40px 0;text-align:center">'+esc(d.error)+'</p>';return}
        if(empurrar&&window.history&&history.pushState){
          // A URL acompanha a cor escolhida: dá para copiar o link, voltar no
          // botão do navegador e recarregar na cor certa. A variante e o preço
          // continuam vindo do servidor a cada troca.
          try{history.pushState({h:handle},'','/produto/'+encodeURIComponent(handle))}catch(e){}
        }
        montar(d);
      })
      .catch(function(){
        box.innerHTML='<p class="muted" style="padding:40px 0;text-align:center">Erro ao carregar.</p>';
      });
  }
  window.addEventListener('popstate',function(e){
    var h=(e.state&&e.state.h)||location.pathname.split('/').pop();
    if(h)carregar(decodeURIComponent(h),false);
  });

  function montar(d){
    limpar();
    if(ioCta){ioCta.disconnect();ioCta=null}
    sticky.classList.remove('on');

    var p=d.product; learn([p]);
    document.title=p.title+' — ${LOJA.nomeCompleto}';
    var vs=p.variants||[];
    var first=vs.filter(function(v){return v.available})[0]||vs[0]||null;
    var imgs=((p.images&&p.images.length)?p.images:[p.image]).filter(Boolean);
    var giro=d.giro||null;
    var cores=(d.cores&&d.cores.cores)||[];
    var modelo=(d.cores&&d.cores.modelo)||'';

    // migalha
    var tagFim=(p.tags||[])[(p.tags||[]).length-1]||(p.tags||[])[0]||'';
    var cCol=document.getElementById('crumbCol'), cNow=document.getElementById('crumbNow');
    if(cCol&&tagFim){cCol.textContent=tagFim;cCol.href='/colecao/'+slugTag(tagFim)}
    if(cNow)cNow.textContent=p.title;

    var temEstoque=vs.some(function(v){return v.available});
    function codDoHandle(h){var n=0;for(var i=0;i<h.length;i++){n=(n*31+h.charCodeAt(i))>>>0}
      return String(10000000+(n%89999999))}
    var cod=(first&&first.sku)?first.sku:codDoHandle(p.handle);
    var eCalcado=vs.some(function(v){var n=parseInt(v.option,10);return !isNaN(n)&&n>=30&&n<=50});
    var PLUS=['G1','G2','G3'];
    var ehPlus=function(v){return PLUS.indexOf(v.option)>=0};
    var grupos=[['Tamanho adulto',vs.filter(function(v){return !ehPlus(v)})],
                ['Tamanho plus size',vs.filter(ehPlus)]].filter(function(g){return g[1].length});
    function grade(lista){
      return '<div class="sizes">'+lista.map(function(v){
        return '<button class="sz'+(first&&v.id===first.id?' on':'')+'" data-vid="'+esc(v.id)+'"'+
          (v.available?'':' disabled aria-label="'+esc((v.option||'')+' indisponível')+'"')+'>'+
          esc(v.option||'Único')+'</button>'}).join('')+'</div>';
    }
    function precoHtml(v){
      if(!v)return '';
      var temDe=v.compareCents&&v.compareCents>v.priceCents;
      return '<div class="pdp-preco"><b>'+money(v.priceCents)+'</b>'+
        (temDe?'<s>'+money(v.compareCents)+'</s><span class="off">-'+
          Math.round((1-v.priceCents/v.compareCents)*100)+'%</span>':'')+'</div>'+
        '<p class="pdp-pix">à vista no <b>PIX</b>'+
        (temDe?' · você economiza '+money(v.compareCents-v.priceCents):'')+'</p>';
    }
    // A promo é a MESMA do carrinho e do servidor: promoElegivel decide, e os
    // números saem de __CFG.promo. Nada escrito à mão aqui.
    function promoHtml(v){
      if(!v||!promoElegivel({priceCents:v.priceCents,handle:p.handle}))return '';
      var n=PROMO_CFG.minQty||2, unit=PROMO_CFG.eligiblePriceCents||v.priceCents;
      var cheio=unit*n, desc=promoDesconto([{priceCents:unit,qty:n,handle:p.handle}]);
      if(desc<=0)return '';
      return '<div class="pdp-promo">'+SVG_TAG+'<div><b>Leve '+n+' pares por '+money(cheio-desc)+'</b>'+
        '<span>Economize '+money(desc)+' · escolha o 2º par no carrinho</span></div></div>';
    }

    // ---------------- montagem ----------------
    box.innerHTML=
     '<div class="pdp" data-vid="'+esc(first?first.id:'')+'" id="pdpbox">'+
      '<div class="pdp-palco">'+
        '<div class="pdp-stage" id="pdpStage">'+
          '<div class="pdp-trilho" id="pdpTrilho">'+
            (imgs.length?imgs.map(function(s,i){
              return '<div class="pdp-slide"><img '+(i===0?'fetchpriority="high"':'loading="lazy"')+
                ' decoding="async" src="'+esc(s)+'" alt="'+esc(p.title)+'"></div>';
            }).join(''):'<div class="pdp-slide"></div>')+
          '</div>'+
          (giro?'<div class="pdp-giro" id="pdpGiro">'+
            '<img id="giroImg" src="'+esc(giro.primeiro)+'" alt="'+esc(p.title)+' em 360 graus" draggable="false">'+
            '<span class="pdp-giro-dica" id="giroDica">'+SVG_GIRO+'Arraste para girar</span>'+
            '<span class="pdp-giro-barra"><i id="giroBarra"></i></span>'+
          '</div>':'')+
          (imgs.length>1?'<span class="pdp-conta" id="pdpConta">1/'+imgs.length+'</span>':'')+
          (imgs.length?'<button class="pdp-zoom" id="pdpZoom" type="button" aria-label="Ampliar foto">'+SVG_ZOOM+'</button>':'')+
        '</div>'+
        (giro?'<div class="pdp-modos">'+
          '<button class="pdp-modo on" type="button" data-modo="fotos">'+SVG_FOTOS+'Fotos</button>'+
          '<button class="pdp-modo" type="button" data-modo="giro">'+SVG_GIRO+'Girar o tênis</button>'+
        '</div>':'')+
        (imgs.length>1?'<div class="pdp-thumbs" id="pdpThumbs">'+imgs.map(function(s,i){
          return '<button class="pdp-thumb'+(i===0?' on':'')+'" type="button" data-i="'+i+'">'+
            '<img loading="lazy" src="'+esc(s)+'" alt=""></button>';
        }).join('')+'</div>':'')+
      '</div>'+

      '<div class="pdp-info">'+
        (p.vendor?'<p class="pdp-marca">'+esc(p.vendor)+(modelo&&modelo!==p.vendor?' · '+esc(modelo):'')+'</p>':'')+
        '<h1>'+esc(p.title)+'</h1>'+
        '<p class="pdp-meta">Cód. '+esc(cod)+' · '+
          (temEstoque?'<span class="stock">Disponível</span>':'<span class="out">Indisponível no momento</span>')+'</p>'+
        '<div id="pBox">'+precoHtml(first)+'</div>'+
        promoHtml(first)+
        (cores.length>1?'<p class="pdp-lbl">Cor: <span id="corNome">'+
            esc((cores.filter(function(c){return c.atual})[0]||{}).cor||'')+'</span></p>'+
          '<div class="pdp-cores" id="pdpCores"></div>':'')+
        (vs.length>1
          ? '<p class="pdp-lbl"><span style="font-weight:700;color:#0b0a0f">Numeração: <b id="szNow">'+
              esc(first?(first.option||'Único'):'—')+'</b></span>'+
              (eCalcado?'<a id="openMedidas">Tabela de medidas</a>':'')+'</p>'+
            (grupos.length>1
              ? grupos.map(function(g){return '<p class="szgrupo">'+esc(g[0])+'</p>'+grade(g[1])}).join('')
              : grade(vs))
          : '')+
        '<button class="buy"'+(first&&temEstoque?'':' disabled')+'>ADICIONAR AO CARRINHO<i class="sac-ar" aria-hidden="true">→</i></button>'+
        '<div class="pdp-trust">'+
          '<div>'+SVG_TRUCK+'Frete grátis para todo o Brasil</div>'+
          '<div>'+SVG_SHIELD+'Pagamento via PIX · ambiente seguro</div>'+
          '<div>'+SVG_RETURN+'Troca ou devolução sem letra miúda</div>'+
        '</div>'+
        fichaHtml(p,vs,modelo,cores)+
      '</div>'+
     '</div>'+
     (eCalcado?'<div class="pcard desc">'+
        '<h2>Tabela de medidas</h2>'+
        '<div class="medidas">'+
          '<img id="medidasImg" src="'+TABELA_MEDIDAS+'" width="900" height="900" loading="lazy"'+
          ' alt="Tabela de medidas: numeração com comprimento do pé em centímetros">'+
          '<div class="medidas-tx">'+
            '<p>Meça o pé <b>descalço</b>, do calcanhar à ponta do maior dedo, com o pé apoiado no chão.</p>'+
            '<p>Compare com a coluna <b>comprimento do pé</b>. Na dúvida entre duas numerações, escolha a <b>maior</b>.</p>'+
            '<p class="medidas-zoom">Toque na tabela para ampliar.</p>'+
          '</div>'+
        '</div></div>':'');

    ligarGaleria(imgs,p);
    if(giro)ligarGiro(giro,p);
    if(cores.length>1)ligarCores(cores);
    ligarTamanhos(vs,precoHtml,promoHtml);
    ligarSticky(first,temEstoque);
    montarCine(p,imgs,cores,modelo);
    montarFim(p);

    var om=document.getElementById('openMedidas');
    if(om)om.addEventListener('click',function(){verFoto(TABELA_MEDIDAS,'Tabela de medidas')});
    var mi=document.getElementById('medidasImg');
    if(mi)mi.addEventListener('click',function(){verFoto(TABELA_MEDIDAS,'Tabela de medidas')});

    viewContent(first?first.id:'');
    relacionados(d.related||[]);
    refreshCart();
  }

  // ---- ficha: só campos que EXISTEM no catálogo. Nada de "material: couro"
  //      inventado — o catálogo não guarda material, e chutar isso é anúncio
  //      falso na página de um produto que a pessoa vai receber em casa.
  function fichaHtml(p,vs,modelo,cores){
    var nums=vs.map(function(v){return parseInt(v.option,10)}).filter(function(n){return !isNaN(n)});
    var linhas=[];
    if(p.vendor)linhas.push(['Marca',p.vendor]);
    if(modelo&&modelo!==p.vendor)linhas.push(['Modelo',modelo]);
    if(nums.length>1)linhas.push(['Numeração','do '+Math.min.apply(null,nums)+' ao '+Math.max.apply(null,nums)]);
    if(cores.length>1)linhas.push(['Cores deste modelo',cores.length]);
    if(!linhas.length)return '';
    return '<dl class="pdp-ficha">'+linhas.map(function(l){
      return '<div><dt>'+esc(l[0])+'</dt><dd>'+esc(String(l[1]))+'</dd></div>'}).join('')+'</dl>';
  }

  // ================= GALERIA =================
  function ligarGaleria(imgs,p){
    var trilho=document.getElementById('pdpTrilho');
    if(!trilho)return;
    var conta=document.getElementById('pdpConta');
    var thumbs=[].slice.call(document.querySelectorAll('.pdp-thumb'));
    // a foto aparece quando carrega, em vez de piscar meio desenhada
    [].forEach.call(trilho.querySelectorAll('img'),function(im){
      if(im.complete)im.classList.add('veio');
      else im.addEventListener('load',function(){im.classList.add('veio')},{once:true});
    });
    function atual(){return Math.round(trilho.scrollLeft/Math.max(1,trilho.clientWidth))}
    function marcar(){
      var i=atual();
      if(conta)conta.textContent=(i+1)+'/'+imgs.length;
      thumbs.forEach(function(t,k){t.classList.toggle('on',k===i)});
    }
    trilho.addEventListener('scroll',marcar,{passive:true});
    thumbs.forEach(function(t){
      t.addEventListener('click',function(){
        trilho.scrollTo({left:trilho.clientWidth*(+t.dataset.i),behavior:calmo?'auto':'smooth'});
      });
    });
    // Arrastar com o mouse no computador. No celular o dedo já faz isso
    // nativamente — por isso só liga com ponteiro fino.
    if(window.matchMedia&&window.matchMedia('(pointer: fine)').matches){
      var pegando=false,x0=0,s0=0;
      trilho.addEventListener('pointerdown',function(e){
        pegando=true;x0=e.clientX;s0=trilho.scrollLeft;
        trilho.classList.add('arrastando');trilho.setPointerCapture(e.pointerId);
      });
      trilho.addEventListener('pointermove',function(e){
        if(!pegando)return;
        trilho.scrollLeft=s0-(e.clientX-x0);
      });
      var soltar=function(){
        if(!pegando)return;
        pegando=false;trilho.classList.remove('arrastando');
        trilho.scrollTo({left:trilho.clientWidth*atual(),behavior:calmo?'auto':'smooth'});
      };
      trilho.addEventListener('pointerup',soltar);
      trilho.addEventListener('pointercancel',soltar);
    }
    var z=document.getElementById('pdpZoom');
    if(z)z.addEventListener('click',function(){
      var im=trilho.querySelectorAll('img')[atual()];
      if(im)verFoto(im.src,p.title);
    });
    marcar();
  }

  // ================= GIRO =================
  // Sequência de quadros gerada a partir da foto REAL do produto. O primeiro
  // quadro já está na tela; os outros entram em segundo plano quando a pessoa
  // escolhe o modo girar — não faz sentido baixar 24 imagens de quem só quer
  // ver o preço.
  function ligarGiro(giro,p){
    var painel=document.getElementById('pdpGiro');
    var img=document.getElementById('giroImg');
    var dica=document.getElementById('giroDica');
    var barra=document.getElementById('giroBarra');
    var modos=[].slice.call(document.querySelectorAll('.pdp-modo'));
    var n=giro.quadros, urls=[], prontas=[], baixando=false, i=0;
    for(var k=1;k<=n;k++){
      urls.push(giro.base+(k<10?'0':'')+k+'.'+giro.ext);
      prontas.push(false);
    }
    prontas[0]=true;
    function baixar(){
      if(baixando)return; baixando=true;
      var feitas=1;
      urls.forEach(function(u,k){
        if(k===0)return;
        var im=new Image();
        im.onload=im.onerror=function(){
          prontas[k]=true; feitas++;
          if(barra)barra.style.width=Math.round(feitas/n*100)+'%';
          if(feitas>=n&&barra)depois(function(){barra.parentNode.style.opacity='0'},400);
        };
        im.src=u;
      });
    }
    function mostrar(k){
      k=((k%n)+n)%n;
      if(k===i)return;
      i=k;
      // Quadro que ainda não chegou é PULADO em vez de piscar em branco: a
      // pessoa continua vendo o anterior até ele existir.
      if(prontas[i])img.src=urls[i];
    }
    function modo(qual){
      modos.forEach(function(b){b.classList.toggle('on',b.dataset.modo===qual)});
      painel.classList.toggle('on',qual==='giro');
      if(qual==='giro')baixar();
    }
    modos.forEach(function(b){b.addEventListener('click',function(){modo(b.dataset.modo)})});

    var arrastando=false,x0=0,i0=0,mexeu=false;
    painel.addEventListener('pointerdown',function(e){
      arrastando=true;x0=e.clientX;i0=i;mexeu=false;
      painel.setPointerCapture(e.pointerId);
    });
    painel.addEventListener('pointermove',function(e){
      if(!arrastando)return;
      var dx=e.clientX-x0;
      if(Math.abs(dx)>6&&!mexeu){mexeu=true;if(dica)dica.classList.add('some')}
      // a largura do palco inteiro percorre a volta completa
      mostrar(i0+Math.round(dx/(painel.clientWidth/n)));
    });
    var solta=function(){arrastando=false};
    painel.addEventListener('pointerup',solta);
    painel.addEventListener('pointercancel',solta);
    // teclado: o giro também é operável sem mouse
    painel.setAttribute('tabindex','0');
    painel.setAttribute('role','img');
    painel.addEventListener('keydown',function(e){
      if(e.key==='ArrowRight'){mostrar(i+1);e.preventDefault()}
      if(e.key==='ArrowLeft'){mostrar(i-1);e.preventDefault()}
    });
  }

  // ================= CORES =================
  function ligarCores(cores){
    var alvo=document.getElementById('pdpCores');
    if(!alvo)return;
    var LIMITE=11, aberto=false;
    function pintar(){
      var lista=aberto?cores:cores.slice(0,LIMITE);
      alvo.innerHTML=lista.map(function(c){
        return '<button class="pdp-cor'+(c.atual?' on':'')+'" type="button" data-h="'+esc(c.handle)+'"'+
          ' title="'+esc(c.cor)+'"><img loading="lazy" src="'+esc(c.thumb)+'" alt="'+esc(c.cor)+'">'+
          '<i>'+esc(c.cor)+'</i></button>';
      }).join('')+
      (!aberto&&cores.length>LIMITE
        ? '<button class="pdp-cores-mais" type="button" id="maisCores">Ver as '+cores.length+' cores</button>'
        : '');
      var m=document.getElementById('maisCores');
      if(m)m.addEventListener('click',function(){aberto=true;pintar()});
    }
    pintar();
    alvo.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('.pdp-cor');
      if(!b||b.classList.contains('on'))return;
      // A troca de cor é uma troca de PRODUTO: variante, preço, numerações,
      // SKU e estoque vêm todos do servidor de novo. Nada é adivinhado aqui.
      var palco=document.getElementById('pdpStage');
      if(palco&&!calmo){palco.style.transition='opacity 160ms ease';palco.style.opacity='.35'}
      carregar(b.dataset.h,true);
    });
  }

  // ================= NUMERAÇÃO =================
  function ligarTamanhos(vs,precoHtml,promoHtml){
    var pdpbox=document.getElementById('pdpbox');
    if(!pdpbox)return;
    pdpbox.addEventListener('click',function(e){
      var sz=e.target.closest&&e.target.closest('.sz');
      if(!sz||sz.disabled)return;
      var v=vs.filter(function(x){return x.id===sz.dataset.vid})[0];
      if(!v)return;
      pdpbox.querySelectorAll('.sz').forEach(function(x){
        x.classList.toggle('on',x===sz);
        if(x!==sz)x.classList.remove('toque');
      });
      if(!calmo){sz.classList.remove('toque');void sz.offsetWidth;sz.classList.add('toque')}
      document.getElementById('pBox').innerHTML=precoHtml(v);
      var lb=document.getElementById('szNow');
      if(lb)lb.textContent=v.option||'Único';
      var sb=sticky.querySelector('b');
      if(sb)sb.textContent=money(v.priceCents);
    });
  }

  // ================= BARRA FIXA DO CELULAR =================
  function ligarSticky(first,temEstoque){
    var cta=document.querySelector('.pdp-info .buy');
    if(!cta||!first){sticky.classList.remove('on');return}
    sticky.innerHTML='<div class="v"><b>'+money(first.priceCents)+'</b><span>à vista no PIX</span></div>'+
      '<button type="button"'+(temEstoque?'':' disabled')+'>ADICIONAR</button>';
    // O botão da barra NÃO tem lógica própria: ele clica no CTA de verdade, e
    // quem adiciona ao carrinho continua sendo o handler único do SHOP_JS.
    // Dois caminhos para a mesma compra é como um deles fica para trás.
    sticky.querySelector('button').addEventListener('click',function(){cta.click()});
    if(!('IntersectionObserver' in window))return;
    // Duas condições, e as duas importam: o CTA de verdade está fora da tela E
    // a pessoa já rolou. Só a primeira faria a barra nascer por cima da
    // primeira dobra — no celular a foto do produto é alta e o botão original
    // começa muito abaixo, então ele "está fora da tela" desde o carregamento.
    // A decisão mede o retângulo na hora, e NÃO confia só no que o observer
    // disse da última vez. Motivo: no primeiro paint as fotos ainda não
    // chegaram, a página é curta e o CTA está dentro da tela — o observer
    // registra "visível" e depois NÃO dispara de novo quando as imagens
    // carregam e empurram o botão para baixo. A barra ficava escondida a
    // página inteira. O observer continua, como gatilho barato; a conta certa
    // é a de baixo.
    function decidir(){
      var b=cta.getBoundingClientRect();
      var fora=b.bottom<=0||b.top>=window.innerHeight;
      sticky.classList.toggle('on', fora && window.scrollY>240);
    }
    ioCta=new IntersectionObserver(decidir,{threshold:0});
    ioCta.observe(cta);
    window.addEventListener('resize',decidir);
    // as fotos mudam a altura da página quando chegam
    box.querySelectorAll('img').forEach(function(im){
      if(!im.complete)im.addEventListener('load',decidir,{once:true});
    });
    // Limitador por TEMPO, e não por requestAnimationFrame: o rAF é suspenso
    // em aba de segundo plano, e aí a barra ficava presa no último estado que
    // o observer tinha visto. Medir um retângulo a cada 16ms não pesa.
    var ultimo=0;
    window.addEventListener('scroll',function(){
      var agora=Date.now();
      if(agora-ultimo<16)return;
      ultimo=agora; decidir();
    },{passive:true});
  }

  // ================= SEÇÃO CINEMATOGRÁFICA =================
  // Só texto que o catálogo sustenta: marca, modelo, quantas cores existem e a
  // faixa real de numeração. Nada de "solado em borracha vulcanizada" — isso
  // não está em lugar nenhum dos dados e seria invenção.
  function montarCine(p,imgs,cores,modelo){
    var velho=document.getElementById('pdpCine');
    if(velho)velho.remove();
    if(imgs.length<2)return;
    var vs=p.variants||[];
    var nums=vs.map(function(v){return parseInt(v.option,10)}).filter(function(n){return !isNaN(n)});
    var blocos=[];
    blocos.push({n:'01',h:esc(p.title),
      p:'O '+esc(modelo||p.title)+(p.vendor?' da <b>'+esc(p.vendor)+'</b>':'')+
        ', fotografado de todos os ângulos que temos dele.'});
    if(cores.length>1)blocos.push({n:'02',h:cores.length+' cores',
      p:'Este modelo existe em <b>'+cores.length+' colorways</b> na loja. Dá para trocar de cor aqui mesmo, sem voltar ao catálogo.'});
    if(nums.length>1)blocos.push({n:cores.length>1?'03':'02',h:'Do '+Math.min.apply(null,nums)+' ao '+Math.max.apply(null,nums),
      p:'Numeração conferida contra o estoque: o que está apagado é o que <b>não tem</b>. A tabela de medidas fica logo acima.'});
    blocos.push({n:String(blocos.length+1).padStart(2,'0'),h:'Chega em casa',
      p:'Pagamento via <b>PIX</b>, frete grátis para todo o Brasil e troca sem letra miúda.'});

    var sec=document.createElement('section');
    sec.className='pdp-cine'; sec.id='pdpCine';
    sec.innerHTML='<div class="pdp-cine-in">'+
      '<div class="pdp-cine-img"><img id="cineImg" loading="lazy" decoding="async" src="'+esc(imgs[0])+'" alt="'+esc(p.title)+'"></div>'+
      '<div class="pdp-cine-tx">'+blocos.map(function(b,i){
        return '<article class="pdp-cine-bloco" data-i="'+(i%imgs.length)+'">'+
          '<span class="n">'+b.n+'</span><h3>'+b.h+'</h3><p>'+b.p+'</p></article>';
      }).join('')+'</div></div>';
    (relBox.parentNode).insertBefore(sec,relBox);

    var cineImg=document.getElementById('cineImg');
    if(!('IntersectionObserver' in window))return;
    var atual=-1;
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(!e.isIntersecting)return;
        var k=+e.target.dataset.i;
        if(k===atual)return;
        atual=k;
        var nova=imgs[k];
        if(calmo){cineImg.src=nova;return}
        // pré-carrega antes de animar: trocar o src no meio da transição
        // terminaria o movimento num retângulo vazio.
        var pre=new Image();
        pre.onload=pre.onerror=function(){
          cineImg.classList.add('trocando');
          depois(function(){
            cineImg.src=nova;
            requestAnimationFrame(function(){requestAnimationFrame(function(){
              cineImg.classList.remove('trocando');
            })});
          },180);
        };
        pre.src=nova;
      });
    },{threshold:.5});
    sec.querySelectorAll('.pdp-cine-bloco').forEach(function(b){io.observe(b)});
  }

  // ================= CTA FINAL =================
  function montarFim(p){
    var velho=document.getElementById('pdpFim');
    if(velho)velho.remove();
    var sec=document.createElement('section');
    sec.className='pdp-fim'; sec.id='pdpFim';
    sec.innerHTML='<h3>Leva esse par?</h3>'+
      '<p>Escolha a numeração acima e adicione ao carrinho.</p>'+
      '<button class="buy" type="button" id="pdpFimCta">ESCOLHER NUMERAÇÃO<i class="sac-ar" aria-hidden="true">→</i></button>';
    (relBox.parentNode).insertBefore(sec,relBox);
    document.getElementById('pdpFimCta').addEventListener('click',function(){
      var alvo=document.querySelector('.pdp-info .sizes')||document.querySelector('.pdp-info');
      if(alvo)alvo.scrollIntoView({behavior:calmo?'auto':'smooth',block:'center'});
    });
  }

  function relacionados(lista){
    if(!lista.length){relBox.innerHTML='';return}
    learn(lista);
    relBox.innerHTML='<section class="feat"><div class="feat-hd"><h2>Você também pode gostar</h2></div>'+
      '<div class="rowwrap"><div class="row">'+lista.map(cardHtml).join('')+'</div>'+
      setasHtml()+'</div></section>';
    relBox.querySelectorAll('.rowwrap').forEach(ligarSetas);
    observeCards(relBox);
  }

  carregar(window.__HANDLE,false);
})();`;

// ---------------------------------------------------------- JS da coleção
const COLLECTION_JS = `${SHOP_JS}
(async function(){
  var grid=document.getElementById('grid'), more=document.getElementById('more');
  var titleEl=document.getElementById('ctitle'), subEl=document.getElementById('csub');
  var crumb=document.getElementById('crumbNow'), sortEl=document.getElementById('sort');
  var handle=window.__HANDLE, offset=0, total=0, LIMIT=24, sort='destaque';
  skel(grid,8);

  // menu do drawer + coluna lateral saem do mesmo /api/menu
  fetch('/api/menu').then(function(r){return r.json()}).then(function(d){
    renderMenu(d.menu||[]); renderSide(d.menu||[]);
  }).catch(function(){});

  function renderSide(menu){
    var box=document.getElementById('sidenav'); if(!box)return;
    box.innerHTML=menu.map(function(m){
      var aberto=false;
      var kids=(m.children||[]).map(function(c){
        var atual=c.handle===handle; if(atual)aberto=true;
        var netos=(c.children||[]).map(function(g){
          var a2=g.handle===handle; if(a2)aberto=true;
          return '<a class="'+(a2?'cur':'')+'" href="/colecao/'+esc(g.handle)+'" style="padding-left:38px">'+
            esc(g.title)+'<span class="c">'+g.count+'</span></a>';
        }).join('');
        return '<a class="'+(atual?'cur':'')+'" href="/colecao/'+esc(c.handle)+'">'+esc(c.title)+
          '<span class="c">'+c.count+'</span></a>'+netos;
      }).join('');
      if(m.handle===handle)aberto=true;
      return '<div class="snv'+(aberto?' open':'')+'">'+
        '<a class="'+(m.handle===handle?'cur':'')+'" href="/colecao/'+esc(m.handle)+'">'+esc(m.title)+
        (kids?'<span class="car">'+SVG_CARET+'</span>':'')+'</a>'+
        (kids?'<div class="ssub">'+kids+'</div>':'')+'</div>';
    }).join('');
    // o chevron abre/fecha; o resto do link continua navegando
    box.querySelectorAll('.car').forEach(function(c){
      c.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        c.closest('.snv').classList.toggle('open');
      });
    });
  }

  function contagem(){
    if(!total)return '';
    return 'Mostrando <b>1 - '+Math.min(offset,total)+'</b> de '+total+' produto'+(total===1?'':'s');
  }

  async function page(first){
    var d;
    try{d=await (await fetch('/api/colecao/'+encodeURIComponent(handle)+'?offset='+offset+'&limit='+LIMIT+'&sort='+sort)).json()}
    catch(e){if(first)grid.innerHTML='<p class="muted">Erro ao carregar.</p>';return}
    if(d.error){titleEl.textContent='Coleção não encontrada';grid.innerHTML='';subEl.textContent='';return}
    total=d.total;
    titleEl.textContent=d.title;
    document.title=d.title+' — ${LOJA.nomeCompleto}';
    if(crumb)crumb.textContent=d.title;
    var ps=d.products||[];
    learn(ps);
    var html=ps.map(cardHtml).join('');
    if(first)grid.innerHTML=html; else grid.insertAdjacentHTML('beforeend',html);
    observeCards(grid);
    offset+=ps.length;
    subEl.innerHTML=contagem();
    more.style.display=offset<total?'inline-flex':'none';
    more.textContent='Ver mais ('+(total-offset)+' restantes)';
  }
  more.addEventListener('click',function(){more.disabled=true;page(false).then(function(){more.disabled=false})});

  if(sortEl)sortEl.addEventListener('change',function(){
    sort=sortEl.value;offset=0;skel(grid,8);page(true);
  });
  var vg=document.getElementById('viewGrid'), vl=document.getElementById('viewList');
  function view(lista){
    grid.classList.toggle('list',lista);
    if(vg)vg.classList.toggle('on',!lista);
    if(vl)vl.classList.toggle('on',lista);
    try{localStorage.setItem('view',lista?'list':'grid')}catch(e){}
  }
  if(vg)vg.addEventListener('click',function(){view(false)});
  if(vl)vl.addEventListener('click',function(){view(true)});
  try{if(localStorage.getItem('view')==='list')view(true)}catch(e){}

  await page(true);
  refreshCart();
})();`;

// ------------------------------------------------------------- JS do carrinho
const CART_JS = `${SHOP_JS}
(function(){
  var CFG=window.__CFG, P=CFG.promo||{}, cart=getCart(), items=[];
  var root=document.getElementById('cartRoot');
  var SVG_LOCK=${JSON.stringify(svgLock())};
  var SVG_PIXMARK=${JSON.stringify(svgPix())};

  fetch('/api/menu').then(function(r){return r.json()}).then(function(d){renderMenu(d.menu||[])}).catch(function(){});

  // A conta mora em promoDesconto (bloco CART), junto com o carrinho lateral:
  // era cópia literal daqui, e cópia literal é o que divergiu na primeira
  // correção em todo lugar que isso foi tentado. Uma conta, três telas.
  function discountCents(){return promoDesconto(items)}
  function subtotal(){return items.reduce(function(s,it){return s+it.priceCents*it.qty},0)}
  // Economia do "de/por": só onde existe preço cheio MAIOR que o de venda.
  function economiaDe(){return items.reduce(function(s,it){
    return s+((it.compareCents&&it.compareCents>it.priceCents)?(it.compareCents-it.priceCents)*it.qty:0)},0)}
  // Quantos pares faltam pro desconto de 2 pares. Só avisa quem já tem um par
  // elegível no carrinho — senão vira propaganda no carrinho de quem levou outra coisa.
  function faltamPromo(){
    if(!P.eligiblePriceCents||!P.minQty)return 0;
    var q=0;
    items.forEach(function(it){if(promoElegivel(it))q+=it.qty});
    return (q>0&&q<P.minQty)?(P.minQty-q):0;
  }

  function linha(it,i){
    var de=(it.compareCents&&it.compareCents>it.priceCents)?'<s>'+money(it.compareCents)+'</s>':'';
    var href=it.handle?'/produto/'+encodeURIComponent(it.handle):'';
    var img='<img loading="lazy" src="'+esc(it.image||'')+'" alt="'+esc(it.title)+'">';
    var nome='<span class="nm">'+esc(it.title)+'</span>';
    return '<div class="cline">'+
      '<div class="cprod">'+
        (href?'<a href="'+href+'">'+img+'</a>':img)+
        '<div>'+(href?'<a class="nm" href="'+href+'">'+esc(it.title)+'</a>':nome)+
          '<div class="pr"><b>'+money(it.priceCents)+'</b>'+de+'</div></div>'+
      '</div>'+
      '<div class="cfoot">'+
        '<div class="cqty"><span class="cstep">'+
          '<button type="button" data-d="-1" data-i="'+i+'" aria-label="Diminuir"'+(it.qty<=1?' disabled':'')+'>−</button>'+
          '<span>'+it.qty+'</span>'+
          '<button type="button" data-d="1" data-i="'+i+'" aria-label="Aumentar"'+(it.qty>=20?' disabled':'')+'>+</button>'+
        '</span>'+
        '<button type="button" class="crm" data-rm="'+i+'">Remover</button></div>'+
        '<div class="cltot">'+money(it.priceCents*it.qty)+'</div>'+
      '</div>'+
    '</div>';
  }

  function resumo(){
    var sub=subtotal(), desc=discountCents(), total=Math.max(0,sub-desc);
    var economia=economiaDe()+desc, faltam=faltamPromo();
    return '<div class="csum">'+
      '<div class="csum-row big"><span>Total</span><b>'+money(total)+'</b></div>'+
      (economia>0?'<p class="csave">Você economizou '+money(economia)+'!</p>':'')+
      (desc>0?'<div class="csum-row"><span class="desc">'+esc(P.label||'Desconto')+'</span>'+
        '<span class="desc">- '+money(desc)+'</span></div>':'')+
      '<span class="cbadge">PAGAMENTO VIA PIX</span>'+
      (faltam>0?'<p class="cnudge">Leve mais '+faltam+' par'+(faltam>1?'es':'')+' e o desconto '+
        esc(P.label||'')+' entra no checkout.</p>':'')+
      '<hr>'+
      '<div class="csum-row"><span>Frete</span><span>escolhido no checkout</span></div>'+
      '<a class="cbtn cbtn--go" href="/checkout">FINALIZAR COMPRA</a>'+
      '<a class="cbtn cbtn--back" href="/">CONTINUAR COMPRANDO</a>'+
      '<div class="csafe">'+SVG_LOCK+'<span>Pagamento Seguro</span></div>'+
      '<div class="cpix">'+SVG_PIXMARK+'</div>'+
    '</div>';
  }

  function render(){
    if(!items.length){
      root.innerHTML='<div class="cempty"><p>Seu carrinho está vazio.</p>'+
        '<a class="cbtn cbtn--back" href="/">CONTINUAR COMPRANDO</a></div>';
      return;
    }
    root.innerHTML='<div class="cartgrid"><div class="citems">'+
      '<div class="chead"><span>Produto</span><span class="q">Quantidade</span><span class="t">Total</span></div>'+
      items.map(linha).join('')+'</div>'+resumo()+'</div>';
  }

  root.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');
    if(!b||b.disabled)return;
    if(b.dataset.rm!=null){
      var rm=items[+b.dataset.rm]; if(!rm)return;
      delete cart[rm.variantId]; items.splice(+b.dataset.rm,1);
    } else if(b.dataset.d!=null&&b.dataset.i!=null){
      var it=items[+b.dataset.i]; if(!it)return;
      it.qty=Math.max(1,Math.min(20,it.qty+(+b.dataset.d)));
      cart[it.variantId]=it.qty;
    } else return;
    setCart(cart); refreshCart(); render();
  });

  async function carregar(){
    refreshCart();
    cart=getCart();
    var ids=Object.keys(cart);
    if(!ids.length){items=[];render();return}
    var d;
    try{d=await (await fetch('/api/variants?ids='+ids.map(encodeURIComponent).join(','))).json()}
    catch(e){
      root.innerHTML='<div class="cempty"><p>Não foi possível carregar o carrinho. Recarregue a página.</p>'+
        '<a class="cbtn cbtn--back" href="/">CONTINUAR COMPRANDO</a></div>';
      return;
    }
    items=(d.variants||[]).filter(function(v){return cart[v.id]!=null}).map(function(v){
      return {variantId:v.id,qty:cart[v.id]||1,priceCents:v.priceCents,compareCents:v.compareCents||0,
        title:v.title,image:v.image,handle:v.handle||''};
    });
    // Variante que saiu do catálogo não pode ficar presa no localStorage: ela
    // some da tela mas continuaria contando no ícone do topo e no checkout.
    var vivos={};
    items.forEach(function(it){vivos[it.variantId]=it.qty});
    cart=vivos; setCart(cart); refreshCart();
    render();
  }
  carregar();
  // O carrinho lateral escreve no MESMO localStorage: quando ele mexe (tira um
  // par, fecha o combo, troca o 2º), esta página recarrega os itens em vez de
  // seguir mostrando o estado antigo.
  document.addEventListener('sacola:mudou',function(e){
    if(e&&e.detail&&e.detail.de==='drawer')carregar();
  });
})();`;

const CHECKOUT_JS = `${MONEY}${CART}
// Cronômetro da oferta. Fora do bloco principal porque não depende do carrinho
// e não pode derrubar o checkout se algo aqui falhar.
// A checagem de document.body é o que impede um setInterval solto de segurar o
// processo aberto quando este script roda num DOM falso (teste, pré-render).
(function(){
  var el=document.body&&document.getElementById('ckClock'); if(!el)return;
  var min=parseInt(el.getAttribute('data-min'),10)||15, CHAVE='ck_oferta_ate', ate=0;
  // O prazo mora na sessão: sem isso o relógio voltaria ao começo a cada
  // recarga, e a mesma pessoa veria o tempo "acabando" várias vezes na
  // mesma visita.
  try{ate=parseInt(sessionStorage.getItem(CHAVE),10)||0}catch(e){}
  if(!ate||ate<Date.now()){ate=Date.now()+min*60000;try{sessionStorage.setItem(CHAVE,String(ate))}catch(e){}}
  function dois(n){return n<10?'0'+n:''+n}
  var t=setInterval(passo,1000);
  function passo(){
    var s=Math.max(0,Math.round((ate-Date.now())/1000));
    el.textContent=dois(Math.floor(s/3600))+' : '+dois(Math.floor(s/60)%60)+' : '+dois(s%60);
    if(s<=0)clearInterval(t);
  }
  passo();
})();
(function(){
  var CFG=window.__CFG, P=CFG.promo, SH=CFG.shipping, cart=getCart(), gravs=getGravs(), items=[], icFired=false, shipId=null;

  // Gravacao personalizada. Guardada ao lado do carrinho, e nao dentro dele,
  // para o carrinho seguir sendo {variante:quantidade} — preco, promo e frete
  // continuam contando exatamente como antes.
  function getGravs(){try{var a=JSON.parse(localStorage.getItem('gravs')||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
  function setGravs(a){try{localStorage.setItem('gravs',JSON.stringify(a))}catch(e){}}
  function limpaGrav(v){return String(v==null?'':v).replace(/[^-A-Za-zÀ-ɏ0-9 .,'&!?#+]/g,'').trim().slice(0,40)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function gravsDe(vid){return gravs.filter(function(g){return String(g.v)===String(vid)})}
  function gravUnidades(vid){return gravsDe(vid).reduce(function(s,g){return s+g.q},0)}

  // Quantidade so cai depois que a gravacao correspondente sai: manter uma
  // gravacao sem faca embaixo dela e o jeito de mandar gravar item que o
  // cliente nao comprou.
  function ajustaGravs(vid,qtd){
    var sobra=gravUnidades(vid)-qtd;
    while(sobra>0){
      var i=-1;
      for(var k=gravs.length-1;k>=0;k--){if(String(gravs[k].v)===String(vid)){i=k;break}}
      if(i<0)break;
      var tira=Math.min(sobra,gravs[i].q);
      gravs[i].q-=tira;sobra-=tira;
      if(gravs[i].q<=0)gravs.splice(i,1);
    }
    setGravs(gravs);
  }
  // bumps: lista de ofertas; bumpVars mapeia variantId -> variante do catálogo
  // (preço cheio e foto), preenchida junto com os itens do carrinho.
  // bumpEscolha guarda, por bump, QUAL variante foi escolhida — o bump da
  // calça tem grade P/M/G/GG. A chave continua sendo o variantId configurado
  // (o "slot"), e não o escolhido: assim marcar a oferta e trocar o tamanho
  // são coisas separadas, e trocar de tamanho não desmarca o checkbox.
  var bumps=CFG.bumps||[], bumpOn={}, bumpVars={}, bumpOpc={}, bumpEscolha={}, bumpAtcFired={};
  function bumpVarEscolhida(b){
    var id=bumpEscolha[b.variantId]||b.variantId;
    return bumpOpc[b.variantId+"|"+id]||bumpVars[b.variantId];
  }

  var qp=new URLSearchParams(location.search).get('items');
  var qg=new URLSearchParams(location.search).get('grav');
  if(qp!==null||qg){
    cart={};gravs=[];
    if(qp)qp.split(',').forEach(function(pair){var a=pair.split(':');if(a[0])cart[a[0]]=parseInt(a[1]||'1',10)||1});
    // Gravacao vem em parametro proprio porque 'items' so carrega
    // variante:quantidade. Cada linha gravada e uma linha a parte: duas facas
    // da mesma variante com nomes diferentes nao podem virar uma so.
    if(qg){try{
      JSON.parse(qg).forEach(function(g){
        var v=String(g.v||''),q=Math.max(1,Math.min(20,parseInt(g.q,10)||1)),t=limpaGrav(g.t);
        if(!v||!t)return;
        gravs.push({v:v,q:q,t:t,e:limpaGrav(g.e)});
        cart[v]=(cart[v]||0)+q;
      });
    }catch(e){}}
    setCart(cart);setGravs(gravs);
  }

  function getCookie(n){var m=document.cookie.match('(^|;)\\\\s*'+n+'\\\\s*=\\\\s*([^;]+)');return m?m.pop():''}
  // A UTMify guarda os utm_* no localStorage quando a pessoa chega pelo anúncio;
  // aqui eles voltam para o servidor junto do pedido, que é como a venda chega
  // no painel com a campanha certa. A URL entra como reserva se o script dela
  // ainda não tiver rodado (ou tiver sido bloqueado por um adblock).
  function trackingAtual(){
    var q=new URLSearchParams(location.search), o={};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','src','sck'].forEach(function(k){
      var v='';try{v=localStorage.getItem(k)||''}catch(e){}
      o[k]=v||q.get(k)||'';
    });
    return o;
  }
  function discountCents(){var q=0,c=0;items.forEach(function(it){if(promoElegivel(it)){q+=it.qty;c+=it.priceCents*it.qty}});return (q<P.minQty||c<=0)?0:Math.round(c*P.num/P.den)}
  function subtotal(){return items.reduce(function(s,it){return s+it.priceCents*it.qty},0)}

  // Ofertas marcadas E resolvidas no catálogo — a lista que soma no resumo,
  // aparece nos itens e vai no pedido. Sem a variante não dá pra mostrar o
  // "de", então o bump nem entra.
  function bumpsAceitos(){
    return bumps.filter(function(b){return bumpOn[b.variantId]&&bumpVars[b.variantId]});
  }

  function render(){
    var bumpCents=bumpsAceitos().reduce(function(s,b){return s+b.priceCents},0);
    var sub=subtotal()+bumpCents, disc=discountCents(), afterDisc=Math.max(0,sub-disc);
    var avail=SH.options;
    if(shipId && !avail.some(function(o){return o.id===shipId})) shipId=null;
    var opt=avail.filter(function(o){return o.id===shipId})[0];
    var ship=opt?opt.cents:0, total=afterDisc+ship;
    var count=items.reduce(function(s,i){return s+i.qty},0);

    document.getElementById('cartCount').textContent=count;
    document.getElementById('sTotal').textContent=money(total);
    // barra do resumo recolhivel: so existe no layout 'recolhivel'
    var mini=document.getElementById('sTotalMini');
    if(mini)mini.textContent=money(total);
    document.getElementById('sSub').textContent=money(sub);
    document.getElementById('sShip').textContent = opt ? (ship?money(ship):'Grátis') : 'A calcular';
    var dl=document.getElementById('sDiscLine');
    if(disc>0){dl.style.display='flex';document.getElementById('sDiscLbl').textContent=P.label;document.getElementById('sDisc').textContent='- '+money(disc)}
    else dl.style.display='none';

    renderShipping(avail);

    // Itens. O preço da linha sai da MESMA conta do subtotal (priceCents * qty):
    // mostrar preço cheio aqui e promocional no total deixa as duas contas
    // visivelmente diferentes na mesma tela.
    document.getElementById('items').innerHTML=items.map(function(it,idx){
      var gs=gravsDe(it.variantId);
      var semGrav=it.qty-gravUnidades(it.variantId);
      var linhasGrav=gs.map(function(g){
        return '<div class="ck-grav">'+
          '<span class="ck-grav-tag">Gravação</span>'+
          '<span class="ck-grav-txt">'+esc(g.t)+'</span>'+
          (g.e?'<span class="ck-grav-est">'+esc(g.e)+'</span>':'')+
          (g.q>1?'<span class="ck-grav-qtd">x'+g.q+'</span>':'')+
        '</div>';
      }).join('');
      // Unidade a mais que a gravacao nao cobre e dita em voz alta: descobrir
      // no recebimento que uma das facas veio lisa e pior do que ler aqui.
      if(gs.length&&semGrav>0)
        linhasGrav+='<div class="ck-grav ck-grav--sem">'+semGrav+
          (semGrav>1?' unidades sem gravação':' unidade sem gravação')+'</div>';

      return '<div class="ck-it"><img src="'+(it.image||'')+'" alt="">'+
        '<div style="flex:1;min-width:0"><div class="nm">'+it.title+'</div>'+
        linhasGrav+
        '<div class="bt"><span class="ck-qty">'+
        '<button type="button" class="menos" data-d="-1" data-i="'+idx+'" aria-label="Diminuir"><i></i></button>'+
        '<span>'+it.qty+'</span>'+
        '<button type="button" class="mais" data-d="1" data-i="'+idx+'" aria-label="Aumentar"><i></i><i></i></button>'+
        '</span><span class="pr">'+money(it.priceCents*it.qty)+'</span></div></div></div>';
    }).join('')+bumpsAceitos().map(function(b){
      var ve=bumpVarEscolhida(b);
      var tam=(ve&&ve.option&&(bumpVars[b.variantId].opcoes||[]).length>1)
        ? ' — '+String(ve.option).replace(/[^A-Za-z0-9 .-]/g,'') : '';
      return '<div class="ck-it"><img src="'+(b.image||bumpVars[b.variantId].image||'')+'" alt="">'+
      '<div style="flex:1;min-width:0"><div class="nm">'+b.title+tam+'</div>'+
      '<div class="bt"><span class="tag">Oferta adicional</span>'+
      '<span class="pr">'+money(b.priceCents)+'</span></div></div></div>';
    }).join('');
    document.querySelectorAll('.ck-qty button').forEach(function(b){
      b.addEventListener('click',function(){
        var i=+b.dataset.i, d=+b.dataset.d, it=items[i];
        it.qty=Math.max(1,Math.min(20,it.qty+d));
        cart[it.variantId]=it.qty; setCart(cart); ajustaGravs(it.variantId,it.qty); render();
      });
    });
    renderBump();
    maybeIC(total);
  }

  function renderBump(){
    var box=document.getElementById('bumpBox'); if(!box)return;
    // Só entra oferta que existe no catálogo: variação apagada some do
    // checkout em vez de virar um card sem preço.
    var vis=bumps.filter(function(b){return bumpVars[b.variantId]});
    if(!vis.length){box.style.display='none';return;}
    box.style.display='';
    box.innerHTML=vis.map(function(b){
      var v=bumpVars[b.variantId], img=b.image||v.image||'';
      var oldP=v.priceCents, newP=b.priceCents;
      // Sem esc(): ele é do bundle da LOJA e não existe nesta página — usar
      // aqui lança ReferenceError dentro do map e o bump some sem erro visível.
      // Não faz falta: o variantId sai saneado do servidor para
      // [A-Za-z0-9:_-] (customization.js), então não tem aspa nem tag.
      var ops=(v.opcoes||[]);
      // Só tamanho A-Z, 0-9, ponto e traço. Pelo mesmo motivo do comentário
      // acima (não existe esc() nesta página), e aqui o valor vem do CSV do
      // catálogo, que é conteúdo nosso mas não é HTML.
      var limpo=function(t){return String(t||'').replace(/[^A-Za-z0-9 .-]/g,'')};
      var sel='';
      if(ops.length>1){
        var atual=bumpEscolha[b.variantId]||b.variantId;
        sel='<select class="ck-bump-sz" data-bump-op="'+b.variantId+'" aria-label="Tamanho">'+
          ops.map(function(o){
            return '<option value="'+o.id+'"'+(String(o.id)===String(atual)?' selected':'')+'>'+limpo(o.option)+'</option>';
          }).join('')+'</select>';
      }
      return '<label class="ck-bump-head'+(bumpOn[b.variantId]?' on':'')+'"><input type="checkbox" data-bump="'+b.variantId+'"'+(bumpOn[b.variantId]?' checked':'')+'>'+
        (img?'<img src="'+img+'" alt="">':'')+
        '<div><div class="ck-bump-t">'+b.title+'</div>'+
        (b.description?'<div class="ck-bump-d">'+b.description+'</div>':'')+
        '<div class="ck-bump-pr">'+((oldP>newP)?'<span class="old">'+money(oldP)+'</span>':'')+'<span class="new">'+money(newP)+'</span>'+sel+'</div>'+
        '</div></label>';
    }).join('');
    box.querySelectorAll('select[data-bump-op]').forEach(function(sl){
      sl.addEventListener('click',function(e){e.preventDefault();e.stopPropagation()});
      sl.addEventListener('change',function(e){
        e.stopPropagation();
        bumpEscolha[this.dataset.bumpOp]=this.value;
        render();
      });
    });
    box.querySelectorAll('input[data-bump]').forEach(function(chk){
      chk.addEventListener('change',function(){
        var id=this.dataset.bump, b=bumps.filter(function(x){return x.variantId===id})[0];
        bumpOn[id]=this.checked;
        // AddToCart do bump: só ao aceitar, e uma vez por oferta (não repete
        // se marcar/desmarcar).
        if(this.checked&&b&&!bumpAtcFired[id]&&window.fbq){
          bumpAtcFired[id]=true;
          fbq('track','AddToCart',{content_type:'product',content_ids:[String(id)],
            contents:[{id:String(id),quantity:1}],content_name:b.title||'',
            value:(b.priceCents||0)/100,currency:CFG.currency});
        }
        render();
      });
    });
  }

  function renderShipping(avail){
    var box=document.getElementById('shipopts'); if(!box)return;
    box.innerHTML=avail.map(function(o){
      var sel=o.id===shipId;
      return '<label class="ck-opt'+(sel?' sel':'')+'"><input type="radio" name="ship" value="'+o.id+'"'+(sel?' checked':'')+'>'+
        '<span><span class="n">'+o.name+'</span><br><span class="e">'+o.eta+'</span></span>'+
        '<span class="p'+(o.cents?'':' free')+'">'+(o.cents?money(o.cents):'Grátis')+'</span></label>';
    }).join('');
    box.querySelectorAll('input[name=ship]').forEach(function(r){
      r.addEventListener('change',function(){shipId=this.value;limpa('fship');render()});
    });
  }

  function maybeIC(valueCents){
    if(icFired||!items.length||!window.fbq)return;icFired=true;
    fbq('track','InitiateCheckout',{value:valueCents/100,currency:CFG.currency,
      content_type:'product',content_ids:items.map(function(i){return i.variantId}),
      contents:items.map(function(i){return {id:i.variantId,quantity:i.qty}}),
      num_items:items.reduce(function(s,i){return s+i.qty},0)});
  }

  function val(id){var e=document.getElementById(id);return e?(e.value||'').trim():''}
  function onlyD(v){return v.replace(/\\D/g,'')}

  // ------------------------------------------------------------------ validação
  // FONTE DA VERDADE é o servidor: src/checkout/documento.js (CPF/CNPJ) e
  // src/checkout/orders.js (telefone), chamados no POST /api/orders. As contas
  // abaixo são a MESMA regra repetida aqui só para avisar a pessoa antes de
  // enviar. Mudou lá, muda aqui.
  //
  // Sem conferir os dígitos verificadores, um CPF digitado errado atravessa a
  // tela inteira e só quebra na hora de gerar a cobrança, com um erro genérico
  // que não diz qual campo está errado: venda perdida sem ninguém saber o motivo.

  // Tira o DDI antes de qualquer coisa. Quem cola do WhatsApp manda
  // "+55 47 99722-9918"; sem isto o 55 virava DDD e os dois últimos dígitos
  // caíam no corte de 11 — e o número errado passava batido, porque o
  // resultado continuava tendo 11 dígitos.
  function telDigitos(v){var d=onlyD(v);if(d.length>11&&d.slice(0,2)==='55')d=d.slice(2);return d.slice(0,11)}
  function telOk(v){
    var d=telDigitos(v);
    if(d.length!==10&&d.length!==11)return false;
    if(Number(d.slice(0,2))<11)return false;                 // não existe DDD abaixo de 11
    if(d.length===11&&d.charAt(2)!=='9')return false;         // celular sempre começa com 9
    if(d.length===10&&'2345'.indexOf(d.charAt(2))<0)return false; // fixo começa entre 2 e 5
    return true;
  }
  function cpfValido(v){
    var d=onlyD(v);
    if(d.length!==11)return false;
    // Sequências repetidas fecham a conta do módulo 11, mas a Receita não emite
    // nenhuma delas — 111.111.111-11 e afins entram só como teste de gente.
    if(/^(\\d)\\1{10}$/.test(d))return false;
    function verificador(ate){
      var soma=0;
      for(var i=0;i<ate;i++)soma+=Number(d[i])*(ate+1-i);
      var r=(soma*10)%11;
      return r===10?0:r;
    }
    return verificador(9)===Number(d[9])&&verificador(10)===Number(d[10]);
  }
  function cnpjValido(v){
    var d=onlyD(v);
    if(d.length!==14)return false;
    if(/^(\\d)\\1{13}$/.test(d))return false;
    function verificador(ate){
      var soma=0,peso=ate-7;
      for(var i=0;i<ate;i++){soma+=Number(d[i])*peso;peso=peso===2?9:peso-1}
      var r=soma%11;
      return r<2?0:11-r;
    }
    return verificador(12)===Number(d[12])&&verificador(13)===Number(d[13]);
  }
  // O campo aceita CNPJ: quem compra como empresa não pode ser barrado.
  function docOk(v){return onlyD(v).length===14?cnpjValido(v):cpfValido(v)}
  function emailOk(v){return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(v)}
  function nomeOk(v){return v.split(/\\s+/).filter(Boolean).length>=2}

  // ---- erro de campo ----
  // O texto do erro já está escrito no HTML, escondido. Aqui só liga a classe
  // .erro na caixa do campo, que revela a mensagem e pinta a borda. Nenhum
  // texto de erro nasce dentro deste script.
  function marca(id){var e=document.getElementById(id);if(e)e.classList.add('erro')}
  function limpa(id){var e=document.getElementById(id);if(e)e.classList.remove('erro')}

  // foco=false confere sem mexer na tela — serve para checar de novo na hora
  // de pagar, antes de a etapa 1 estar visível de volta.
  function validaEtapa1(foco){
    if(foco===undefined)foco=true;
    var campos=[
      ['femail',emailOk(val('email'))],
      ['fphone',telOk(val('phone'))],
      ['fcpf',docOk(val('cpf'))],
      ['fname',nomeOk(val('name'))],
      ['fcep',onlyD(val('cep')).length===8],
      ['fstreet',!!val('street')],
      ['fnumber',!!val('number')],
      ['fcity',!!val('city')],
      ['fstate',val('state').length===2],
      ['fship',!!shipId]
    ];
    var primeiro=null;
    campos.forEach(function(c){
      if(c[1]){limpa(c[0])}else{marca(c[0]);if(!primeiro)primeiro=c[0]}
    });
    if(primeiro&&foco){
      var box=document.getElementById(primeiro);
      if(box&&box.scrollIntoView)box.scrollIntoView({block:'center',behavior:'smooth'});
      var inp=box&&box.querySelector('input');
      if(inp)try{inp.focus({preventScroll:true})}catch(e){}
    }
    return !primeiro;
  }

  // ---- etapas ----
  // As duas vivem na MESMA página: trocar de etapa é esconder uma e mostrar a
  // outra. Nada vai ao servidor no meio do caminho — o pedido continua saindo
  // num POST só, no fim.
  function irEtapa(n,semRolar){
    document.getElementById('etapa1').style.display=n===1?'block':'none';
    document.getElementById('etapa2').style.display=n===2?'block':'none';
    // Sem isto, no celular a pessoa cai no meio da etapa nova.
    if(!semRolar)window.scrollTo({top:0,behavior:'smooth'});
  }
  document.getElementById('toPay').addEventListener('click',function(){if(validaEtapa1())irEtapa(2)});
  document.getElementById('back').addEventListener('click',function(){irEtapa(1)});

  // ---- máscaras ----
  // Todas descartam o que passar do tamanho e ignoram letras, e são idempotentes:
  // colar um valor já formatado não duplica a máscara, porque a conta começa
  // sempre pelos dígitos.
  // Escuta três eventos, não só 'input': o preenchimento automático do
  // navegador e alguns teclados de celular entregam o valor sem disparar
  // 'input', e aí o CEP ficava 13844162 em vez de 13844-162. 'change' e 'blur'
  // pegam o que escapou. Reescrever só quando muda evita mexer no cursor à toa.
  function mask(id,fn){
    var e=document.getElementById(id); if(!e)return;
    function aplica(){var novo=fn(e.value); if(novo!==e.value)e.value=novo}
    ['input','change','blur'].forEach(function(ev){e.addEventListener(ev,aplica)});
    if(e.value)aplica(); // valor que já veio preenchido na carga da página
  }
  // Um campo só para CPF e CNPJ: até 11 dígitos escreve 000.000.000-00,
  // daí para cima vira 00.000.000/0000-00.
  mask('cpf',function(v){
    var d=onlyD(v).slice(0,14);
    if(d.length<=11)return d.replace(/(\\d{3})(\\d)/,'$1.$2').replace(/(\\d{3})(\\d)/,'$1.$2').replace(/(\\d{3})(\\d{1,2})$/,'$1-$2');
    return d.replace(/^(\\d{2})(\\d)/,'$1.$2').replace(/^(\\d{2})\\.(\\d{3})(\\d)/,'$1.$2.$3')
      .replace(/\\.(\\d{3})(\\d)/,'.$1/$2').replace(/(\\d{4})(\\d)/,'$1-$2');
  });
  // Celular tem 9 dígitos depois do DDD e quebra 5-4; fixo tem 8 e quebra 4-4.
  // Uma regra só escreveria o fixo como 47 32221-234.
  mask('phone',function(v){
    var d=telDigitos(v); if(d.length<3)return d;
    var n=d.slice(2), c=n.length>8?5:4;
    return d.slice(0,2)+' '+n.slice(0,c)+(n.length>c?'-'+n.slice(c):'');
  });
  mask('cep',function(v){v=onlyD(v).slice(0,8);return v.replace(/(\\d{5})(\\d)/,'$1-$2')});

  // O erro some assim que a pessoa mexe no campo — deixar a borda vermelha
  // enquanto ela corrige faz o formulário parecer quebrado.
  [['email','femail'],['phone','fphone'],['cpf','fcpf'],['name','fname'],['cep','fcep'],
   ['street','fstreet'],['number','fnumber'],['city','fcity'],['state','fstate']].forEach(function(p){
    var e=document.getElementById(p[0]); if(e)e.addEventListener('input',function(){limpa(p[1])});
  });
  // E aparece ao SAIR do campo, não no meio da digitação.
  [['email','femail',emailOk],['phone','fphone',telOk],['cpf','fcpf',docOk]].forEach(function(p){
    var e=document.getElementById(p[0]); if(!e)return;
    e.addEventListener('blur',function(){if(e.value.trim()&&!p[2](e.value.trim()))marca(p[1])});
  });

  // ---- CEP: busca sozinho ao completar 8 dígitos, sem botão ----
  function abreEndereco(){document.getElementById('addr').style.display='block'}
  // Preenche um campo com o que veio do ViaCEP.
  //
  // Duas coisas que ele resolve:
  //  1) Valor vazio NÃO apaga o que a pessoa já digitou. CEP único de município
  //     (Jaru/RO, Açailândia/MA e milhares de outros) volta com logradouro e
  //     bairro em branco — escrever '' ali limpava o endereço na cara do cliente.
  //  2) value setado por script não dispara o evento 'input', então o .erro que
  //     tivesse sido ligado naquele campo continuaria vermelho por cima de um
  //     endereço certo. Some aqui, na mão.
  function preenche(id,v){
    var e=document.getElementById(id);
    if(!e||!v)return;
    e.value=v; limpa('f'+id);
  }
  // Foco no primeiro campo que ficou vazio — com CEP único de município o que
  // falta é a rua, não o número.
  function focoNoVazio(ids){
    for(var i=0;i<ids.length;i++){
      var e=document.getElementById(ids[i]);
      if(e&&!e.value&&!e.disabled){try{e.focus({preventScroll:true})}catch(x){}return}
    }
  }
  var cepFetched='', cepSeq=0;
  async function lookupCep(){
    var box=document.getElementById('fcep'), cep=onlyD(val('cep'));
    box.classList.remove('achou');
    if(cep.length!==8){box.classList.remove('buscando');return}
    if(cepFetched===cep){box.classList.add('achou');abreEndereco();return}
    cepFetched=cep; limpa('fcep'); box.classList.add('buscando');
    var meu=++cepSeq;
    try{
      var r=await (await fetch('https://viacep.com.br/ws/'+cep+'/json/')).json();
      // Trocou de CEP enquanto este voltava: a resposta velha não pode
      // sobrescrever o endereço do CEP novo.
      if(meu!==cepSeq)return;
      if(r.erro){marca('fcep');cepFetched=''}
      else{
        preenche('street',r.logradouro);
        preenche('neighborhood',r.bairro);
        preenche('city',r.localidade);
        preenche('state',r.uf);
        box.classList.add('achou');
      }
    }catch(e){cepFetched=''} // ViaCEP fora do ar não pode travar a venda: os campos abrem para digitar à mão
    if(meu!==cepSeq)return;
    box.classList.remove('buscando');
    abreEndereco();
    focoNoVazio(['street','number','neighborhood','city','state']);
  }
  // Mesma razão da máscara: se o CEP chegar por preenchimento automático, o
  // 'input' não vem — sem 'change' o endereço nunca era buscado.
  ['input','change','blur'].forEach(function(ev){
    document.getElementById('cep').addEventListener(ev,lookupCep);
  });

  document.getElementById('noNumber').addEventListener('change',function(){
    var n=document.getElementById('number');
    if(this.checked){n.value='S/N';n.disabled=true;n.style.opacity='.55';limpa('fnumber')}
    else{n.value='';n.disabled=false;n.style.opacity='1';n.focus()}
  });

  function showErr(m){var e=document.getElementById('err');e.textContent=m||'';e.style.display=m?'block':'none'}
  // Texto de queda de conexão também mora no HTML (atributo data-rede), e não aqui.
  function erroPadrao(){return document.getElementById('err').getAttribute('data-rede')||''}

  (async function(){
    var ids=Object.keys(cart);
    if(!ids.length){document.getElementById('root').innerHTML='<div class="ck-card ck-vazio">Seu carrinho está vazio. <a href="/">Voltar à loja</a></div>';return}
    var fetchIds=ids.slice();
    bumps.forEach(function(b){
      if(b.variantId&&fetchIds.indexOf(String(b.variantId))<0)fetchIds.push(String(b.variantId));
    });
    var cat=await (await fetch('/api/variants?opcoes=1&ids='+fetchIds.join(','))).json();
    var vars=cat.variants||[];
    bumps.forEach(function(b){
      var v=vars.filter(function(x){return String(x.id)===String(b.variantId)})[0];
      if(!v)return;
      bumpVars[b.variantId]=v;
      bumpEscolha[b.variantId]=String(b.variantId);
      // As irmãs vêm da rota com ?opcoes=1 e só existem em produto de grade.
      // Guardadas por "slot|variante" para dois bumps do mesmo produto nunca
      // dividirem a mesma escolha.
      (v.opcoes||[]).forEach(function(o){
        bumpOpc[b.variantId+"|"+o.id]={id:o.id,option:o.option,priceCents:v.priceCents,image:v.image};
      });
    });
    items=vars.filter(function(v){return cart[v.id]!=null}).map(function(v){return {variantId:v.id,qty:cart[v.id]||1,priceCents:v.priceCents,title:v.title,image:v.image,handle:v.handle||''}});
    if(!items.length){document.getElementById('root').innerHTML='<div class="ck-card ck-vazio">Produtos não encontrados. <a href="/">Voltar à loja</a></div>';return}
    render();
  })();

  document.getElementById('pay').addEventListener('click',async function(){
    // Confere de novo aqui: a etapa 2 pode ser alcançada e a pessoa voltar para
    // apagar um campo. Se algo estiver errado, volta para a etapa 1 já marcada.
    if(!validaEtapa1(false)){irEtapa(1,true);validaEtapa1(true);return}
    showErr('');var btn=this;btn.disabled=true;btn.textContent='Gerando PIX…';
    var ua=navigator.userAgent.toLowerCase();
    var device=/android/.test(ua)?'android':/iphone|ipad|ipod/.test(ua)?'ios':'web';
    var fbclid=new URLSearchParams(location.search).get('fbclid')||'';
    var payload={items:items.map(function(i){return {variantId:i.variantId,qty:i.qty}}),
      gravacoes:gravs.map(function(g){return {variantId:g.v,qty:g.q,texto:g.t,estilo:g.e}}),
      shippingId:shipId,device:device,
      bumpsAccepted:bumpsAceitos().map(function(b){return bumpEscolha[b.variantId]||b.variantId}),
      fb:{fbp:getCookie('_fbp'),fbc:getCookie('_fbc'),fbclid:fbclid},
      tracking:trackingAtual(),
      customer:{name:val('name'),email:val('email'),phone:val('phone'),cpf:val('cpf'),cep:val('cep'),
        street:val('street'),number:val('number'),complement:val('complement'),neighborhood:val('neighborhood'),
        city:val('city'),state:val('state'),recipient:val('recipient')}};
    try{
      var res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var data=await res.json();
      // A mensagem de recusa vem do servidor, que é quem sabe o que faltou.
      if(!res.ok){showErr(data.error||erroPadrao());btn.disabled=false;btn.textContent='Comprar';return}
      showPix(data);pollStatus(data.orderId);
    }catch(e){showErr(erroPadrao());btn.disabled=false;btn.textContent='Comprar'}
  });

  function showPix(data){
    document.getElementById('root').style.display='none';
    var el=document.getElementById('pixScreen');el.style.display='block';
    document.getElementById('qr').src=data.qrDataUrl;
    document.getElementById('copyCode').textContent=data.pix;
    document.getElementById('copyBtn').addEventListener('click',function(){
      navigator.clipboard.writeText(data.pix).then(function(){this.textContent='Copiado!';}.bind(this)).catch(function(){});
    });
    window.scrollTo({top:0,behavior:'smooth'});
    window.__paidValue=data.totalCents;
  }
  function pollStatus(orderId){
    var t=setInterval(async function(){
      try{var s=await (await fetch('/api/orders/'+orderId+'/status')).json();
        if(s.status==='paid'){clearInterval(t);onPaid(orderId,s.totalCents,s.oferta)}
      }catch(e){}
    },3000);
  }
  // A oferta vem do /status já assinada pelo servidor. Quando não vem (promoção
  // desligada ou prazo estourado), o bloco simplesmente continua escondido.
  function mostrarOferta(oferta){
    if(!oferta||!oferta.href)return;
    var box=document.getElementById('okOferta');if(!box)return;
    document.getElementById('okOfertaPreco').textContent=money(oferta.precoCents);
    document.getElementById('okOfertaMin').textContent=Math.max(1,Math.round((oferta.restanteMs||0)/60000));
    var btn=document.getElementById('okOfertaBtn');
    btn.href=oferta.href;
    // o preço no botão vem do servidor: mudar UPSELL_PRECO_CENTS não pode
    // deixar um "R$ 69" escrito na mão mentindo aqui
    btn.textContent='Ver os tênis por '+money(oferta.precoCents);
    box.style.display='block';
  }
  function onPaid(orderId,totalCents,oferta){
    document.getElementById('pixScreen').style.display='none';
    document.getElementById('okScreen').style.display='block';
    mostrarOferta(oferta);
    localStorage.removeItem('cart');
    if(window.fbq)fbq('track','Purchase',{value:(totalCents||0)/100,currency:CFG.currency},{eventID:orderId});
    window.scrollTo({top:0,behavior:'smooth'});
  }
})();`;

// -------------------------------------------- OFERTA PÓS-COMPRA ("/oferta/:id")
//
// Página que o botão da tela de obrigado abre. Vive fora do checkout de
// propósito: é uma segunda compra, com carrinho e PIX próprios. O que ela NÃO
// tem é formulário — endereço, CPF e telefone o servidor pega do pedido pago.
const UPSELL_CSS = `
  /* Verde só do "comprar": o resto da página é o roxo da marca. Fica em
     variável porque aparece no botão da folha de numeração e na barra. */
  :root{--of-verde:var(--comprar);--of-verde-d:var(--comprar-d)}
  /* HERÓI. Roxo da marca puxado ao máximo em vez do vermelho de liquidação: a
     oferta precisa gritar sem parecer outra loja. O preto no fim do gradiente
     é o mesmo --black do header, então o herói nasce colado nele. */
  .of-hero{color:#fff;padding:26px 18px 22px;
    background:linear-gradient(150deg,#7b28d8 0%,#3d1178 55%,#0b0a0f 100%)}
  .of-hero-in{max-width:640px;margin:0 auto}
  @media(min-width:900px){.of-hero-in{max-width:940px}}
  /* Texto e fotos lado a lado no desktop, empilhados no celular. O relógio
     fica FORA desta grade pra atravessar a largura toda nos dois casos. */
  .of-hero-top{display:grid;gap:18px}
  @media(min-width:900px){
    .of-hero-top{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:36px}
  }
  /* Fotos do catálogo sobre fundo roxo: cada uma entra numa placa branca, senão
     o fundo branco do produto vira um retângulo solto no gradiente. E contain
     pelo mesmo motivo do resto do site — recortar corta cano e sola. */
  .of-fotos{display:flex;gap:9px;justify-content:center}
  @media(min-width:900px){.of-fotos{justify-content:flex-end}}
  .of-fotos img{width:88px;aspect-ratio:3/4;object-fit:contain;background:#fff;
    border-radius:13px;flex:none;box-shadow:0 14px 30px -16px rgba(0,0,0,.85)}
  @media(min-width:900px){.of-fotos img{width:120px}}
  /* a do meio sobe um pouco: dá ritmo às três sem virar enfeite */
  .of-fotos img:nth-child(2){transform:translateY(-11px)}
  .of-selo{display:inline-flex;align-items:center;gap:7px;background:var(--volt);color:#0b0a0f;
    font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    padding:6px 13px;border-radius:999px}
  /* A chamada é a ENTRADA do preço, não um título concorrente: pequena, em
     roxo claro, e a frase termina no número logo abaixo. */
  .of-hero h1{font-size:16px;line-height:1.3;margin:16px 0 2px;font-weight:500;color:#d5cce6}
  @media(min-width:900px){.of-hero h1{font-size:18px}}
  /* Bloco do preço: é o argumento da página inteira, então é o maior elemento
     da tela e o único em volt. O "de" e o "-30%" ficam ao lado, não embaixo,
     pra leitura ser uma frase só: 69, de 99, menos 30%. */
  .of-preco{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin:0}
  .of-preco .n{font-size:54px;line-height:1;font-weight:800;color:var(--volt);
    letter-spacing:-.035em;font-variant-numeric:tabular-nums}
  @media(min-width:900px){.of-preco .n{font-size:70px}}
  .of-preco .de{font-size:16px;color:#a99cc4;text-decoration:line-through;font-weight:500}
  .of-preco .off{position:static;background:#fff;color:#0b0a0f;font-size:12px;font-weight:800;
    padding:4px 9px;border-radius:999px;box-shadow:none;letter-spacing:.02em}
  /* Uma linha. Eram três, e ninguém lê três linhas de corpo num herói. */
  .of-hero p{margin:12px 0 0;font-size:14px;line-height:1.55;color:#cdc2e2}
  .of-hero p b{color:#fff;font-weight:600}

  /* RELÓGIO. Some do herói e vira barra grudada no topo quando a pessoa desce
     pra grade — sem isso a urgência ficaria só na primeira dobra, que é
     justamente onde ela ainda não escolheu nada. */
  /* Barra fina, não a caixa grande e vazia de antes. E sem volt: essa cor é do
     preço. Aqui a urgência vem do tamanho do número e da régua que corre até a
     borda — duas coisas em volt faziam nenhuma das duas dominar. */
  .of-clock{display:flex;align-items:center;gap:12px;margin-top:20px;padding-top:14px;
    border-top:1px solid rgba(255,255,255,.22)}
  .of-clock .lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b3a6cc;flex:none}
  .of-clock b{font-size:26px;line-height:1;font-weight:800;color:#fff;
    font-variant-numeric:tabular-nums;letter-spacing:.01em;flex:none}
  .of-clock::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.18)}
  .of-sticky{position:sticky;top:0;z-index:70;display:none;
    background:linear-gradient(90deg,#4a1490,#7b28d8);color:#fff;
    padding:9px 16px;align-items:center;justify-content:center;gap:9px;
    font-size:13px;box-shadow:0 6px 18px -12px rgba(0,0,0,.8)}
  .of-sticky.on{display:flex}
  .of-sticky b{font-variant-numeric:tabular-nums;font-size:16px;font-weight:800;color:var(--volt)}

  .of-busca{display:flex;gap:8px;margin:22px 0 0}
  .of-busca input{flex:1;min-width:0;height:48px;border:1.5px solid #e2dfe8;border-radius:12px;
    padding:0 15px;font:inherit;font-size:15px;background:#fff}
  .of-busca input:focus{outline:2px solid var(--brand);outline-offset:-1px;border-color:transparent}
  .of-hd{margin:26px 0 0}
  .of-hd h2{font-size:19px;font-weight:700;letter-spacing:-.02em;margin:0;color:#0b0a0f}
  @media(min-width:900px){.of-hd h2{font-size:23px}}
  .of-n{color:#6e6a78;font-size:13.5px;margin:5px 0 0}
  .of-voltar{margin-top:12px}
  /* As vitrines são as da home e usam a folha da loja. O que muda aqui é só o
     "Ver Todos": lá ele é link pra /colecao, aqui filtra dentro da oferta. */
  #ofFeats .feat-hd a{cursor:pointer}
  /* o card inteiro vira botão: nesta página clicar num par não leva a lugar
     nenhum, abre a escolha de numeração ali mesmo */
  .of-grid{margin-top:14px}
  .of-grid .prod{cursor:pointer;position:relative;transition:transform .14s,box-shadow .14s}
  .of-grid .prod:hover{transform:translateY(-3px);box-shadow:0 18px 34px -20px rgba(11,10,15,.55)}
  .of-grid .prod .ph img{pointer-events:none}
  /* "Escolher" aparece no lugar do "à vista no PIX": ali o card da loja
     explica pagamento, e aqui o que falta é dizer que ele é clicável. */
  .of-grid .prod .parc{color:var(--brand-d);font-weight:700}
  .of-add{width:100%;margin-top:2px;height:48px;border-radius:12px;border:0;cursor:pointer;
    background:var(--of-verde);color:#fff;font:inherit;font-weight:800;font-size:15px}
  .of-add:disabled{background:#d8d4e0;color:#8b8794;cursor:not-allowed}
  /* ---- folha de numeração ---- */
  .of-sheet{position:fixed;inset:0;z-index:120;background:rgba(11,10,15,.55);
    display:flex;align-items:flex-end;justify-content:center}
  @media(min-width:700px){.of-sheet{align-items:center}}
  .of-sheet[hidden]{display:none}
  .of-sheet-in{background:#fff;width:100%;max-width:460px;border-radius:18px 18px 0 0;padding:18px 16px 20px}
  @media(min-width:700px){.of-sheet-in{border-radius:18px}}
  .of-sheet-hd{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
  .of-sheet-hd img{width:70px;height:93px;object-fit:contain;border-radius:10px;background:#fff;flex:none}
  .of-sheet-hd h3{margin:0 0 4px;font-size:14.5px;line-height:1.35;font-weight:600}
  .of-sheet-hd .p{color:var(--brand);font-weight:800;font-size:17px}
  .of-sheet-hd .p s{color:#6e6a78;font-weight:500;font-size:12.5px;margin-left:6px}
  .of-sheet .of-fechar{background:none;border:0;font-size:22px;line-height:1;color:#8b8794;
    cursor:pointer;padding:0 2px;margin-left:auto}
  /* ---- barra do carrinho ---- */
  /* O verde é só do botão de comprar. Roxo manda na página inteira; se o CTA
     fosse roxo também, ele sumiria dentro dela. */
  .of-bar{position:sticky;bottom:0;z-index:90;background:#fff;border-top:1px solid #e2dfe8;
    box-shadow:0 -10px 30px -18px rgba(11,10,15,.75);padding:12px 16px;
    display:flex;align-items:center;gap:14px}
  .of-bar[hidden]{display:none}
  .of-bar .info{min-width:0;flex:1}
  .of-bar .info b{display:block;font-size:19px;color:#0b0a0f;line-height:1.15;font-weight:800;
    font-variant-numeric:tabular-nums}
  .of-bar .info span{font-size:12.5px;color:#6e6a78;display:block;margin-top:1px}
  .of-bar .info span i{font-style:normal;color:var(--of-verde);font-weight:700}
  .of-bar button{flex:none;height:52px;padding:0 24px;border-radius:13px;border:0;cursor:pointer;
    background:var(--of-verde);color:#fff;font:inherit;font-weight:800;font-size:15.5px;
    box-shadow:0 10px 22px -12px rgba(var(--brand-rgb),.9)}
  .of-bar button:active{background:var(--of-verde-d)}
  .of-bar button:disabled{opacity:.6;cursor:progress;box-shadow:none}
  .of-lista{margin:0 0 10px;padding:0;list-style:none;max-height:180px;overflow:auto}
  .of-lista li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f1eff5;
    font-size:13px}
  .of-lista img{width:36px;height:48px;object-fit:contain;border-radius:6px;flex:none}
  .of-lista .t{flex:1;min-width:0;line-height:1.3}
  .of-lista .x{background:none;border:0;color:#c0392b;cursor:pointer;font-size:12.5px;padding:4px}
  .of-aviso{padding:60px 16px;text-align:center;color:#6e6a78}
  .of-aviso h2{color:#0b0a0f;font-size:19px;margin:0 0 8px}
  /* Telas de PIX e de confirmação. São irmãs das do checkout, mas escritas
     aqui: as de lá dependem das variáveis --ck-*, que só existem na folha do
     checkout. Copiar cinco regras sai mais barato que arrastar aquela folha
     inteira para cá. */
  .of-pix,.of-fim{max-width:460px;margin:26px auto;text-align:center;background:#fff;
    border:1px solid #eeecf2;border-radius:16px;padding:22px 18px;
    box-shadow:0 6px 20px -16px rgba(11,10,15,.4)}
  .of-pix h2,.of-fim h2{font-size:19px;margin:0 0 6px}
  .of-pix .qr{margin:18px auto;border:1px solid #e2dfe8;border-radius:10px;padding:10px;display:block}
  .of-copy{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;
    background:#f6f4fa;border-radius:8px;padding:12px;text-align:left;line-height:1.5}
  .of-wait{display:inline-flex;gap:8px;align-items:center;color:#6e6a78;margin-top:16px;font-size:13.5px}
  .of-dot{width:9px;height:9px;border-radius:50%;background:var(--brand);animation:ofp 1s infinite}
  @keyframes ofp{50%{opacity:.3}}
  .of-fim .big{font-size:44px}`;

// O token da oferta vem na URL (?t=) e nunca é reescrito aqui: toda chamada
// reenvia o mesmo que o servidor assinou. Quem decide se ele vale é o backend.
const UPSELL_JS = `${SHOP_JS}
(function(){
  var PED=window.__PEDIDO, TOKEN=new URLSearchParams(location.search).get('t')||'';
  var elErro=document.getElementById('ofErro'), elMain=document.getElementById('ofMain');
  var grid=document.getElementById('ofGrid'), more=document.getElementById('ofMore');
  var carrinho=[], preco=0, maxItens=10, offset=0, total=0, busca='', colecao='', carregando=false;
  var fim=0, relogio=null;

  function falhou(msg){
    document.getElementById('ofErroTx').textContent=msg||'Este link não está mais valendo.';
    elErro.style.display='block'; elMain.style.display='none';
    if(relogio)clearInterval(relogio);
  }
  function api(qs){return '/api/oferta/'+encodeURIComponent(PED)+'?t='+encodeURIComponent(TOKEN)+(qs||'')}

  // ---- relógio da oferta ----
  function tick(){
    // ceil, não round: com round o relógio marcaria 00:00 com meio segundo
    // ainda de pé, e o botão continuaria funcionando parecendo expirado.
    var s=Math.max(0,Math.ceil((fim-Date.now())/1000));
    var dd=function(n){return String(n).padStart(2,'0')};
    var h=Math.floor(s/3600);
    // Acima de uma hora o MM:SS vira "224:03", que se lê como 224 horas. A
    // janela padrão é de 30 min, mas UPSELL_JANELA_MIN aceita qualquer valor.
    var txt=h?h+':'+dd(Math.floor(s%3600/60))+':'+dd(s%60):dd(Math.floor(s/60))+':'+dd(s%60);
    document.getElementById('ofClock').textContent=txt;
    document.getElementById('ofClock2').textContent=txt;
    // Expirou: o backend já recusaria a compra, mas deixar a tela viva daria a
    // impressão de que ainda dá tempo. Some com ela na hora.
    if(s<=0){clearInterval(relogio);falhou('Esta oferta valia por 30 minutos depois da sua compra, e esse prazo já passou.')}
  }
  // A barra grudada no topo só entra quando o relógio do herói sai de vista —
  // dois relógios na tela ao mesmo tempo é ruído, nenhum é pior.
  function ligarSticky(){
    var alvo=document.querySelector('.of-clock'), barra=document.getElementById('ofSticky');
    if(!alvo||!barra||!window.IntersectionObserver)return;
    new IntersectionObserver(function(es){
      barra.classList.toggle('on',!es[0].isIntersecting);
    },{threshold:0}).observe(alvo);
  }

  // Cabeçalho da oferta (preço, "de", -30%, relógio). Roda uma vez, com o que
  // vier na primeira resposta — os dois modos de listagem mandam os mesmos campos.
  var montado=false;
  function montarTopo(d){
    elMain.style.display='block';
    preco=d.precoCents; maxItens=d.maxItens;
    if(!fim){fim=Date.now()+d.restanteMs; tick(); relogio=setInterval(tick,1000); ligarSticky()}
    document.getElementById('ofPreco').textContent=money(preco);
    if(montado)return; montado=true;
    // O "de" e o "-30%" saem do próprio catálogo, do preço cheio do primeiro
    // par que aparecer. Catálogo sem preço cheio não mostra nenhum dos dois,
    // em vez de inventar um desconto.
    var primeiro=(d.products&&d.products[0])
      || (d.destaque&&d.destaque.products&&d.destaque.products[0])
      || (d.sections&&d.sections[0]&&d.sections[0].products[0]);
    var cheioRef=(primeiro&&primeiro.variants[0]||{}).compareCents||0;
    if(cheioRef>preco){
      document.getElementById('ofDe').textContent=money(cheioRef);
      document.getElementById('ofOff').textContent='-'+Math.round((1-preco/cheioRef)*100)+'%';
    }else{
      document.getElementById('ofDe').style.display='none';
      document.getElementById('ofOff').style.display='none';
    }
  }

  // Card com o clique da oferta no lugar do link pro produto. Sair daqui pro
  // /produto mostraria o mesmo par pelo preço cheio.
  function cardOferta(p){
    var div=document.createElement('div');
    div.innerHTML=cardHtml(p).replace('à vista no <b>PIX</b>','Escolher numeração');
    var card=div.firstChild;
    card.dataset.handle=p.handle; card.dataset.title=p.title; card.dataset.img=p.image||'';
    card.dataset.cheio=(p.variants[0]||{}).compareCents||0;
    card.querySelectorAll('a').forEach(function(a){a.removeAttribute('href')});
    card.addEventListener('click',function(){abrirSheet(card)});
    return card;
  }

  // ---- vitrines: mesma montagem da home ----
  var feats=document.getElementById('ofFeats');
  function fileira(titulo, produtos, handle, total){
    var sec=document.createElement('section');
    sec.className='feat';
    sec.innerHTML='<div class="feat-hd"><h2></h2>'
      +(handle?'<a href="#" data-col="'+esc(handle)+'">Ver Todos <i>('+total+')</i></a>':'')
      +'</div><div class="rowwrap"><div class="row"></div>'+setasHtml()+'</div>';
    sec.querySelector('h2').textContent=titulo;
    var row=sec.querySelector('.row');
    produtos.forEach(function(p){row.appendChild(cardOferta(p))});
    var link=sec.querySelector('[data-col]');
    // "Ver Todos" filtra DENTRO da oferta: mandar pra /colecao levaria a
    // pessoa pra fora, e lá os mesmos pares custam o preço cheio.
    if(link)link.addEventListener('click',function(e){
      e.preventDefault(); colecao=handle; busca='';
      document.getElementById('ofQ').value='';
      carregar(true); window.scrollTo({top:0,behavior:'smooth'});
    });
    return sec;
  }

  async function carregarVitrines(){
    feats.innerHTML='<div class="wrap"><p class="muted" style="padding:24px 0">Carregando…</p></div>';
    var r,d;
    try{ r=await fetch(api('')); d=await r.json() }
    catch(e){ feats.innerHTML='<div class="wrap"><p class="muted" style="padding:24px 0">Não foi possível carregar. Recarregue a página.</p></div>'; return }
    if(!r.ok){falhou(d&&d.error);return}
    montarTopo(d);
    renderMenu(d.menu||[]); ligarMenuDaOferta();
    // Três pares no herói, tirados dos Mais Vendidos — é a curadoria do
    // lojista, então são os que melhor representam o que R$ 69 compra.
    // Sem destaque no catálogo, o bloco continua escondido e o herói fica
    // exatamente como era antes.
    var fotos=document.getElementById('ofFotos');
    var capa=((d.destaque&&d.destaque.products)||[]).filter(function(p){return p.image}).slice(0,3);
    if(fotos&&capa.length===3){
      fotos.innerHTML=capa.map(function(p){
        return '<img src="'+esc(p.image)+'" alt="'+esc(p.title)+'">';
      }).join('');
      fotos.hidden=false;
    }
    feats.innerHTML='';
    // "Mais Vendidos" com o mesmo painel colorido da home
    if(d.destaque&&d.destaque.products.length){
      var hl=document.createElement('section');
      hl.className='hl';
      hl.innerHTML='<div class="hl-in"><div class="hl-tx"><h2></h2><p></p></div>'
        +'<div class="rowwrap"><div class="hl-row"></div>'+setasHtml()+'</div></div>';
      hl.querySelector('h2').textContent=d.destaque.title||'';
      hl.querySelector('.hl-tx p').textContent=d.destaque.subtitle||'';
      var hr=hl.querySelector('.hl-row');
      d.destaque.products.forEach(function(p){hr.appendChild(cardOferta(p))});
      feats.appendChild(hl);
    }
    (d.sections||[]).forEach(function(s){
      feats.appendChild(fileira(s.title,s.products,s.handle,s.total));
    });
    feats.querySelectorAll('.rowwrap').forEach(ligarSetas);
  }

  // ---- grade (busca e "ver todos") ----
  async function carregar(reset){
    if(carregando)return; carregando=true; more.disabled=true;
    document.getElementById('ofBusca').style.display='block';
    feats.style.display='none';
    if(reset){offset=0;grid.innerHTML='<p class="muted" style="padding:24px 0">Carregando…</p>'}
    var r,d;
    try{
      r=await fetch(api('&offset='+offset+'&limit=24&q='+encodeURIComponent(busca)
        +'&col='+encodeURIComponent(colecao)));
      d=await r.json();
    }catch(e){carregando=false;more.disabled=false;return}
    if(!r.ok){falhou(d&&d.error);return}
    montarTopo(d);
    total=d.total;
    if(reset)grid.innerHTML='';
    d.products.forEach(function(p){grid.appendChild(cardOferta(p))});
    offset+=d.products.length;
    document.getElementById('ofTitulo').textContent=busca
      ? (total===1?'1 par encontrado':total+' pares encontrados')
      : (d.titulo||'Coleção');
    document.getElementById('ofN').textContent=total
      ? 'Todos por '+money(preco)+', com frete grátis. Leve até '+maxItens+' pares.'
      : '';
    more.style.display=offset<total?'inline-flex':'none';
    carregando=false; more.disabled=false;
    if(!total)grid.innerHTML='<p class="muted" style="padding:24px 0">'
      +'Nenhum par com esse nome. Tente pela marca — Nike, Mizuno, New Balance, Asics.</p>';
  }

  // Volta pras vitrines: é o estado padrão da página, então limpar a busca
  // (ou clicar em "ver todas as coleções") tem que trazer ele de volta.
  function verVitrines(){
    busca=''; colecao=''; offset=0;
    document.getElementById('ofBusca').style.display='none';
    feats.style.display='';
  }
  document.getElementById('ofVoltar').addEventListener('click',function(){
    document.getElementById('ofQ').value=''; verVitrines();
    window.scrollTo({top:0,behavior:'smooth'});
  });

  more.addEventListener('click',function(){carregar(false)});
  var tBusca=null;
  document.getElementById('ofQ').addEventListener('input',function(e){
    var v=e.target.value.trim(); clearTimeout(tBusca);
    tBusca=setTimeout(function(){
      if(!v&&!colecao)return verVitrines();
      busca=v; colecao=''; carregar(true);
    },300);
  });

  // ---- folha de numeração ----
  var sheet=document.getElementById('ofSheet'), atual=null, escolhido=null;
  // Falha ao carregar não é falta de estoque. Antes os dois casos caíam no
  // mesmo texto ("Sem numeração disponível") e o cliente lia sempre a mesma
  // coisa: que o tênis acabou — e desistia da oferta. Agora o erro de carga
  // se diz erro de carga e oferece o "tentar de novo": a oferta dura 30
  // minutos, mandar recarregar a página inteira gasta o prazo dela.
  function avisoSheet(txt, comRetry){
    var box=document.getElementById('ofSizes');
    box.innerHTML='';
    var p=document.createElement('p');
    p.className='muted'; p.style.margin='0'; p.textContent=txt;
    box.appendChild(p);
    if(!comRetry)return;
    var b=document.createElement('button');
    b.type='button'; b.className='btn btn--ghost'; b.style.marginTop='10px';
    b.textContent='Tentar de novo';
    b.addEventListener('click',function(){abrirSheet(null)});
    box.appendChild(b);
  }
  async function abrirSheet(card){
    // card=null é o "tentar de novo": repete a última numeração pedida.
    if(card)atual={handle:card.dataset.handle,title:card.dataset.title,
      img:card.dataset.img,cheio:parseInt(card.dataset.cheio,10)||0};
    if(!atual)return;
    escolhido=null;
    document.getElementById('ofSImg').src=atual.img;
    document.getElementById('ofSTitle').textContent=atual.title;
    document.getElementById('ofSPrice').innerHTML=money(preco)+(atual.cheio>preco?' <s>'+money(atual.cheio)+'</s>':'');
    document.getElementById('ofSizes').innerHTML='<p class="muted" style="margin:0">Carregando numerações…</p>';
    document.getElementById('ofAdd').disabled=true;
    document.getElementById('ofAdd').textContent='Escolha a numeração';
    sheet.hidden=false;
    // As numerações não vêm na grade (seriam 11 por produto em ~1.100 pares).
    // Busca só do par aberto, e o preço mostrado continua sendo o da oferta.
    var r,d;
    // slim=1: só as numerações. Antes vinham junto a descrição, as fotos e os
    // relacionados, e qualquer um deles podia derrubar a resposta inteira — com
    // o cliente lendo isso como tênis indisponível, e o relógio correndo.
    try{ r=await fetch('/api/produto/'+encodeURIComponent(atual.handle)+'?slim=1'); d=await r.json() }
    catch(e){ avisoSheet('Não foi possível carregar as numerações. Confira a conexão.',true); return }
    // Sem conferir o r.ok, a resposta de erro ({error:...}) não tinha .product
    // e caía na mesma linha do estoque zerado: a falha do servidor aparecia
    // pro cliente como "este tênis não está disponível".
    if(!r.ok||!d||!d.product){ avisoSheet('Não foi possível carregar as numerações agora.',true); return }
    var vs=d.product.variants||[];
    if(!vs.length){ avisoSheet('Este modelo está sem numeração cadastrada. Escolha outro par.',false); return }
    if(!vs.some(function(v){return v.available})){
      avisoSheet('Todas as numerações deste par estão esgotadas. Escolha outro.',false); return;
    }
    var box=document.getElementById('ofSizes');
    box.innerHTML='';
    vs.forEach(function(v){
      var b=document.createElement('button');
      b.type='button'; b.className='sz'; b.textContent=v.option||'Único'; b.disabled=!v.available;
      b.addEventListener('click',function(){
        box.querySelectorAll('.sz').forEach(function(x){x.classList.remove('on')});
        b.classList.add('on'); escolhido=v;
        var add=document.getElementById('ofAdd');
        add.disabled=false; add.textContent='Quero este par · '+money(preco);
      });
      box.appendChild(b);
    });
  }
  function fecharSheet(){sheet.hidden=true}
  document.getElementById('ofSClose').addEventListener('click',fecharSheet);
  sheet.addEventListener('click',function(e){if(e.target===sheet)fecharSheet()});

  document.getElementById('ofAdd').addEventListener('click',function(){
    if(!escolhido)return;
    var pares=carrinho.reduce(function(s,i){return s+i.qty},0);
    if(pares>=maxItens){alert('Esta oferta vale para até '+maxItens+' pares. Você já escolheu '+pares+'.');return}
    var achou=carrinho.filter(function(i){return i.variantId===escolhido.id})[0];
    if(achou)achou.qty++;
    else carrinho.push({variantId:escolhido.id,qty:1,cheio:atual.cheio,
      title:atual.title,option:escolhido.option||'',img:atual.img});
    fecharSheet(); pintarBarra();
  });

  // ---- barra do carrinho ----
  function pintarBarra(){
    var pares=carrinho.reduce(function(s,i){return s+i.qty},0);
    var bar=document.getElementById('ofBar');
    bar.hidden=!pares;
    document.getElementById('ofTotal').textContent=money(pares*preco);
    // A economia é o argumento que fecha a compra, então ela aparece na barra
    // em vez de só o total. Soma o "de" de cada par, não um número redondo.
    var poupou=carrinho.reduce(function(s,i){
      return s+(i.cheio>preco?(i.cheio-preco)*i.qty:0)},0);
    document.getElementById('ofQtd').innerHTML=(pares===1?'1 par':pares+' pares')
      +' · frete grátis'+(poupou>0?' · <i>você economiza '+money(poupou)+'</i>':'');
  }

  // ---- finalizar: 2º pedido, PIX novo ----
  document.getElementById('ofGo').addEventListener('click',async function(){
    var btn=this; if(!carrinho.length)return;
    btn.disabled=true; btn.textContent='Gerando o PIX…';
    var r,d;
    try{
      r=await fetch('/api/oferta/'+encodeURIComponent(PED),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({t:TOKEN,items:carrinho.map(function(i){return {variantId:i.variantId,qty:i.qty}})})});
      d=await r.json();
    }catch(e){btn.disabled=false;btn.textContent='Comprar agora';alert('A conexão falhou antes de gerar o PIX. Tente de novo.');return}
    if(!r.ok){btn.disabled=false;btn.textContent='Comprar agora';alert((d&&d.error)||'Não foi possível gerar o PIX.');return}
    mostrarPix(d);
  });

  function mostrarPix(d){
    if(relogio)clearInterval(relogio);
    elMain.style.display='none';
    document.getElementById('ofPago').style.display='block';
    document.getElementById('ofQr').src=d.qrDataUrl;
    document.getElementById('ofCopy').textContent=d.pix;
    document.getElementById('ofResumo').innerHTML=carrinho.map(function(i){
      return '<li><img src="'+esc(i.img)+'" alt=""><span class="t">'+esc(i.title)+
        (i.option?' — '+esc(i.option):'')+'</span><b>'+i.qty+'x</b></li>';
    }).join('');
    document.getElementById('ofCopyBtn').addEventListener('click',function(){
      var b=this; navigator.clipboard.writeText(d.pix).then(function(){b.textContent='Copiado!'}).catch(function(){});
    });
    window.scrollTo({top:0,behavior:'smooth'});
    var t=setInterval(async function(){
      try{var s=await (await fetch('/api/orders/'+d.orderId+'/status')).json();
        if(s.status==='paid'){clearInterval(t);
          document.getElementById('ofPago').style.display='none';
          document.getElementById('ofOk').style.display='block';
          if(window.fbq)fbq('track','Purchase',{value:(d.totalCents||0)/100,currency:__CFG.currency},{eventID:d.orderId});
          window.scrollTo({top:0,behavior:'smooth'});
        }
      }catch(e){}
    },3000);
  }

  // O menu do burger sai do /api/oferta, não do /api/menu da loja: aquele traz
  // Juliet e Chinelos, que esta página não pode vender. E os links dele apontam
  // para /colecao, que levaria a pessoa pra fora da oferta — aqui cada clique
  // vira um filtro dentro da própria página, igual ao "Ver Todos" das vitrines.
  function ligarMenuDaOferta(){
    var dn=document.getElementById('drawernav');
    if(!dn)return;
    dn.querySelectorAll('a[href^="/colecao/"]').forEach(function(a){
      var h=a.getAttribute('href').replace('/colecao/','');
      a.setAttribute('href','#');
      a.addEventListener('click',function(e){
        e.preventDefault();
        colecao=h; busca=''; document.getElementById('ofQ').value='';
        // A gaveta abre com a classe 'on' (ver .drawer.on no CSS). Remover
        // 'open' não fechava nada: o filtro rodava atrás do menu aberto e a
        // tela parecia travada em cima do mesmo painel.
        var dr=document.getElementById('drawer'), sc=document.getElementById('scrim');
        if(dr)dr.classList.remove('on');
        if(sc)sc.classList.remove('on');
        carregar(true); window.scrollTo({top:0,behavior:'smooth'});
      });
    });
  }

  if(!TOKEN){falhou('Este link está incompleto. Abra a oferta pelo botão da tela de confirmação da sua compra.');return}
  carregarVitrines();
})();`;

export function upsellPage(orderId) {
  const body = `
  ${shopHeader('O que está buscando?', { sacola: false })}
  <div id="ofErro" class="of-aviso" style="display:none">
    <h2>Esta oferta não está mais de pé</h2>
    <p id="ofErroTx">Este link não está mais valendo.</p>
    <p style="margin-top:16px"><a class="btn btn--ghost" href="/">Ver a loja</a></p>
  </div>

  <div id="ofMain" style="display:none">
    <!-- Relógio grudado no topo. Nasce escondido e o JS liga quando o herói
         sai da tela: enquanto o herói está visível, o relógio dele já basta. -->
    <div class="of-sticky" id="ofSticky">Sua oferta acaba em <b id="ofClock2">--:--</b></div>

    <section class="of-hero">
      <div class="of-hero-in">
        <div class="of-hero-top">
          <div>
            <span class="of-selo">Você desbloqueou este preço</span>
            <h1>Qualquer tênis da loja sai por</h1>
            <div class="of-preco">
              <span class="n" id="ofPreco">R$ 69</span>
              <span class="de" id="ofDe">R$ 99</span>
              <span class="off" id="ofOff">-30%</span>
            </div>
            <p><b>Entra na mesma caixa</b> do seu pedido — sem frete novo, sem preencher nada.</p>
          </div>
          <div class="of-fotos" id="ofFotos" hidden aria-hidden="true"></div>
        </div>
        <div class="of-clock">
          <span class="lbl">Acaba em</span><b id="ofClock">--:--</b>
        </div>
      </div>
    </section>

    <div class="wrap">
      <div class="of-busca">
        <input id="ofQ" type="search" placeholder="Buscar por modelo, cor ou marca…" autocomplete="off">
      </div>
    </div>

    <!-- Vitrines: as MESMAS da home, no mesmo carrossel. É o modo padrão. -->
    <div id="ofFeats"></div>

    <!-- Resultado de busca ou de "ver todos": grade plana, some quando a busca
         esvazia e as vitrines voltam. -->
    <div class="wrap" id="ofBusca" style="display:none">
      <div class="of-hd">
        <h2 id="ofTitulo"></h2>
        <p class="of-n" id="ofN"></p>
        <button class="btn btn--ghost of-voltar" id="ofVoltar" type="button">← Ver todas as coleções</button>
      </div>
      <div id="ofGrid" class="grid of-grid"></div>
      <div style="text-align:center;padding:16px 0 20px">
        <button id="ofMore" class="btn btn--ghost" style="display:none">Ver mais pares</button>
      </div>
    </div>
    <div style="height:90px"></div>

    <div class="of-bar" id="ofBar" hidden>
      <div class="info"><b id="ofTotal">R$ 0</b><span id="ofQtd"></span></div>
      <button id="ofGo" type="button">Comprar agora</button>
    </div>
  </div>

  <div id="ofSheet" class="of-sheet" hidden>
    <div class="of-sheet-in">
      <div class="of-sheet-hd">
        <img id="ofSImg" alt="">
        <div style="min-width:0">
          <h3 id="ofSTitle"></h3>
          <div class="p" id="ofSPrice"></div>
        </div>
        <button class="of-fechar" id="ofSClose" type="button" aria-label="Fechar">×</button>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6e6a78">Qual a sua numeração?</p>
      <div class="sizes" id="ofSizes"></div>
      <button class="of-add" id="ofAdd" type="button" disabled>Escolha a numeração</button>
    </div>
  </div>

  <div class="wrap" id="ofPago" style="display:none">
    <div class="of-pix">
      <h2>Falta só pagar</h2>
      <p style="font-size:13.5px;color:#6b7280;margin:0 0 4px">Estes pares estão reservados até o PIX cair.</p>
      <ul class="of-lista" id="ofResumo"></ul>
      <img class="qr" id="ofQr" alt="QR Code do PIX" width="260" height="260">
      <p style="font-size:13px;color:#6b7280;margin:0">Escaneie o QR ou use o copia-e-cola:</p>
      <div id="ofCopy" class="of-copy" style="margin-top:12px"></div>
      <button id="ofCopyBtn" type="button" class="btn btn--ghost" style="margin-top:12px">Copiar código</button>
      <div class="of-wait"><span class="of-dot"></span> Aguardando a confirmação do pagamento…</div>
    </div>
  </div>

  <div class="wrap" id="ofOk" style="display:none">
    <div class="of-fim">
      <div class="big">✅</div>
      <h2>Aproveitou bem!</h2>
      <p style="font-size:13.5px;color:#6b7280">Estes pares entram na mesma caixa do seu pedido —
        chegam juntos, no mesmo prazo.</p>
      <a class="btn btn--ghost" href="/" style="margin-top:12px;display:inline-block">Voltar para a loja</a>
    </div>
  </div>

  <script>window.__PEDIDO=${jsonSeguro(String(orderId || ''))};</script>
  <script>${UPSELL_JS}</script>`;
  return html(`Oferta especial — ${LOJA.nomeCompleto}`, body, STORE_CSS_SHARED + UPSELL_CSS);
}

// --------------------------------------------- RECUPERAÇÃO ("/recuperar/:id")
// A tela que o e-mail de PIX abandonado abre. Reaproveita quase todo o CSS da
// oferta pós-compra (UPSELL_CSS): as duas são a mesma página conceitual — um
// preço melhor com prazo — e ter dois desenhos pra isso só daria trabalho.
// Aqui entra só o que a oferta não tem: o quadro do pedido que ficou parado.
const RECUPERAR_CSS = `
  .rc-ped{max-width:560px;margin:0 auto 16px;background:#fff;border:1px solid var(--line);
    border-radius:16px;overflow:hidden}
  .rc-ped .hd{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;
    align-items:center;justify-content:space-between;gap:10px}
  .rc-ped .hd h2{margin:0;font-size:15px;letter-spacing:-.01em}
  .rc-ped .hd .n{font-size:12.5px;color:#8b8794}
  .rc-it{display:flex;gap:12px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line)}
  .rc-it img{width:56px;height:56px;border-radius:10px;object-fit:cover;background:#f2f1f5;flex:none}
  .rc-it .t{font-size:13.5px;line-height:1.35;min-width:0}
  .rc-it .t b{display:block;font-weight:600}
  .rc-it .t span{color:#8b8794;font-size:12.5px}
  .rc-it .p{margin-left:auto;text-align:right;white-space:nowrap}
  .rc-it .p b{font-size:14px;font-weight:800}
  .rc-it .p s{display:block;font-size:12px;color:#8b8794;font-weight:500}
  /* Par escolhido agora (não veio do pedido abandonado) ganha o "x" pra tirar:
     o que estava no pedido original não sai — a oferta é sobre ele. */
  .rc-it .x{margin-left:10px;border:0;background:#f2f1f5;color:#6e6a78;width:28px;height:28px;
    border-radius:8px;font-size:16px;line-height:1;cursor:pointer;flex:none}
  .rc-it .x:hover{background:#e8e5ee}
  .rc-novo{background:#f7f4fd}
  .rc-tot{padding:14px 18px;font-size:13.5px}
  .rc-tot .l{display:flex;justify-content:space-between;padding:3px 0;color:#6e6a78}
  .rc-tot .l.d{color:#1e8e52;font-weight:700}
  .rc-tot .l.g{color:#0b0a0f;font-weight:800;font-size:17px;padding-top:10px;margin-top:6px;
    border-top:1px solid var(--line)}
  .rc-ent{max-width:560px;margin:0 auto 18px;padding:13px 16px;background:#f7f6f9;
    border-radius:12px;font-size:13px;color:#6e6a78;line-height:1.5}
  .rc-ent b{color:#0b0a0f}
  /* Chamada do segundo par. Fundo próprio porque ela é uma oferta DENTRO da
     oferta, e sem separação visual vira só mais uma fileira de produtos. */
  .rc-mais{max-width:560px;margin:0 auto}
  .rc-mais .hd2{text-align:center;margin:26px 0 4px}
  .rc-mais .hd2 h2{margin:0 0 4px;font-size:19px;letter-spacing:-.02em}
  .rc-mais .hd2 p{margin:0;color:#6e6a78;font-size:13.5px}
  .rc-mais .hd2 em{font-style:normal;color:#1e8e52;font-weight:700}
`;

const RECUPERAR_JS = `${SHOP_JS}
(function(){
  var PED=window.__PEDIDO, TOKEN=new URLSearchParams(location.search).get('t')||'';
  var elErro=document.getElementById('rcErro'), elMain=document.getElementById('rcMain');
  var grid=document.getElementById('rcGrid'), more=document.getElementById('rcMore');
  // base = o pedido abandonado remontado pelo servidor. extras = o que a pessoa
  // acrescentou nesta tela. Os dois são somados na escada, mas só os extras
  // podem ser removidos.
  var base=null, extras=[], primeiro=0, adicional=0, maxItens=10;
  var offset=0, total=0, busca='', carregando=false, fim=0, relogio=null;

  function falhou(msg){
    document.getElementById('rcErroTx').textContent=msg||'Este link não está mais valendo.';
    elErro.style.display='block'; elMain.style.display='none';
    if(relogio)clearInterval(relogio);
  }
  function api(qs){return '/api/recuperar/'+encodeURIComponent(PED)+'?t='+encodeURIComponent(TOKEN)+(qs||'')}

  // Espelho de totalDaEscada/descontoDaEscada do servidor. Só pra exibir: quem
  // cobra é o backend, e é ele que decide o valor do PIX.
  function paresTotal(){
    return base.pares+extras.reduce(function(s,i){return s+i.qty},0);
  }
  function totalEscada(n){ return n?primeiro+(n-1)*adicional:0 }

  // ---- relógio ----
  function tick(){
    var s=Math.max(0,Math.ceil((fim-Date.now())/1000));
    var dd=function(n){return String(n).padStart(2,'0')};
    var h=Math.floor(s/3600);
    var txt=h?h+':'+dd(Math.floor(s%3600/60))+':'+dd(s%60):dd(Math.floor(s/60))+':'+dd(s%60);
    document.getElementById('rcClock').textContent=txt;
    document.getElementById('rcClock2').textContent=txt;
    if(s<=0){clearInterval(relogio);falhou('O prazo desta oferta acabou. O preço voltou ao normal na loja.')}
  }
  function ligarSticky(){
    var alvo=document.querySelector('.of-clock'), barra=document.getElementById('rcSticky');
    if(!alvo||!barra||!window.IntersectionObserver)return;
    new IntersectionObserver(function(es){
      barra.classList.toggle('on',!es[0].isIntersecting);
    },{threshold:0}).observe(alvo);
  }

  // ---- quadro do pedido ----
  function pintar(){
    var n=paresTotal();
    var itens=base.items.concat(extras);
    document.getElementById('rcItens').innerHTML=itens.map(function(i,ix){
      var novo=ix>=base.items.length;
      return '<div class="rc-it'+(novo?' rc-novo':'')+'">'
        +'<img src="'+esc(i.image||'')+'" alt="">'
        +'<div class="t"><b>'+esc(i.title||'')+'</b>'
        +'<span>'+(i.qty>1?i.qty+' pares':'1 par')+(novo?' · adicionado agora':'')+'</span></div>'
        +'<div class="p"><b>'+money(i.priceCents)+'</b>'
        +(i.deCents?'<s>'+money(i.deCents)+'</s>':'')+'</div>'
        +(novo?'<button class="x" type="button" data-rm="'+(ix-base.items.length)+'" aria-label="Tirar este par">×</button>':'')
        +'</div>';
    }).join('');
    document.getElementById('rcItens').querySelectorAll('[data-rm]').forEach(function(b){
      b.addEventListener('click',function(){
        var i=parseInt(b.dataset.rm,10);
        if(extras[i].qty>1)extras[i].qty--; else extras.splice(i,1);
        pintar();
      });
    });

    var sub=itens.reduce(function(s,i){return s+i.priceCents*i.qty},0);
    var desc=sub-totalEscada(n);
    var tot=totalEscada(n)+base.shippingCents;
    document.getElementById('rcN').textContent=(n===1?'1 par':n+' pares');
    document.getElementById('rcTot').innerHTML=
      '<div class="l"><span>'+n+' '+(n===1?'par':'pares')+'</span><span>'+money(sub)+'</span></div>'
      +(desc>0?'<div class="l d"><span>Desconto da oferta</span><span>-'+money(desc)+'</span></div>':'')
      +'<div class="l"><span>'+esc(base.frete.nome||'Frete')+'</span><span>'
        +(base.shippingCents?money(base.shippingCents):'Grátis')+'</span></div>'
      +'<div class="l g"><span>Total</span><span>'+money(tot)+'</span></div>';

    document.getElementById('rcTotBar').textContent=money(tot);
    // O que ela ganha levando mais um. Some no teto, senão o texto prometeria
    // um par que o backend vai recusar.
    document.getElementById('rcQtd').innerHTML=(n===1?'1 par':n+' pares')
      +(n<maxItens?' · <i>+1 par por '+money(adicional)+'</i>':'');
  }

  // ---- grade do segundo par ----
  function cardRec(p){
    var div=document.createElement('div');
    div.innerHTML=cardHtml(p).replace('à vista no <b>PIX</b>','Escolher numeração');
    var card=div.firstChild;
    card.dataset.handle=p.handle; card.dataset.title=p.title; card.dataset.img=p.image||'';
    card.dataset.cheio=(p.variants[0]||{}).compareCents||0;
    // Sem href: sair daqui pro /produto mostraria o mesmo par pelo preço cheio.
    card.querySelectorAll('a').forEach(function(a){a.removeAttribute('href')});
    card.addEventListener('click',function(){abrirSheet(card)});
    return card;
  }

  function encher(lista,reset){
    if(reset)grid.innerHTML='';
    lista.forEach(function(p){grid.appendChild(cardRec(p))});
  }

  async function carregar(reset){
    if(carregando)return; carregando=true; more.disabled=true;
    if(reset){offset=0;grid.innerHTML='<p class="muted" style="padding:24px 0">Carregando…</p>'}
    var r,d;
    try{
      r=await fetch(api('&offset='+offset+'&limit=12&q='+encodeURIComponent(busca)));
      d=await r.json();
    }catch(e){carregando=false;more.disabled=false;return}
    if(!r.ok){falhou(d&&d.error);return}
    total=d.total;
    encher(d.products||[],reset);
    offset+=(d.products||[]).length;
    more.style.display=offset<total?'inline-flex':'none';
    carregando=false; more.disabled=false;
    if(!total)grid.innerHTML='<p class="muted" style="padding:24px 0">'
      +'Nenhum par com esse nome. Tente pela marca — Nike, Mizuno, New Balance, Asics.</p>';
  }

  more.addEventListener('click',function(){carregar(false)});
  var tBusca=null, sugeridos=[];
  document.getElementById('rcQ').addEventListener('input',function(e){
    var v=e.target.value.trim(); clearTimeout(tBusca);
    tBusca=setTimeout(function(){
      // Busca vazia volta pros sugeridos: eles são a curadoria do lojista, e
      // grade em branco pareceria catálogo quebrado.
      if(!v){busca='';more.style.display='none';encher(sugeridos,true);return}
      busca=v; carregar(true);
    },300);
  });

  // ---- folha de numeração ----
  var sheet=document.getElementById('rcSheet'), atual=null, escolhido=null;
  function avisoSheet(txt,comRetry){
    var box=document.getElementById('rcSizes');
    box.innerHTML='';
    var p=document.createElement('p');
    p.className='muted'; p.style.margin='0'; p.textContent=txt;
    box.appendChild(p);
    if(!comRetry)return;
    var b=document.createElement('button');
    b.type='button'; b.className='btn btn--ghost'; b.style.marginTop='10px';
    b.textContent='Tentar de novo';
    b.addEventListener('click',function(){abrirSheet(null)});
    box.appendChild(b);
  }
  async function abrirSheet(card){
    if(card)atual={handle:card.dataset.handle,title:card.dataset.title,
      img:card.dataset.img,cheio:parseInt(card.dataset.cheio,10)||0};
    if(!atual)return;
    escolhido=null;
    document.getElementById('rcSImg').src=atual.img;
    document.getElementById('rcSTitle').textContent=atual.title;
    // O preço da folha é o do PAR ADICIONAL, não o do primeiro: é quanto este
    // clique específico vai custar a mais. Mostrar R$ 79 aqui faria a barra
    // subir menos do que a tela prometeu.
    document.getElementById('rcSPrice').innerHTML=money(adicional)
      +(atual.cheio>adicional?' <s>'+money(atual.cheio)+'</s>':'');
    document.getElementById('rcSizes').innerHTML='<p class="muted" style="margin:0">Carregando numerações…</p>';
    document.getElementById('rcAdd').disabled=true;
    document.getElementById('rcAdd').textContent='Escolha a numeração';
    sheet.hidden=false;
    var r,d;
    try{ r=await fetch('/api/produto/'+encodeURIComponent(atual.handle)+'?slim=1'); d=await r.json() }
    catch(e){ avisoSheet('Não foi possível carregar as numerações. Confira a conexão.',true); return }
    if(!r.ok||!d||!d.product){ avisoSheet('Não foi possível carregar as numerações agora.',true); return }
    var vs=d.product.variants||[];
    if(!vs.length){ avisoSheet('Este modelo está sem numeração cadastrada. Escolha outro par.',false); return }
    if(!vs.some(function(v){return v.available})){
      avisoSheet('Todas as numerações deste par estão esgotadas. Escolha outro.',false); return;
    }
    var box=document.getElementById('rcSizes');
    box.innerHTML='';
    vs.forEach(function(v){
      var b=document.createElement('button');
      b.type='button'; b.className='sz'; b.textContent=v.option||'Único'; b.disabled=!v.available;
      b.addEventListener('click',function(){
        box.querySelectorAll('.sz').forEach(function(x){x.classList.remove('on')});
        b.classList.add('on'); escolhido=v;
        var add=document.getElementById('rcAdd');
        add.disabled=false; add.textContent='Adicionar por '+money(adicional);
      });
      box.appendChild(b);
    });
  }
  function fecharSheet(){sheet.hidden=true}
  document.getElementById('rcSClose').addEventListener('click',fecharSheet);
  sheet.addEventListener('click',function(e){if(e.target===sheet)fecharSheet()});

  document.getElementById('rcAdd').addEventListener('click',function(){
    if(!escolhido)return;
    if(paresTotal()>=maxItens){
      alert('Esta oferta vale para até '+maxItens+' pares. Você já tem '+paresTotal()+'.');return;
    }
    var achou=extras.filter(function(i){return i.variantId===escolhido.id})[0];
    if(achou)achou.qty++;
    else extras.push({variantId:escolhido.id,qty:1,priceCents:primeiro,
      deCents:atual.cheio>primeiro?atual.cheio:null,
      title:atual.title+(escolhido.option?' — '+escolhido.option:''),image:atual.img});
    fecharSheet(); pintar();
    document.getElementById('rcPedBox').scrollIntoView({behavior:'smooth',block:'center'});
  });

  // ---- finalizar ----
  document.getElementById('rcGo').addEventListener('click',async function(){
    var btn=this;
    btn.disabled=true; btn.textContent='Gerando o PIX…';
    var r,d;
    try{
      r=await fetch('/api/recuperar/'+encodeURIComponent(PED),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({t:TOKEN,extras:extras.map(function(i){return {variantId:i.variantId,qty:i.qty}})})});
      d=await r.json();
    }catch(e){btn.disabled=false;btn.textContent='Pagar com PIX';alert('A conexão falhou antes de gerar o PIX. Tente de novo.');return}
    if(!r.ok){btn.disabled=false;btn.textContent='Pagar com PIX';alert((d&&d.error)||'Não foi possível gerar o PIX.');return}
    mostrarPix(d);
  });

  function mostrarPix(d){
    if(relogio)clearInterval(relogio);
    elMain.style.display='none';
    document.getElementById('rcPago').style.display='block';
    document.getElementById('rcQr').src=d.qrDataUrl;
    document.getElementById('rcCopy').textContent=d.pix;
    document.getElementById('rcResumo').innerHTML=base.items.concat(extras).map(function(i){
      return '<li><img src="'+esc(i.image||'')+'" alt=""><span class="t">'+esc(i.title||'')+
        '</span><b>'+i.qty+'x</b></li>';
    }).join('');
    document.getElementById('rcCopyBtn').addEventListener('click',function(){
      var b=this; navigator.clipboard.writeText(d.pix).then(function(){b.textContent='Copiado!'}).catch(function(){});
    });
    window.scrollTo({top:0,behavior:'smooth'});
    var t=setInterval(async function(){
      try{var s=await (await fetch('/api/orders/'+d.orderId+'/status')).json();
        if(s.status==='paid'){clearInterval(t);
          document.getElementById('rcPago').style.display='none';
          document.getElementById('rcOk').style.display='block';
          if(window.fbq)fbq('track','Purchase',{value:(d.totalCents||0)/100,currency:__CFG.currency},{eventID:d.orderId});
          window.scrollTo({top:0,behavior:'smooth'});
        }
      }catch(e){}
    },3000);
  }

  // ---- abertura ----
  async function iniciar(){
    var r,d;
    try{ r=await fetch(api('')); d=await r.json() }
    catch(e){ falhou('Não foi possível carregar a oferta. Confira a conexão e recarregue.'); return }
    if(!r.ok){falhou(d&&d.error);return}

    base=d.pedido; primeiro=d.primeiroCents; adicional=d.adicionalCents; maxItens=d.maxItens;
    elMain.style.display='block';
    fim=Date.now()+d.restanteMs; tick(); relogio=setInterval(tick,1000); ligarSticky();

    var nome=base.primeiroNome;
    if(nome)document.getElementById('rcOi').textContent=nome+', seu pedido ainda está aqui';
    document.getElementById('rcPreco').textContent=money(primeiro);
    document.getElementById('rcMaisTx').innerHTML='Leve outro par por apenas <em>'+money(adicional)+'</em>';
    document.getElementById('rcEnt').innerHTML= base.entrega
      ? 'Entrega em <b>'+esc(base.entrega)+'</b> · '+esc(base.frete.nome||'')
        +(base.frete.eta?' · '+esc(base.frete.eta):'')
        +'<br>Seu endereço e CPF já estão preenchidos — é só pagar.'
      : 'Seu endereço e CPF já estão preenchidos — é só pagar.';

    sugeridos=((d.destaque&&d.destaque.products)||[]).filter(function(p){
      // Tira do "leve outro" o que já está no pedido: sugerir o par que a
      // pessoa já tem parece catálogo burro.
      return !base.items.some(function(i){return String(i.variantId||'').split('::')[0]===p.handle});
    });
    encher(sugeridos,true);
    more.style.display='none';
    pintar();
  }

  if(!TOKEN){falhou('Este link está incompleto. Abra a oferta pelo botão do e-mail que você recebeu.');return}
  iniciar();
})();`;

export function recuperacaoPage(orderId) {
  const body = `
  ${shopHeader('O que está buscando?', { sacola: false })}
  <div id="rcErro" class="of-aviso" style="display:none">
    <h2>Esta oferta não está mais de pé</h2>
    <p id="rcErroTx">Este link não está mais valendo.</p>
    <p style="margin-top:16px"><a class="btn btn--ghost" href="/">Ver a loja</a></p>
  </div>

  <div id="rcMain" style="display:none">
    <div class="of-sticky" id="rcSticky">Sua oferta acaba em <b id="rcClock2">--:--</b></div>

    <section class="of-hero">
      <div class="of-hero-in">
        <div class="of-hero-top">
          <div>
            <span class="of-selo">Oferta só para você</span>
            <h1 id="rcOi">Seu pedido ainda está aqui</h1>
            <div class="of-preco">
              <span class="n" id="rcPreco">R$ 79</span>
            </div>
            <p>Você gerou o PIX e ele não foi pago. <b>Baixamos o preço</b> pra você fechar agora.</p>
          </div>
        </div>
        <div class="of-clock">
          <span class="lbl">Acaba em</span><b id="rcClock">--:--</b>
        </div>
      </div>
    </section>

    <div class="wrap">
      <div class="rc-ped" id="rcPedBox">
        <div class="hd"><h2>Seu pedido</h2><span class="n" id="rcN"></span></div>
        <div id="rcItens"></div>
        <div class="rc-tot" id="rcTot"></div>
      </div>
      <div class="rc-ent" id="rcEnt"></div>

      <div class="rc-mais">
        <div class="hd2">
          <h2>Aproveite o frete</h2>
          <p id="rcMaisTx"></p>
        </div>
        <div class="of-busca">
          <input id="rcQ" type="search" placeholder="Buscar por modelo, cor ou marca…" autocomplete="off">
        </div>
        <div id="rcGrid" class="grid of-grid"></div>
        <div style="text-align:center;padding:16px 0 20px">
          <button id="rcMore" class="btn btn--ghost" style="display:none">Ver mais pares</button>
        </div>
      </div>
    </div>
    <div style="height:90px"></div>

    <div class="of-bar" id="rcBar">
      <div class="info"><b id="rcTotBar">R$ 0</b><span id="rcQtd"></span></div>
      <button id="rcGo" type="button">Pagar com PIX</button>
    </div>
  </div>

  <div id="rcSheet" class="of-sheet" hidden>
    <div class="of-sheet-in">
      <div class="of-sheet-hd">
        <img id="rcSImg" alt="">
        <div style="min-width:0">
          <h3 id="rcSTitle"></h3>
          <div class="p" id="rcSPrice"></div>
        </div>
        <button class="of-fechar" id="rcSClose" type="button" aria-label="Fechar">×</button>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6e6a78">Qual a sua numeração?</p>
      <div class="sizes" id="rcSizes"></div>
      <button class="of-add" id="rcAdd" type="button" disabled>Escolha a numeração</button>
    </div>
  </div>

  <div class="wrap" id="rcPago" style="display:none">
    <div class="of-pix">
      <h2>Falta só pagar</h2>
      <p style="font-size:13.5px;color:#6b7280;margin:0 0 4px">Estes pares estão reservados até o PIX cair.</p>
      <ul class="of-lista" id="rcResumo"></ul>
      <img class="qr" id="rcQr" alt="QR Code do PIX" width="260" height="260">
      <p style="font-size:13px;color:#6b7280;margin:0">Escaneie o QR ou use o copia-e-cola:</p>
      <div id="rcCopy" class="of-copy" style="margin-top:12px"></div>
      <button id="rcCopyBtn" type="button" class="btn btn--ghost" style="margin-top:12px">Copiar código</button>
      <div class="of-wait"><span class="of-dot"></span> Aguardando a confirmação do pagamento…</div>
    </div>
  </div>

  <div class="wrap" id="rcOk" style="display:none">
    <div class="of-fim">
      <div class="big">✅</div>
      <h2>Pedido confirmado!</h2>
      <p style="font-size:13.5px;color:#6b7280">Já estamos separando os seus pares.</p>
      <a class="btn btn--ghost" href="/" style="margin-top:12px;display:inline-block">Voltar para a loja</a>
    </div>
  </div>

  <script>window.__PEDIDO=${jsonSeguro(String(orderId || ''))};</script>
  <script>${RECUPERAR_JS}</script>`;
  return html(`Seu pedido está esperando — ${LOJA.nomeCompleto}`, body, STORE_CSS_SHARED + UPSELL_CSS + RECUPERAR_CSS);
}





// ------------------------------------------- INSTITUCIONAIS ("/termos-de-uso"…)
// Casca das três páginas de política. O TEXTO não está aqui: mora em
// legal-docs.js, que devolve o HTML já montado. Aqui só entra o que é página —
// cabeçalho da loja, largura de leitura, rodapé e os links para os documentos
// irmãos, pra quem terminou de ler um não precisar voltar ao rodapé.
//
// Devolve null quando o slug não existe ou as políticas estão desligadas
// (LOJA_LEGAL=0); a rota transforma isso em 404.
export function legalPage(slug) {
  const doc = renderLegal(slug);
  if (!doc) return null;

  const irmaos = linksLegais().filter((l) => l.href !== `/${slug}`);
  const body = `
  ${shopHeader()}
  <div class="wrap">
    <article class="legal">
      <h1>${escHtml(doc.titulo)}</h1>
      <p class="legal-lead">${escHtml(doc.resumo)}</p>
      <div class="legal-doc">${doc.html}</div>
      <p class="legal-data">Última atualização: ${escHtml(doc.atualizado)}</p>
      ${irmaos.length ? `<nav class="legal-irmaos">
        <h4>Leia também</h4>
        ${irmaos.map((l) => `<a href="${l.href}">${escHtml(l.texto)}</a>`).join('')}
      </nav>` : ''}
    </article>
  </div>
  ${shopFooter()}
  ${zapBtn()}
  <script>${LEGAL_JS}</script>`;
  return html(`${escHtml(doc.titulo)} — ${escHtml(LOJA.nomeCompleto)}`, body, STORE_CSS_SHARED + LEGAL_CSS);
}

// Texto corrido: medida de leitura curta (~68 caracteres por linha) e entrelinha
// alta. É documento pra ler, não vitrine pra escanear.
const LEGAL_CSS = `
  .legal{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--line);
    border-radius:var(--radius);padding:34px 26px 30px}
  @media(min-width:700px){.legal{padding:44px 52px 40px}}
  .legal h1{font-size:26px;line-height:1.25;letter-spacing:-.4px;margin:0 0 10px}
  @media(min-width:700px){.legal h1{font-size:32px}}
  .legal-lead{font-size:15px;color:var(--soft);margin:0 0 26px;padding-bottom:22px;
    border-bottom:1px solid var(--line)}
  .legal-doc{font-size:15px;line-height:1.75;color:#3a3742}
  .legal-doc h2{font-size:18.5px;line-height:1.35;color:var(--ink);letter-spacing:-.2px;
    margin:34px 0 12px;scroll-margin-top:80px}
  .legal-doc h3{font-size:15.5px;color:var(--ink);margin:24px 0 8px}
  .legal-doc p{margin:0 0 14px}
  .legal-doc ul{margin:0 0 16px;padding-left:20px}
  .legal-doc li{margin:0 0 7px}
  .legal-doc strong{color:var(--ink);font-weight:600}
  .legal-doc a{text-decoration:underline;text-underline-offset:2px}
  /* quebra e-mail longo no celular em vez de estourar a caixa pro lado */
  .legal-doc a{overflow-wrap:anywhere}
  .legal-data{margin:30px 0 0;padding-top:20px;border-top:1px solid var(--line);
    font-size:13px;color:var(--soft)}
  .legal-irmaos{margin-top:26px}
  .legal-irmaos h4{font-size:12.5px;letter-spacing:.06em;color:var(--soft);margin:0 0 10px}
  .legal-irmaos a{display:inline-block;margin:0 8px 8px 0;padding:9px 15px;font-size:13.5px;
    font-weight:600;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink)}
  .legal-irmaos a:hover{border-color:var(--brand);color:var(--brand)}
`;

// O cabeçalho da loja é o mesmo das outras páginas: precisa do menu carregado e
// do contador do carrinho preenchido, senão a sacola aparece sempre zerada.
const LEGAL_JS = `${SHOP_JS}
(function(){
  fetch('/api/menu').then(function(r){return r.json()}).then(function(d){renderMenu(d.menu||[])}).catch(function(){});
  refreshCart();
})();`;

export default { storePage, checkoutPage, collectionPage, productPage, legalPage };
