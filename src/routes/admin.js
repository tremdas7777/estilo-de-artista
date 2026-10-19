import { Router } from 'express';
import QRCode from 'qrcode';
import {
  doisFatoresAtivo, iniciarDoisFatores, pendenteDoisFatores, confirmarDoisFatores,
  verificarDoisFatores, desligarDoisFatores, codigosBackupRestantes,
} from './twoFactor.js';
import { criarPendente, pendenteValido } from './adminAuth.js';
import { registrarAcesso, listAcessos, getGeos, saveGeo, ipsSemGeo } from '../db.js';
import { consultar as consultarGeo, ehDatacenter, resumo as resumoGeo } from '../checkout/geoip.js';
import { ehCloudflare } from '../cloudflare.js';
import { notificarAcessoAdmin } from '../checkout/push.js';
import { emSegundoPlano } from '../segundoPlano.js';
import config from '../config.js';
import {
  temSessao, basicOk, darSessao, tirarSessao, credenciaisOk,
  bloqueado, registrarFalha, limparFalhas, destinoSeguro,
} from './adminAuth.js';
import fs from 'node:fs';
import {
  listOrders, getOrder, orderStats, setTrackingCode, catalogCount,
  revenueByDay, statsForDay, statsForPeriodo, hojeBR,
  topProdutosVendidos, numeracaoMaisVendida, resumoVendasProdutos, tiposDoCatalogo,
} from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { consultarRastreio } from '../rastreio/client.js';
import { telefoneDigitos, telefoneValido, toE164 } from '../checkout/orders.js';
import { GATEWAYS, activeGatewayId, setActiveGateway } from '../gateways.js';
import { getCustomization, saveCustomization, defaults, resetVisual, comCustomizacao, MAX_BUMPS } from '../checkout/customization.js';
import { checkoutPage, logoDaLoja } from '../views/pages.js';
import { hexRgb, softTint } from '../checkout/cores.js';
import { getContato, saveContato, normalizarWhatsapp, whatsappValido, formatarWhatsapp, linkWhatsapp } from '../checkout/contato.js';
import {
  PROVEDORES, getEmailConfig, saveEmailConfig, emailPronto, faltando, emailValido, enviarEmail,
} from '../checkout/email.js';
import {
  pedidoExemplo,
  montarHtmlPedido, montarTextoPedido, assuntoPedido,
} from '../checkout/emailPedido.js';
import { logEmail, listEmails } from '../db.js';
import { reimportarCatalogo, caminhoCsv } from '../checkout/seed.js';
import { esquecerMaisVendidos, JANELA_DIAS as MV_JANELA, MIN_PARES as MV_MIN, VAGAS as MV_VAGAS } from '../checkout/maisVendidos.js';
import { chavePublica, getPushPrefs, savePushPrefs, notificarTeste } from '../checkout/push.js';
import { listPushSubs, salvarPushSub, removerPushSub } from '../db.js';
import { loadCatalog, imagemNaLargura } from '../checkout/products.js';
import { CURADAS } from '../checkout/collections.js';
import { TIPO_PRECO_UNICO } from '../checkout/importCsv.js';

const router = Router();

const brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const dt = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

// Tela de login (a do navegador era o popup cinza do Basic Auth, que não
// aceita estilo). Mesma paleta do painel, num cartão centralizado.
function loginPage({ erro = '', next = '/admin', user = '' } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Entrar · ${esc(config.lojaNome)} Admin</title>
<style>
  :root{--bg:#0b0a0f;--card:#15131d;--line:#272233;--ink:#f3f0f8;--soft:#a39fb0}
  ${adminCorVars()}
  /* O painel é escuro, mas sem isto o navegador desenha os controles NATIVOS
     como se ele fosse claro: no <input type="date"> o ícone do calendário sai
     preto sobre campo quase preto e some, e o calendário que abre vem branco.
     Vale também para as setas do <select> e a barra de rolagem. */
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:var(--bg);color:var(--ink);
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px}
  /* dois brilhos bem discretos atrás do cartão, pra tela não ficar um vazio preto */
  body::before{content:"";position:fixed;inset:0;pointer-events:none;
    background:radial-gradient(420px 300px at 50% 0%,rgba(var(--brand-rgb),.20),transparent 70%),
               radial-gradient(520px 340px at 50% 100%,rgba(var(--brand-rgb),.10),transparent 70%)}
  .box{position:relative;width:100%;max-width:380px}
  .brand{text-align:center;margin-bottom:22px}
  .brand .lg{font-size:26px;font-weight:800;letter-spacing:-.02em}
  .brand .lg b{color:var(--brand)}
  /* a arte tem folga transparente em volta, então 58px de altura deixa a
     palavra do mesmo tamanho ótico do nome escrito que havia aqui antes. */
  .brand .lgi{height:58px;width:auto;max-width:80%;object-fit:contain;display:block;margin:0 auto}
  .brand .sb{color:var(--soft);font-size:13px;margin-top:6px}
  form{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;
    box-shadow:0 18px 50px rgba(0,0,0,.45)}
  label{display:block;font-size:12px;color:var(--soft);margin-bottom:6px}
  .fld{margin-bottom:14px}
  .in{width:100%;background:#0e0d14;border:1.5px solid var(--line);border-radius:10px;color:var(--ink);
    padding:12px 13px;font-size:15px;font-family:inherit}
  .in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(var(--brand-rgb),.22)}
  .btn{width:100%;background:var(--brand);color:#fff;border:none;border-radius:10px;
    padding:13px 16px;font-weight:700;font-size:14.5px;cursor:pointer;margin-top:4px}
  .btn:hover{filter:brightness(1.08)}
  .err{background:#4a1620;color:#f0a3ae;border-radius:10px;padding:11px 13px;font-size:13px;margin-bottom:16px}
  .foot{color:#6b6577;font-size:12px;text-align:center;margin-top:18px}
</style></head><body>
<div class="box">
  <div class="brand"><div class="lg">${marcaAdminLogo('lgi')}</div><div class="sb">Painel administrativo</div></div>
  <form method="post" action="/admin/login">
    ${erro ? `<div class="err">${esc(erro)}</div>` : ''}
    <input type="hidden" name="next" value="${esc(next)}">
    <div class="fld">
      <label for="u">Usuário</label>
      <input class="in" id="u" name="user" value="${esc(user)}" autocomplete="username"
        autocapitalize="off" autocorrect="off" spellcheck="false" ${user ? '' : 'autofocus'}>
    </div>
    <div class="fld">
      <label for="p">Senha</label>
      <input class="in" id="p" name="password" type="password" autocomplete="current-password" ${user ? 'autofocus' : ''}>
    </div>
    <button class="btn" type="submit">Entrar</button>
  </form>
  <div class="foot">Acesso restrito · ${esc(config.lojaNome)}</div>
</div></body></html>`;
}

// Segundo passo do login: os 6 dígitos do app autenticador. Mesmo cartão da
// tela de senha para não parecer outro site no meio do caminho.
//
// inputmode="numeric" abre o teclado numérico no celular, e autocomplete
// "one-time-code" faz iOS e Android oferecerem o código sem sair do app.
function codigoPage({ erro = '', next = '/admin', pendente = '' } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Código · ${esc(config.lojaNome)} Admin</title>
<style>
  :root{--bg:#0b0a0f;--card:#15131d;--line:#272233;--ink:#f3f0f8;--soft:#a39fb0;--brand:#8b2fe8}
  ${adminCorVars()}
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:var(--bg);color:var(--ink);
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px}
  body::before{content:"";position:fixed;inset:0;pointer-events:none;
    background:radial-gradient(420px 300px at 50% 0%,rgba(var(--brand-rgb),.20),transparent 70%),
               radial-gradient(520px 340px at 50% 100%,rgba(var(--brand-rgb),.10),transparent 70%)}
  .box{position:relative;width:100%;max-width:380px}
  .brand{text-align:center;margin-bottom:22px}
  .brand .lg{font-size:26px;font-weight:800;letter-spacing:-.02em}
  .brand .lg b{color:var(--brand)}
  .brand .sb{color:var(--soft);font-size:13px;margin-top:6px}
  form{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;
    box-shadow:0 18px 50px rgba(0,0,0,.45)}
  label{display:block;font-size:12px;color:var(--soft);margin-bottom:6px}
  .in{width:100%;background:#0e0d14;border:1.5px solid var(--line);border-radius:10px;color:var(--ink);
    padding:12px 13px;font-size:22px;font-family:inherit;text-align:center;letter-spacing:.34em}
  .in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(var(--brand-rgb),.18)}
  .btn{width:100%;background:var(--brand);color:#fff;border:none;border-radius:10px;
    padding:13px 16px;font-weight:700;font-size:14.5px;cursor:pointer;margin-top:14px}
  .btn:hover{filter:brightness(1.08)}
  .err{background:#4a1620;color:#f0a3ae;border-radius:10px;padding:11px 13px;font-size:13px;margin-bottom:16px}
  .foot{color:#6b6577;font-size:12px;text-align:center;margin-top:18px;line-height:1.6}
</style></head><body>
<div class="box">
  <div class="brand"><div class="lg">${marcaAdmin()}</div><div class="sb">Código de verificação</div></div>
  <form method="post" action="/admin/login/2fa">
    ${erro ? `<div class="err">${esc(erro)}</div>` : ''}
    <input type="hidden" name="next" value="${esc(next)}">
    <input type="hidden" name="pendente" value="${esc(pendente)}">
    <label for="c">Código do app autenticador</label>
    <input class="in" id="c" name="codigo" inputmode="numeric" autocomplete="one-time-code"
      autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="11" autofocus>
    <button class="btn" type="submit">Entrar</button>
  </form>
  <div class="foot">Perdeu o celular? use um dos seus<br>códigos de emergência no mesmo campo.</div>
</div></body></html>`;
}

// Sem ADMIN_PASSWORD configurada, o painel inteiro fica desligado.
router.use((req, res, next) => {
  if (!config.admin.password) {
    return res.status(503).send('Painel /admin desativado: defina ADMIN_PASSWORD nas variáveis de ambiente.');
  }
  next();
});

// GET /admin/login — fica antes do guard, senão não teria como aparecer.
// A marca do painel vinha escrita na marra como NATION47 — resquício da cópia,
// e a primeira coisa que se vê ao entrar. Agora sai de LOJA_NOME: a última
// palavra fica em roxo, que era o papel do <b> no "47". "A Fonte" vira
// A <b>FONTE</b>; qualquer outra loja que use este código acerta sozinha.
function marcaAdmin() {
  const nome = String(config.lojaNome || 'Loja').trim();
  const i = nome.lastIndexOf(' ');
  if (i < 0) return esc(nome.toUpperCase());
  return `${esc(nome.slice(0, i).toUpperCase())} <b>${esc(nome.slice(i + 1).toUpperCase())}</b>`;
}

// A logo da loja no painel, no lugar do nome escrito. Sai da MESMA fonte da
// vitrine (logoDaLoja), então a arte enviada pelo /admin → Visual vale aqui
// também, e o `?v=` dela já cuida do cache. Fundo 'escura' porque o painel é
// quase preto. Sem arte configurada, cai no nome escrito de antes — em painel
// nenhum um <img src=""> quebrado é melhor que o nome da loja.
function marcaAdminLogo(cls) {
  const src = logoDaLoja(getCustomization(), 'escura');
  return src
    ? `<img class="${cls}" src="${esc(src)}" alt="${esc(config.lojaNome)}">`
    : marcaAdmin();
}

// A cor do painel sai da mesma personalização da loja (colors.brand, o roxo do
// grafite). Antes era #8b2fe8 cravado em dois :root — o roxo VIVO da Nation,
// que não tinha mais nada a ver com a marca daqui.
//
// A troca não é direta: o painel é quase preto (#0b0a0f) e o roxo da A Fonte
// (#4d2a85) é escuro. Cru, o botão de entrar ficaria a 1.8:1 do fundo, abaixo
// dos 3:1 que a WCAG pede para um controle se distinguir do que está atrás —
// um botão que some no fundo da tela de login. Por isso o --brand do painel é
// o tom CLAREADO: 3.4:1 contra o fundo e 5.7:1 com o texto branco por cima.
// É o mesmo ajuste que a vitrine precisou fazer no --brand-xd quando a marca
// passou de um roxo vivo para este.
//
// --brand-rgb existe para os rgba() dos brilhos e do anel de foco, que precisam
// da cor em componentes. Trocar a cor no /admin → Visual leva as duas junto.
function adminCorVars() {
  const claro = softTint(getCustomization().colors.brand, 0.22);
  const [r, g, b] = hexRgb(claro);
  return `:root{--brand:${claro};--brand-rgb:${r},${g},${b}}`;
}

router.get('/login', (req, res) => {
  if (temSessao(req)) return res.redirect(destinoSeguro(req.query.next));
  res.type('html').send(loginPage({ next: destinoSeguro(req.query.next) }));
});

// Registra a tentativa no diário e avisa o celular. Uma função só para os
// dois porque nunca se quer um sem o outro: registro sem aviso só é visto
// quando já deu ruim, aviso sem registro não deixa conferir depois com calma.
//
// Nada aqui pode derrubar o login: o push sai sem await e com o erro engolido
// — servidor de push fora do ar não é motivo pra ninguém ficar sem entrar no
// próprio painel.
function anotarAcesso(req, resultado) {
  const ip = req.ip || 'sem-ip';
  const userAgent = String(req.headers['user-agent'] || '');
  // Gravação sem await e com o erro engolido, como era antes: banco fora do ar
  // não pode impedir ninguém de entrar no próprio painel. O `emSegundoPlano` é
  // o que garante que ela termina mesmo depois de a resposta sair — na Vercel a
  // instância pode ser congelada nesse instante (ver segundoPlano.js).
  emSegundoPlano(
    registrarAcesso({ ip, resultado, usuario: String(req.body?.user || ''), userAgent }),
    'diário de acesso',
  );
  notificarAcessoAdmin({ resultado, ip, userAgent })
    .catch((e) => console.error('[admin] push de acesso falhou:', e.message));
}

function entrar(req, res, destino) {
  limparFalhas(req.ip || 'sem-ip');
  darSessao(req, res);
  anotarAcesso(req, 'ok');
  res.redirect(destino);
}

router.post('/login', (req, res) => {
  const destino = destinoSeguro(req.body?.next);
  const ip = req.ip || 'sem-ip';
  const espera = bloqueado(ip);
  if (espera) {
    anotarAcesso(req, 'bloqueio');
    return res.status(429).type('html').send(loginPage({
      next: destino,
      user: String(req.body?.user || ''),
      erro: `Tentativas demais. Espere ${espera < 60 ? `${espera} segundos` : `${Math.ceil(espera / 60)} minutos`} e tente de novo.`,
    }));
  }
  if (!credenciaisOk(req.body?.user, req.body?.password)) {
    registrarFalha(ip);
    console.warn(`[admin] login negado (ip ${ip})`);
    anotarAcesso(req, 'senha');
    // Mensagem única de propósito: dizer qual campo errou entrega ao invasor
    // que o usuário existe.
    return res.status(401).type('html').send(loginPage({
      next: destino,
      user: String(req.body?.user || ''),
      erro: 'Usuário ou senha incorretos.',
    }));
  }
  // Senha certa. Com 2FA ligado, ainda NÃO há sessão: só um bilhete de 5 min
  // dizendo "este passou pela senha", que sozinho não abre nada.
  if (doisFatoresAtivo()) {
    return res.type('html').send(codigoPage({ next: destino, pendente: criarPendente() }));
  }
  entrar(req, res, destino);
});

// Segundo passo: os 6 dígitos do app (ou um código de emergência).
router.post('/login/2fa', (req, res) => {
  const destino = destinoSeguro(req.body?.next);
  const ip = req.ip || 'sem-ip';
  const espera = bloqueado(ip);
  if (espera) {
    anotarAcesso(req, 'bloqueio');
    return res.status(429).type('html').send(loginPage({ next: destino,
      erro: `Tentativas demais. Espere ${espera < 60 ? `${espera} segundos` : `${Math.ceil(espera / 60)} minutos`} e tente de novo.` }));
  }
  // Bilhete inválido ou vencido: volta pro começo. Sem isto, bastaria postar
  // direto nesta rota com um código qualquer, pulando a senha inteira.
  if (!pendenteValido(req.body?.pendente)) {
    return res.status(401).type('html').send(loginPage({ next: destino,
      erro: 'A tela de código expirou. Entre com a senha de novo.' }));
  }
  if (!verificarDoisFatores(req.body?.codigo)) {
    // Conta no MESMO freio da senha: são 6 dígitos, e sem isto dava pra varrer
    // o milhão de combinações com o bilhete de 5 minutos na mão.
    registrarFalha(ip);
    anotarAcesso(req, '2fa');
    return res.status(401).type('html').send(codigoPage({ next: destino,
      pendente: criarPendente(), erro: 'Código incorreto. Confira o app e tente de novo.' }));
  }
  entrar(req, res, destino);
});

router.post('/logout', (req, res) => {
  tirarSessao(req, res);
  res.redirect('/admin/login');
});

// --- Peças do aplicativo (PWA) ---
//
// Manifesto e service worker ficam ANTES do guard de propósito. Não contêm
// nada sigiloso, e se pedissem sessão o celular quebraria de dois jeitos: o
// navegador busca o manifesto sem cookie em algumas situações, e a checagem
// periódica que ele faz do service worker receberia o HTML da tela de login em
// vez de JavaScript — o registro seria descartado e as notificações parariam
// de chegar sem aviso, justamente depois que a sessão vencesse.

// O escopo do service worker é a pasta onde ele é servido: em /admin/sw.js ele
// enxerga /admin/* e mais nada. É o que se quer — a loja do cliente segue
// intocada, sem service worker nenhum.
router.get('/sw.js', (_req, res) => {
  // Sem este cabeçalho o escopo máximo de um arquivo em /admin/sw.js é
  // "/admin/" COM barra — e aí a própria home do painel ("/admin", sem barra,
  // que é o start_url do app) ficaria fora do escopo: o Android abriria os
  // links do painel numa aba do navegador em vez de manter dentro do app, e o
  // Chrome poderia nem oferecer a instalação. O cabeçalho autoriza "/admin".
  res.setHeader('Service-Worker-Allowed', '/admin');
  res.type('application/javascript').send(`// Service worker do painel — notificação de pedido.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Sem cache offline: o painel é dinâmico e mostrar pedido velho seria pior que
// mostrar erro de conexão. O listener existe porque o navegador só considera o
// site "instalável" quando o service worker trata fetch — este deixa passar.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (err) { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || 'Pedido', {
    body: d.body || '',
    // A LOGO DA LOJA no canto direito, a pedido do dono (29/08/2026).
    //
    // Aqui ia um PNG 100% transparente (notificacao-vazia-192.png), e a razão
    // era boa: não existe "não mostre nada" nesta API — omitir o icon faz o
    // Chrome desenhar um círculo cinza com a inicial do app, então mandava-se
    // algo invisível para o espaço sumir. A decisão agora é outra: o cartão da
    // notificação leva a marca, como qualquer app de loja.
    // O arquivo vazio fica no repositório para quem quiser desfazer.
    //
    // O icon é colorido e grande; o badge é a silhueta monocromática que o
    // Android põe na barra de status — são artes DIFERENTES e as duas já são
    // da A Fonte. Trocar a logo pede reexportar as duas.
    icon: '/assets/app/notificacao-logo-192.png',
    badge: '/assets/app/badge.png',
    tag: d.tag || undefined,
    // Com tag, o pago SUBSTITUI o "PIX gerado" do mesmo pedido em vez de
    // empilhar dois cartões. renotify faz o celular vibrar de novo na troca.
    renotify: !!d.tag,
    data: { url: d.url || '/admin' },
    vibrate: [180, 90, 180],
  }));
});

// Tocar na notificação abre o pedido. Se o app já estiver aberto, reaproveita
// a janela em vez de abrir outra — senão o Android vai juntando abas do painel.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (j.url.indexOf('/admin') !== -1) {
        await j.focus();
        if ('navigate' in j) { try { await j.navigate(alvo); } catch (err) { /* já está nela */ } }
        return;
      }
    }
    await self.clients.openWindow(alvo);
  })());
});
`);
});

router.get('/app.webmanifest', (_req, res) => {
  res.type('application/manifest+json').json({
    name: `${config.lojaNome} · Admin`,
    // Sai do LOJA_NOME porque este mesmo código roda a Knife Lab noutro
    // serviço do Render — fixar 'N47' poria o nome errado no ícone dela.
    short_name: `${config.lojaNome} Admin`.slice(0, 22),
    description: `Painel de pedidos da ${config.lojaNome}`,
    // start_url e scope dentro de /admin: abrir o app cai direto nos pedidos,
    // e um link pra loja abre no navegador em vez de sequestrar o app.
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0a0f',
    theme_color: '#0b0a0f',
    lang: 'pt-BR',
    icons: [
      // NÃO TROQUE ESTE CONJUNTO SEM LER. Ao instalar, o Chrome manda este
      // manifesto para um servidor do Google que MONTA o aplicativo. Quando essa
      // montagem falha o Chrome não dá erro: ou cria um ATALHO no lugar do app,
      // ou fica em "instalando" para sempre. Atalho devolve a notificação para o
      // Chrome, com o ícone dele — que é como o problema aparece pro dono.
      // Em 19/08/2026 troquei os três ícones de uma vez (arte nova, nomes novos,
      // e o comum e o mascarável no MESMO arquivo) e a instalação parou de
      // funcionar. Com três mudanças juntas não deu para saber qual quebrou.
      // Este é o conjunto que instala certo, verificado no aparelho do dono.
      // Para mudar a arte: um arquivo por vez, testando instalação entre um e
      // outro.
      // Havia aqui a menção a "um conjunto pronto com N roxo (icone-n-*.png)".
      // Conferido por hash em 29/08/2026: os icone-n-* são cópias BYTE A BYTE
      // dos icone-*, ou seja, já são a arte da A Fonte. O "n" ficou só no nome,
      // de quando o par existia — não há conjunto alternativo nenhum.
      { src: '/assets/app/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/app/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // maskable é ARQUIVO SEPARADO porque o Android recorta o ícone no
      // formato do sistema (círculo, pétala, quadrado arredondado). O logo da
      // Nation é largo: no arquivo "any" ele ocupa quase toda a largura, e num
      // recorte circular as pontas do "N" e do "7" seriam decepadas. Esta
      // versão traz o mesmo logo menor, todo dentro da área que nunca é cortada.
      { src: '/assets/app/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

// Guard: cookie de sessão OU Basic (script/curl continuam funcionando). O que
// não existe mais é o `WWW-Authenticate` na resposta — era ele que abria o
// popup do navegador. Sem sessão, o navegador vai pra tela de login.
router.use((req, res, next) => {
  if (temSessao(req) || basicOk(req)) {
    // Renova a sessão a cada tela aberta. Sem isto o app instalado no celular
    // cobraria senha a cada 12h corridas mesmo em uso diário — e o ponto de
    // ter um ícone na tela de início é abrir e já estar dentro. Continua
    // caducando 12h depois do ÚLTIMO acesso, não do login.
    if (req.method === 'GET' && temSessao(req)) darSessao(req, res);
    return next();
  }
  if (req.method === 'GET') {
    const alvo = destinoSeguro(req.originalUrl.split('?')[0]);
    return res.redirect(`/admin/login?next=${encodeURIComponent(alvo)}`);
  }
  return res.status(401).send('Sessão expirada. Entre de novo em /admin/login.');
});

const STATUS_BADGE = {
  paid: '<span class="b b-paid">Pago</span>',
  pending: '<span class="b b-pend">Aguardando PIX</span>',
};

function layout(title, inner, tab = 'orders') {
  const nav = (id, href, label) =>
    `<a href="${href}" class="nav ${tab === id ? 'on' : ''}">${label}</a>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · ${esc(config.lojaNome)} Admin</title>
<link rel="manifest" href="/admin/app.webmanifest">
<meta name="theme-color" content="#0b0a0f">
<meta name="robots" content="noindex,nofollow">
<!-- O iPhone ignora o manifesto na hora de escolher o ícone da tela de início:
     sem apple-touch-icon ele salva um print encolhido da página. -->
<link rel="apple-touch-icon" sizes="180x180" href="/assets/app/icone-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="${esc(config.lojaNome)} Admin">
<style>
  :root{--bg:#0b0a0f;--card:#15131d;--line:#272233;--ink:#f3f0f8;--soft:#a39fb0;--volt:#d4ff3d;--green:#2e9e4f}
  ${adminCorVars()}
  /* O painel é escuro, mas sem isto o navegador desenha os controles NATIVOS
     como se ele fosse claro: no <input type="date"> o ícone do calendário sai
     preto sobre campo quase preto e some, e o calendário que abre vem branco.
     Vale também para as setas do <select> e a barra de rolagem. */
  :root{color-scheme:dark}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px}
  a{color:#c79bff;text-decoration:none}a:hover{text-decoration:underline}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:16px 22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2;
    /* instalado no iPhone a página começa colada na barra de status; o inset
       devolve o espaço do notch sem afetar quem abre no navegador (vale 0). */
    padding-top:calc(16px + env(safe-area-inset-top))}
  header .logo{font-weight:800;letter-spacing:-.02em;font-size:18px;
    display:flex;align-items:center;gap:9px;min-width:0}
  header .logo b{color:var(--brand)}
  /* 30px é o teto sem engordar a barra: as abas ao lado têm ~33px de altura, e
     o cabeçalho é sticky — cada pixel a mais come tela no celular. Abaixo disso
     o grafite vira borrão, que é o que acontecia em 26px. */
  header .logo img{height:30px;width:auto;flex:none;display:block}
  /* no celular o "· Admin" ao lado da arte espremia as abas para fora da tela */
  @media(max-width:560px){header .logo .sfx{display:none}}
  header nav{display:flex;gap:6px}
  .nav{padding:7px 14px;border-radius:9px;color:var(--soft);font-weight:600}
  .nav:hover{color:var(--ink);text-decoration:none}
  .nav.on{background:var(--brand);color:#fff}
  /* "Sair" é POST (um GET dava logout com link de fora), então é um button
     vestido de aba pra não destoar do resto do nav. */
  .navout{margin-left:auto}
  .navbtn{background:none;border:1px solid var(--line);font:inherit;font-weight:600;
    color:var(--soft);padding:6px 13px;border-radius:9px;cursor:pointer}
  .navbtn:hover{color:var(--ink);border-color:#3b3350}
  .gw{display:grid;gap:14px;max-width:640px}
  .gw-opt{display:flex;align-items:center;gap:14px;background:var(--card);border:1.5px solid var(--line);
    border-radius:14px;padding:16px 18px;cursor:pointer;transition:border-color .12s}
  .gw-opt.sel{border-color:var(--brand)}
  .gw-opt input{width:18px;height:18px;accent-color:var(--brand);flex:none}
  .gw-opt .nm{font-weight:700;font-size:16px}
  .gw-opt .meta{color:var(--soft);font-size:13px;margin-top:3px}
  .pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-left:auto}
  .pill.ok{background:#123d22;color:#7ee29a}.pill.no{background:#4a1620;color:#f0a3ae}
  .pill.cur{background:var(--brand);color:#fff}
  .note{background:#3d3312;color:#e2cf7e;border-radius:10px;padding:11px 14px;font-size:13px}
  .saved{background:#123d22;color:#7ee29a;border-radius:10px;padding:11px 14px;font-size:13px}
  .sec{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px;max-width:720px}
  .sec h3{margin:0 0 4px;font-size:15px}.sec .hint{color:var(--soft);font-size:12.5px;margin:0 0 14px}
  .fld{margin-bottom:12px}.fld label{display:block;font-size:12px;color:var(--soft);margin-bottom:5px}
  .in{width:100%;background:#0e0d14;border:1.5px solid var(--line);border-radius:10px;color:var(--ink);
    padding:10px 12px;font-size:14px;font-family:inherit}
  .in:focus{outline:none;border-color:var(--brand)}
  textarea.in{min-height:190px;resize:vertical;line-height:1.55}
  /* Calendário BRANCO. O painel inteiro é color-scheme:dark, e é dele que a
     janelinha do calendário herdava o fundo escuro — então o esquema claro
     volta só nos campos de data.
     O efeito colateral é que o ícone voltaria a nascer preto (foi assim que
     ele sumiu no fundo #0e0d14); o invert devolve o desenho branco. Os dois
     andam juntos: mexer num sem o outro traz o problema de volta. */
  input[type=date]{color-scheme:light}
  /* O ícone padrão tem ~13px e nasce translúcido: contra o campo #0e0d14 mal
     se enxerga. Branco puro, opaco e maior — e um pouco de fundo no hover,
     para ficar claro que é botão. */
  input[type=date]::-webkit-calendar-picker-indicator{
    filter:invert(1);opacity:1;cursor:pointer;
    width:20px;height:20px;margin-left:8px;padding:2px;border-radius:6px}
  input[type=date]::-webkit-calendar-picker-indicator:hover{background:rgba(255,255,255,.16)}
  .row3{display:grid;grid-template-columns:110px 1fr 120px 1fr;gap:8px;align-items:center;margin-bottom:8px}
  .colorrow{display:flex;gap:16px;flex-wrap:wrap}
  .colorrow .c{display:flex;flex-direction:column;gap:6px}
  .colorrow input[type=color]{width:60px;height:40px;border:1px solid var(--line);border-radius:8px;background:none;cursor:pointer}
  .chkline{display:flex;align-items:center;gap:9px;font-size:14px;margin-bottom:12px}
  /* Cada oferta num quadro próprio: são 5 campos repetidos 4 vezes, e sem a
     separação vira uma coluna de 20 inputs em que ninguém acha o que é de quem
     (o painel se usa no celular). */
  .bumpslot{border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px}
  .bumpnum{font-size:12px;font-weight:700;color:var(--soft);text-transform:uppercase;
    letter-spacing:.06em;margin-bottom:10px}
  .chkline input{width:18px;height:18px;accent-color:var(--brand)}
  .muted2{color:var(--soft);font-size:12px}
  @media(max-width:640px){.row3{grid-template-columns:1fr 1fr;}
    /* No celular os chips não cabem na mesma linha do rótulo e quebram pra
       baixo dele, deixando a fileira desalinhada. Rótulo em cima resolve. */
    .filtro-l{align-items:flex-start}
    .filtro-l .lbl{width:100%;min-width:0;margin-bottom:1px}}
  .wrap{max-width:1100px;margin:0 auto;padding:22px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:22px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
  .stat .k{color:var(--soft);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .stat .v{font-size:24px;font-weight:800;margin-top:6px}
  .stat .v.green{color:var(--volt)}
  /* Segunda linha do cartao: o valor parado em pendentes acompanha a
     contagem, senao "12 pendentes" nao diz se sao R$ 12 ou R$ 1.200. */
  .stat .sub{color:var(--soft);font-size:12px;margin-top:4px}
  /* Texto de apoio das abas. Nasceu com a aba Upsell; sobreviveu a ela porque
     "Mais vendidos" usa os dois — o resto do bloco (.funil, .fun*, .cnt) saiu
     junto com as abas Upsell e Recuperação em 29/08/2026. */
  .lead{color:var(--soft);font-size:14px;line-height:1.6;max-width:70ch;margin:-6px 0 20px}
  .lead b{color:var(--ink)}
  .rodape{color:var(--soft);font-size:12.5px;line-height:1.6;max-width:70ch;margin-top:24px}
  .filters{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  .chip{padding:7px 14px;border:1px solid var(--line);border-radius:999px;color:var(--soft)}
  .chip.on{background:var(--brand);border-color:var(--brand);color:#fff}
  /* --- ranking de mais vendidos --- */
  /* Uma linha de filtro por eixo (período, categoria, quantidade). O rótulo de
     largura fixa alinha os três: sem ele as fileiras de chips começam em
     colunas diferentes e param de parecer o mesmo controle. */
  .filtro-l{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px}
  .filtro-l .lbl{color:var(--soft);font-size:12px;text-transform:uppercase;
    letter-spacing:.04em;min-width:78px}
  .filtro-l .chip{padding:6px 13px;font-size:13px}
  /* Calendário da aba Pedidos. O .in do painel é largura cheia (nasceu para
     formulário de uma coluna); aqui ele divide a linha com o "até" e o botão,
     então volta a ter a largura do próprio conteúdo. */
  .filtro-l .in{width:auto;padding:6px 10px;font-size:13px}
  .filtro-l .btn{width:auto;margin:0;padding:7px 15px;font-size:13px}
  .filtro-l .ate{color:var(--soft);font-size:13px}
  .rk-pos{font-weight:800;font-variant-numeric:tabular-nums;color:var(--soft);width:1%}
  .rk-pos.top{color:var(--volt)}
  /* A célula do produto é a única que pode quebrar linha: com nowrap (padrão da
     tabela) o título empurra faturamento e numeração pra fora da tela. */
  .rk-prod{display:flex;align-items:flex-start;gap:11px;white-space:normal;min-width:230px}
  .rk-img{display:block;width:46px;height:46px;flex:none;border-radius:9px;object-fit:cover;
    background:#0e0d14;border:1px solid var(--line)}
  .rk-prod .nm{font-weight:600;line-height:1.35}
  .rk-prod .sub{display:block;color:var(--soft);font-size:12px;margin-top:2px}
  /* Barra proporcional ao 1º lugar: mostra de relance se o líder dispara ou se
     o topo está embolado — o que uma coluna de números sozinha não conta. */
  .rk-bar{display:block;height:5px;border-radius:999px;background:var(--line);
    margin-top:7px;max-width:210px;overflow:hidden}
  .rk-bar i{display:block;height:100%;background:var(--brand);border-radius:999px}
  .tag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;
    background:#2a2338;color:#c79bff;white-space:nowrap}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
  th{color:var(--soft);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#1b1826}
  tr.sel td{background:#1d1a28;box-shadow:inset 3px 0 0 var(--brand)}
  /* Linha de total do faturamento por dia: usa th (nao e dado, e soma),
     mas o th padrao e minusculo e apagado demais para um valor em reais. */
  tfoot th{background:#1b1826;color:var(--ink);font-size:13px;text-transform:none;letter-spacing:0;border-bottom:none}
  tfoot th.r{font-weight:800}
  tbody td a{color:var(--ink);text-decoration:none;border-bottom:1px dotted var(--soft)}
  tbody td a:hover{color:var(--volt);border-bottom-color:var(--volt)}
  .b{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}
  .b-paid{background:#123d22;color:#7ee29a}.b-pend{background:#3d3312;color:#e2cf7e}
  .b-ship{background:#1b2b4a;color:#8fbaf5}
  .r{text-align:right}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .btn{display:inline-block;background:var(--brand);color:#fff;border:none;border-radius:10px;
    padding:9px 16px;font-weight:700;cursor:pointer;font-size:13px}
  .btn.g{background:var(--green)}
  /* Contato do cliente: abrir a conversa e copiar o número. Discretos de
     propósito — repetem em toda linha da lista e não podem competir com o
     valor do pedido. */
  .ct{display:inline-flex;align-items:center;gap:5px;vertical-align:middle}
  .ct a,.ct button{display:inline-flex;align-items:center;gap:5px;cursor:pointer;
    border:1px solid var(--line);background:none;border-radius:8px;padding:4px 8px;
    font:inherit;font-size:12px;line-height:1;color:var(--soft);text-decoration:none;
    white-space:nowrap;transition:color .15s,border-color .15s,background .15s}
  .ct a:hover{color:#7ee29a;border-color:#2f6a45;background:#122b1d}
  .ct button:hover{color:var(--ink);border-color:var(--line2,#3a3350)}
  .ct a:focus-visible,.ct button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
  .ct svg{width:13px;height:13px;flex:none}
  .ct .ok{color:#7ee29a;border-color:#2f6a45}
  .ct .ok svg,.ct .ok b{display:none}
  .ct .ok::before{content:"copiado"}
  .ct .ok.cp--i::before{content:"✓"}
  .back{color:var(--soft);margin-bottom:14px;display:inline-block}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
  .box h3{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--soft)}
  .kv{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px dashed var(--line)}
  .kv:last-child{border-bottom:none}.kv .kk{color:var(--soft)}.kv .vv{text-align:right;word-break:break-word}
  .copybox{background:#0e0d14;border:1px solid var(--line);border-radius:10px;padding:10px;
    font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all;margin-top:6px}
  @media(max-width:720px){.grid{grid-template-columns:1fr}.wrap{padding:14px}
    table{display:block;overflow-x:auto}
    /* O header era uma linha flex sem wrap. Com a 4a aba (Catálogo) o nav
       passa da largura do celular e a ultima aba fica fora da tela — some sem
       deixar rastro, porque nao havia nem quebra nem rolagem. Agora o nav cai
       pra linha de baixo e rola na horizontal se precisar. */
    /* Repete o inset do notch: esta regra sobrescreve o padding do header, e
       sem repetir aqui o iPhone instalado perderia o espaco da barra de status
       — justamente no unico aparelho onde isso importa. */
    header{flex-wrap:wrap;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top))}
    /* Com 7 abas o menu passa da largura do celular. Ele rola, mas rolagem
       sem marca nenhuma nao se ve: este esmaecido na borda direita e o aviso
       de que ha mais aba pro lado. Ja aconteceu de uma aba nova sumir aqui. */
    header::after{content:"";position:absolute;right:0;bottom:0;height:42px;width:36px;
      pointer-events:none;background:linear-gradient(90deg,transparent,var(--bg))}
    header nav{width:100%;overflow-x:auto;scrollbar-width:none}
    header nav::-webkit-scrollbar{display:none}
    .nav{padding:7px 12px;white-space:nowrap}}
</style></head><body>
<header><span class="logo">${marcaAdminLogo('')}<span class="sfx">Admin</span></span>
<nav>${nav('orders', '/admin', 'Pedidos')}${nav('ranking', '/admin/ranking', 'Mais vendidos')}${nav('catalog', '/admin/catalogo', 'Catálogo')}${nav('gateway', '/admin/gateway', 'Gateway')}${nav('whats', '/admin/whatsapp', 'WhatsApp')}${nav('email', '/admin/email', 'E-mail')}${nav('custom', '/admin/personalizar', 'Personalização')}${nav('app', '/admin/app', 'App')}${nav('seg', '/admin/seguranca', 'Segurança')}
<form class="navout" method="post" action="/admin/logout"><button class="navbtn" type="submit">Sair</button></form></nav></header>
<div class="wrap">${inner}</div>
<script>
// Copiar número do cliente. Delegado no documento porque os botões aparecem em
// toda linha da lista — um ouvinte por linha seria lixo à toa.
//
// navigator.clipboard só existe em https (ou localhost). Se o painel for
// aberto por IP na rede local, ela nem é definida — daí o textarea +
// execCommand, que é feio mas é o que continua funcionando. Sem isso o botão
// não faria nada e pareceria quebrado.
document.addEventListener('click', function (ev) {
  var b = ev.target.closest ? ev.target.closest('[data-copiar]') : null;
  if (!b) return;
  var txt = b.getAttribute('data-copiar');
  var feito = function () {
    b.classList.add('ok');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.remove('ok'); }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(feito, function () { manual(txt, feito); });
  } else {
    manual(txt, feito);
  }
});
function manual(txt, feito) {
  var ta = document.createElement('textarea');
  ta.value = txt;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); feito(); } catch (e) { window.prompt('Copie o número:', txt); }
  document.body.removeChild(ta);
}
</script>
</body></html>`;
}

// Contato do cliente em um clique: abrir a conversa no WhatsApp e copiar o
// número. São dois usos diferentes — recuperar PIX abandonado é conversa, e
// copiar serve pra colar em qualquer outro lugar.
//
// O wa.me quer DDI + DDD + número só em dígitos. `telefoneDigitos` cuida da
// armadilha do "55": ele só é código de país em número de 12 ou 13 dígitos —
// com 10 ou 11 é o DDD de Santa Maria, e cortar estragaria o número de todo
// cliente de lá. Telefone inválido não ganha botão: link pra número quebrado
// abre conversa com desconhecido.
const ICONE_ZAP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2'
  + 'l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/>'
  + '<path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1l-.7 1c-.1.2-.3.2-.5.1-1.2-.5-2.3-1.5'
  + '-3-2.7-.1-.2 0-.4.1-.5l.5-.6c.1-.2.1-.3 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4'
  + '-.7.7-.9 1.7-.6 2.7.6 1.9 2.6 4.4 5.2 5.4 1.3.5 2.3.6 3 .3.5-.2 1-.7 1.2-1.2.1-.4.1-.7 0-.8z"/></svg>';
const ICONE_COPIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
  + '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';

function contatoCliente(phone, { compacto = false } = {}) {
  if (!telefoneValido(phone)) return '';
  const d = telefoneDigitos(phone);
  const e164 = toE164(phone); // +5547997229918 — formato que cola em qualquer lugar
  const zap = `<a href="https://wa.me/55${d}" target="_blank" rel="noopener"
    title="Abrir conversa no WhatsApp">${ICONE_ZAP}${compacto ? '' : '<b>WhatsApp</b>'}</a>`;
  const copiar = `<button type="button" class="${compacto ? 'cp--i' : ''}" data-copiar="${esc(e164)}"
    title="Copiar ${esc(e164)}">${ICONE_COPIA}${compacto ? '' : '<b>copiar</b>'}</button>`;
  return `<span class="ct">${zap}${copiar}</span>`;
}

// Rótulo do dia: "hoje", "ontem" ou "seg, 18/08". A data vem como YYYY-MM-DD
// e é montada ao MEIO-DIA UTC de propósito — à meia-noite o fuso negativo do
// Brasil jogaria o Date pro dia anterior e a tabela mostraria tudo defasado.
function rotuloDia(dia, hoje) {
  const d = new Date(`${dia}T12:00:00Z`);
  const ontem = new Date(`${hoje}T12:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const ontemStr = ontem.toISOString().slice(0, 10);
  if (dia === hoje) return 'hoje';
  if (dia === ontemStr) return 'ontem';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC',
  });
}

// Soma dias a uma data YYYY-MM-DD. Meio-dia UTC de propósito: em qualquer fuso
// do Brasil isso continua no mesmo dia civil, então somar 1 nunca pula dois.
function somaDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Rótulo do recorte. Um dia só continua sendo "hoje"/"ontem"/"seg, 25/08"; num
// intervalo vira "01/08 a 28/08", que é como a pessoa leu no calendário.
function rotuloPeriodo(de, ate, hoje) {
  if (de === ate) return rotuloDia(de, hoje);
  const dm = (s) => s.split('-').reverse().slice(0, 2).join('/');
  return `${dm(de)} a ${dm(ate)}`;
}

// Quantos % dos PIX gerados viraram venda. Dia sem movimento nenhum devolve
// '—' em vez de 0%, que sugeriria fracasso onde não houve tentativa.
function conversao(pagas, pendentes) {
  const t = pagas + pendentes;
  if (!t) return '—';
  return `${Math.round((pagas / t) * 100)}%`;
}

// GET /admin — dashboard + lista
// ?status=paid|pending filtra a lista; ?dia=YYYY-MM-DD recorta um dia.
// Dentro de um dia, ?status=pending mostra os PIX gerados e não pagos.
router.get('/', async (req, res) => {
  const status = ['paid', 'pending'].includes(req.query.status) ? req.query.status : null;
  const hoje = hojeBR();

  // O recorte aceita as duas formas: 'de'/'ate' do calendário e o 'dia' de um
  // dia só, que é como a tabela de faturamento sempre linkou — e como está
  // qualquer link que alguém já tenha guardado.
  const D = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const diaQS = D(req.query.dia);
  let de = D(req.query.de) || diaQS;
  let ate = D(req.query.ate) || diaQS || de;
  if (!de && ate) de = ate;
  // Calendário preenchido ao contrário troca de lado em vez de devolver lista
  // vazia: tela vazia parece "não vendeu nada" quando o problema é a ordem.
  if (de && ate && de > ate) [de, ate] = [ate, de];
  const periodo = !!(de && ate);
  const umDia = periodo && de === ate;
  const rotulo = periodo ? rotuloPeriodo(de, ate, hoje) : '';

  // As quatro consultas vão juntas: em série seriam quatro idas ao banco em
  // fila, e agora cada ida é rede, não disco.
  const [s, porDia, orders, d] = await Promise.all([
    orderStats(),
    revenueByDay({ limit: 60 }),
    listOrders({ limit: 200, status, de, ate }),
    periodo ? statsForPeriodo(de, ate) : null,
  ]);
  const vendoPendentes = status === 'pending';

  // URL do painel preservando o que não está sendo trocado: mexer no período
  // não pode perder o filtro de pago/pendente, e vice-versa.
  const url = ({ de: xde = null, ate: xate = null, status: xst = null } = {}) => {
    const q = new URLSearchParams();
    if (xde) q.set('de', xde);
    if (xate) q.set('ate', xate);
    if (xst) q.set('status', xst);
    const qs = q.toString();
    return `/admin${qs ? `?${qs}` : ''}`;
  };

  const rows = orders.map((o) => {
    const nm = esc(o.customer?.name || '—');
    const qty = (o.items || []).reduce((a, it) => a + (it.qty || 0), 0);
    // Num recorte de dia a data que importa é a que definiu o dia: pagamento
    // pra venda, criação pro PIX abandonado.
    const quando = periodo ? (vendoPendentes ? o.createdAt : o.paidAt) : o.createdAt;
    return `<tr>
      <td class="mono">${dt(quando)}</td>
      <td>${STATUS_BADGE[o.status] || esc(o.status)}</td>
      <td>${nm} ${contatoCliente(o.customer?.phone, { compacto: true })}</td>
      <td>${qty} item${qty === 1 ? '' : 's'}</td>
      <td class="r">${brl(o.totalCents)}</td>
      <td>${o.trackingCode ? `<span class="b b-ship">Enviado</span>` : '<span style="color:#6b6577">—</span>'}</td>
      <td>${o.shopifyOrderId ? esc(o.shopifyOrderId) : '<span style="color:#6b6577">—</span>'}</td>
      <td><a href="/admin/order/${esc(o.id)}">ver →</a></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" style="color:#6b6577">${
    periodo
      ? `${vendoPendentes ? 'Nenhum PIX pendente' : 'Nenhuma venda paga'} ${umDia ? 'neste dia' : 'neste período'}.`
      : 'Nenhum pedido ainda.'
  }</td></tr>`;

  // Cartões do topo. Com um dia selecionado eles passam a ser daquele dia — é
  // o número que a pessoa foi buscar; o total geral fica no fim da linha pra
  // não perder a referência.
  const qdo = umDia ? 'no dia' : 'no período';
  const cards = periodo
    ? `<div class="stat"><div class="k">Faturamento em ${esc(rotulo)}</div><div class="v green">${brl(d.revenueCents)}</div></div>
       <div class="stat"><div class="k">Vendas ${qdo}</div><div class="v">${d.pagas}</div></div>
       <div class="stat"><div class="k">Pendentes ${qdo}</div><div class="v">${d.pendentes}</div><div class="sub">${brl(d.pendingCents)} parados</div></div>
       <div class="stat"><div class="k">Conversão ${umDia ? 'do dia' : 'do período'}</div><div class="v">${conversao(d.pagas, d.pendentes)}</div></div>
       <div class="stat"><div class="k">Faturamento total</div><div class="v">${brl(s.revenueCents)}</div></div>`
    : `<div class="stat"><div class="k">Faturamento hoje</div><div class="v green">${brl(s.hojeRevenueCents)}</div></div>
       <div class="stat"><div class="k">Vendas hoje</div><div class="v">${s.hojePedidos}</div></div>
       <div class="stat"><div class="k">Pendentes hoje</div><div class="v">${s.hojePendentes}</div><div class="sub">${brl(s.hojePendingCents)} parados</div></div>
       <div class="stat"><div class="k">Conversão hoje</div><div class="v">${conversao(s.hojePedidos, s.hojePendentes)}</div></div>
       <div class="stat"><div class="k">Faturamento total</div><div class="v">${brl(s.revenueCents)}</div></div>`;

  const somaPagas = porDia.reduce((a, x) => a + x.pagas, 0);
  const somaPend = porDia.reduce((a, x) => a + x.pendentes, 0);
  const zero = '<span style="color:#6b6577">0</span>';
  const traco = '<span style="color:#6b6577">—</span>';
  const linhasDia = porDia.map((x) => `<tr${umDia && x.dia === de ? ' class="sel"' : ''}>
      <td><a href="${url({ de: x.dia, ate: x.dia })}">${esc(rotuloDia(x.dia, hoje))}</a></td>
      <td class="mono" style="color:#6b6577">${x.dia.split('-').reverse().join('/')}</td>
      <td class="r">${x.pagas || zero}</td>
      <td class="r">${x.revenueCents ? `<b>${brl(x.revenueCents)}</b>` : traco}</td>
      <td class="r">${x.pendentes ? `<a href="${url({ de: x.dia, ate: x.dia, status: 'pending' })}">${x.pendentes}</a>` : zero}</td>
      <td class="r" style="color:var(--soft)">${x.pendingCents ? brl(x.pendingCents) : traco}</td>
      <td class="r">${conversao(x.pagas, x.pendentes)}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="color:#6b6577">Nenhum pedido ainda.</td></tr>';

  // Atalhos de calendário. São os recortes que o lojista pede todo dia; sem
  // eles, ver "os últimos 7 dias" obriga a contar no dedo a data de início.
  const ontem = somaDias(hoje, -1);
  const atalhos = [
    { nome: 'Hoje', de: hoje, ate: hoje },
    { nome: 'Ontem', de: ontem, ate: ontem },
    { nome: '7 dias', de: somaDias(hoje, -6), ate: hoje },
    { nome: '30 dias', de: somaDias(hoje, -29), ate: hoje },
    { nome: 'Este mês', de: `${hoje.slice(0, 8)}01`, ate: hoje },
  ];

  const inner = `
    <div class="cards">${cards}</div>

    <h2 style="margin:26px 0 6px">Faturamento por dia</h2>
    <p style="color:var(--soft);margin:0 0 12px">
      <b>Vendas</b> contam pelo dia em que o dinheiro entrou. <b>Pendentes</b> são
      os PIX gerados e não pagos, contados pelo dia em que foram gerados — pendente
      não tem data de pagamento. Horário de Brasília. Clique no dia para ver as
      vendas, ou no número de pendentes para ver os abandonados.
    </p>
    <table>
      <thead><tr>
        <th>Dia</th><th>Data</th>
        <th class="r">Vendas</th><th class="r">Faturamento</th>
        <th class="r">Pendentes</th><th class="r">Valor parado</th>
        <th class="r">Conversão</th>
      </tr></thead>
      <tbody>${linhasDia}</tbody>
      ${porDia.length ? `<tfoot><tr>
        <th colspan="2" style="text-align:left">Total (${porDia.length} dia${porDia.length === 1 ? '' : 's'})</th>
        <th class="r">${somaPagas}</th>
        <th class="r">${brl(porDia.reduce((a, x) => a + x.revenueCents, 0))}</th>
        <th class="r">${somaPend}</th>
        <th class="r">${brl(porDia.reduce((a, x) => a + x.pendingCents, 0))}</th>
        <th class="r">${conversao(somaPagas, somaPend)}</th>
      </tr></tfoot>` : ''}
    </table>

    <h2 style="margin:26px 0 10px">${
      periodo ? `${vendoPendentes ? 'PIX pendentes de' : 'Vendas de'} ${esc(rotulo)}` : 'Pedidos'
    }</h2>

    <form class="filtro-l" method="get" action="/admin">
      <span class="lbl">Período</span>
      <input class="in" type="date" name="de" value="${esc(de || '')}" max="${esc(hoje)}">
      <span class="ate">até</span>
      <input class="in" type="date" name="ate" value="${esc(ate || '')}" max="${esc(hoje)}">
      ${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
      <button class="btn" type="submit">Ver</button>
      ${periodo ? `<a class="chip" href="${url({ status })}">limpar</a>` : ''}
    </form>

    <div class="filtro-l">
      <span class="lbl">Atalhos</span>
      ${atalhos.map((a) => `<a class="chip ${de === a.de && ate === a.ate ? 'on' : ''}" href="${url({ de: a.de, ate: a.ate, status })}">${esc(a.nome)}</a>`).join('')}
    </div>

    <div class="filtro-l" style="margin-bottom:14px">
      <span class="lbl">Mostrar</span>
      ${periodo
        ? `<a class="chip ${!vendoPendentes ? 'on' : ''}" href="${url({ de, ate })}">Pagos (${d.pagas})</a>
           <a class="chip ${vendoPendentes ? 'on' : ''}" href="${url({ de, ate, status: 'pending' })}">Pendentes (${d.pendentes})</a>
           <a class="chip" href="${url({ status })}">todo o histórico →</a>`
        : `<a class="chip ${!status ? 'on' : ''}" href="${url()}">Todos</a>
           <a class="chip ${status === 'paid' ? 'on' : ''}" href="${url({ status: 'paid' })}">Pagos (${s.paid})</a>
           <a class="chip ${status === 'pending' ? 'on' : ''}" href="${url({ status: 'pending' })}">Pendentes (${s.pending})</a>`}
    </div>
    <table>
      <thead><tr><th>${periodo ? (vendoPendentes ? 'Gerado em' : 'Pago em') : 'Data'}</th><th>Status</th><th>Cliente</th><th>Itens</th><th class="r">Total</th><th>Envio</th><th>Shopify</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  res.type('html').send(layout('Pedidos', inner));
});

// GET /admin/order/:id — detalhe
router.get('/order/:id', async (req, res) => {
  const o = await getOrder(req.params.id);
  if (!o) return res.status(404).type('html').send(layout('Não encontrado', '<a class="back" href="/admin">← voltar</a><p>Pedido não encontrado.</p>'));
  const c = o.customer || {};
  // A gravação fica logo abaixo do item, e não numa seção separada no fim do
  // pedido: quem vai para a bancada precisa ler o texto junto da faca a que
  // ele pertence, senão sobra a chance de gravar o nome na peça errada.
  const items = (o.items || []).map((it) => {
    const grav = (it.gravacoes || []).map((g) => `<div class="kv" style="padding-left:14px">
      <span class="kk" style="color:#b8860b">⚒ gravar: <b>${esc(g.texto)}</b>${g.estilo ? ` · ${esc(g.estilo)}` : ''}</span>
      <span class="vv">${g.qty > 1 ? `× ${g.qty}` : ''}</span></div>`).join('');
    return `<div class="kv"><span class="kk">${esc(it.title || it.variantId)} × ${it.qty}</span><span class="vv">${brl((it.priceCents || 0) * (it.qty || 1))}</span></div>${grav}`;
  }).join('') || '<span style="color:#6b6577">—</span>';

  const payBtn = o.status !== 'paid'
    ? `<form method="post" action="/admin/order/${esc(o.id)}/pay" onsubmit="return confirm('Confirmar pagamento manualmente? Isto marca como pago aqui e na Shopify.')">
         <button class="btn g" type="submit">Marcar como pago</button></form>`
    : `<span class="b b-paid">Pago em ${dt(o.paidAt)}</span>`;

  const inner = `
    <a class="back" href="/admin">← voltar</a>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px">
      <h2 style="margin:0">Pedido <span class="mono">${esc(o.id)}</span></h2>
      ${payBtn}
    </div>
    <div class="grid">
      <div class="box">
        <h3>Resumo</h3>
        <div class="kv"><span class="kk">Status</span><span class="vv">${STATUS_BADGE[o.status] || esc(o.status)}</span></div>
        <div class="kv"><span class="kk">Criado</span><span class="vv">${dt(o.createdAt)}</span></div>
        <div class="kv"><span class="kk">Pago</span><span class="vv">${dt(o.paidAt)}</span></div>
        ${items}
        <div class="kv"><span class="kk">Subtotal</span><span class="vv">${brl(o.subtotalCents)}</span></div>
        ${o.discountCents ? `<div class="kv"><span class="kk">Desconto</span><span class="vv">- ${brl(o.discountCents)}</span></div>` : ''}
        <div class="kv"><span class="kk">Frete${o.shipping?.name ? ` (${esc(o.shipping.name)})` : ''}</span><span class="vv">${brl(o.shippingCents)}</span></div>
        <div class="kv"><span class="kk"><b>Total</b></span><span class="vv"><b>${brl(o.totalCents)}</b></span></div>
      </div>
      <div class="box">
        <h3>Cliente & entrega</h3>
        <div class="kv"><span class="kk">Nome</span><span class="vv">${esc(c.name)}</span></div>
        <div class="kv"><span class="kk">E-mail</span><span class="vv">${esc(c.email)}</span></div>
        <div class="kv"><span class="kk">Telefone</span><span class="vv">${esc(c.phone)}
          ${contatoCliente(c.phone)}</span></div>
        <div class="kv"><span class="kk">CPF</span><span class="vv">${esc(c.cpf)}</span></div>
        <div class="kv"><span class="kk">Endereço</span><span class="vv">${esc([c.street, c.number, c.complement].filter(Boolean).join(', '))}</span></div>
        <div class="kv"><span class="kk">Bairro / Cidade</span><span class="vv">${esc([c.neighborhood, c.city].filter(Boolean).join(' - '))} / ${esc(c.state)}</span></div>
        <div class="kv"><span class="kk">CEP</span><span class="vv">${esc(c.cep)}</span></div>
      </div>
      <div class="box">
        <h3>Pagamento</h3>
        <div class="kv"><span class="kk">Transação (gateway)</span><span class="vv mono">${esc(o.transactionId) || '—'}</span></div>
        <div class="kv"><span class="kk">Pedido Shopify</span><span class="vv mono">${esc(o.shopifyOrderId) || '—'}</span></div>
        ${o.pixCode ? `<h3 style="margin-top:14px">PIX copia-e-cola</h3><div class="copybox">${esc(o.pixCode)}</div>` : ''}
      </div>
      <div class="box">
        <h3>Envio</h3>
        <div class="kv"><span class="kk">Enviado em</span><span class="vv">${dt(o.shippedAt)}</span></div>
        ${o.trackingUrl
    ? `<div class="kv"><span class="kk">Acompanhar</span><span class="vv"><a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">${esc(o.trackingCode) || 'abrir rastreio'}</a></span></div>`
    : ''}
        ${req.query.rastreio === 'nao'
    ? '<p class="muted2" style="margin:10px 0 0;color:#a3132f">Não achamos este pedido no sistema de rastreio. Confira lá se a encomenda existe.</p>'
    : ''}
        ${o.trackingCode
    ? '<p class="muted2" style="margin:10px 0 0">O código nasce no sistema de rastreio quando o pagamento é confirmado, e o aviso ao cliente sai de lá. Nada a lançar aqui.</p>'
    : `<p class="muted2" style="margin:10px 0 0">Sem código ainda. Ele é criado no sistema de rastreio quando o pagamento é confirmado${o.status === 'paid' ? ' — se não apareceu, a chamada falhou (o motivo está no log)' : ' (este pedido ainda não foi pago)'}.</p>
       ${o.status === 'paid' ? `<form method="post" action="/admin/order/${esc(o.id)}/rastreio-buscar">
         <button class="btn" type="submit" style="margin-top:10px">Buscar no sistema de rastreio</button>
       </form>` : ''}`}
      </div>
    </div>`;
  res.type('html').send(layout(`Pedido ${o.id}`, inner));
});

// --- mais vendidos -------------------------------------------------------

// Períodos do filtro, em DIAS CIVIS de São Paulo — os mesmos que a tela de
// pedidos usa. Uma janela de "últimas 168 horas" daria um número que não bate
// com nenhuma linha da tabela de faturamento por dia.
const PERIODOS = [
  { id: 'tudo', label: 'Sempre', dias: 0 },
  { id: '90', label: '90 dias', dias: 90 },
  { id: '30', label: '30 dias', dias: 30 },
  { id: '7', label: '7 dias', dias: 7 },
  { id: 'hoje', label: 'Hoje', dias: 1 },
];
const TOPS = [10, 25, 50];

// Meia-noite do primeiro dia da janela. `dias: 1` é hoje, `7` é hoje mais os
// seis anteriores — quem escolhe "7 dias" espera a semana fechada incluindo
// hoje, não sete dias que terminam ontem.
function inicioDoPeriodo(dias) {
  if (!dias) return null;
  const d = new Date(`${hojeBR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return inicioDoDia(d.toISOString().slice(0, 10));
}

// GET /admin/ranking — o que mais vendeu, por período e categoria.
//
// Sai direto dos pedidos pagos a cada abertura da tela: não existe lista
// guardada pra ficar desatualizada, cada venda nova já entra na próxima vez
// que a página for aberta.
router.get('/ranking', async (req, res) => {
  const periodo = PERIODOS.find((p) => p.id === String(req.query.periodo)) || PERIODOS[0];
  const top = TOPS.includes(Number(req.query.top)) ? Number(req.query.top) : 10;
  const desde = inicioDoPeriodo(periodo.dias);

  // Categorias do catálogo. "Tênis" entra de qualquer jeito: é o padrão da
  // loja, e num banco importado antes da coluna `type` a consulta volta vazia
  // — sem isto o filtro que o painel existe pra ter sumiria da tela.
  const doCatalogo = (await tiposDoCatalogo()).map((t) => t.tipo);
  const tipos = doCatalogo.includes(TIPO_PRECO_UNICO) ? doCatalogo : [TIPO_PRECO_UNICO, ...doCatalogo];
  const tipo = tipos.includes(String(req.query.tipo)) ? String(req.query.tipo)
    : (req.query.tipo === 'tudo' ? null : TIPO_PRECO_UNICO);

  const filtro = { desde, tipo };
  // As três varrem os itens de todo pedido pago do período: em série a tela
  // esperaria três vezes a mesma volta ao banco.
  const [linhas, numeracoes, r] = await Promise.all([
    topProdutosVendidos({ ...filtro, limit: top }),
    numeracaoMaisVendida(filtro),
    resumoVendasProdutos(filtro),
  ]);

  // Cruza com a vitrine "Mais Vendidos" da home, que é uma lista escolhida a
  // dedo em collections.js. É o principal uso desta tela: ver quem realmente
  // vende e corrigir a vitrine quando as duas listas discordam.
  const naVitrine = new Set(CURADAS['mais-vendidos']?.handles || []);
  const lider = linhas[0]?.pares || 0;
  // Óculos não se vende aos pares. Fora do recorte de tênis a contagem vira
  // "unidades" — inclusive em "Tudo", que mistura as duas coisas.
  const unidade = tipo === TIPO_PRECO_UNICO ? ['Pares', 'Pares vendidos'] : ['Unidades', 'Unidades vendidas'];

  const qs = (over = {}) => {
    const q = { periodo: periodo.id, tipo: tipo || 'tudo', top, ...over };
    return `/admin/ranking?periodo=${q.periodo}&tipo=${encodeURIComponent(q.tipo)}&top=${q.top}`;
  };

  const rows = linhas.map((p, i) => {
    const num = numeracoes.get(p.id);
    const nome = p.handle
      ? `<a href="/produto/${esc(p.handle)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
      : esc(p.title);
    // Produto que saiu do catálogo continua no histórico, mas avisado: sem a
    // marca, uma linha que não dá pra repor parece uma linha normal.
    const situacao = p.noCatalogo
      ? (naVitrine.has(p.handle) ? '<span class="tag">na vitrine</span>' : '')
      : '<span class="tag" style="background:#3d3312;color:#e2cf7e">fora do catálogo</span>';
    return `<tr>
      <td class="rk-pos ${i < 3 ? 'top' : ''}">${i + 1}</td>
      <td>
        <div class="rk-prod">
          ${p.image ? `<img class="rk-img" src="${esc(imagemNaLargura(p.image, 120))}" alt="" loading="lazy">` : '<span class="rk-img"></span>'}
          <span>
            <span class="nm">${nome}</span> ${situacao}
            <span class="sub">${p.tipo ? esc(p.tipo) : 'sem categoria'} · última venda ${dt(p.ultimaVenda)}</span>
            <span class="rk-bar"><i style="width:${lider ? Math.round((p.pares / lider) * 100) : 0}%"></i></span>
          </span>
        </div>
      </td>
      <td class="r"><b>${p.pares}</b></td>
      <td class="r">${p.pedidos}</td>
      <td class="r">${brl(p.receitaCents)}</td>
      <td class="r">${num ? `${esc(num.numeracao)} <span class="muted2">(${num.pares})</span>` : '<span style="color:#6b6577">—</span>'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="color:#6b6577">Nenhuma venda paga ${
    periodo.dias ? 'neste período' : 'ainda'}${tipo ? ` na categoria ${esc(tipo)}` : ''}.</td></tr>`;

  const chips = (lbl, itens) => `<div class="filtro-l"><span class="lbl">${lbl}</span>${itens}</div>`;

  const inner = `
    <h2 style="margin:0 0 6px">Mais vendidos</h2>
    <p class="lead">Ranking pelo número de <b>pares vendidos</b>, contando só pedido <b>pago</b> — PIX gerado e
      abandonado não entra. Sai direto dos pedidos toda vez que você abre esta tela, então cada venda nova já
      aparece aqui sem precisar mexer em nada.</p>

    ${chips('Período', PERIODOS.map((p) =>
      `<a class="chip ${p.id === periodo.id ? 'on' : ''}" href="${qs({ periodo: p.id })}">${p.label}</a>`).join(''))}
    ${chips('Categoria', [
      `<a class="chip ${tipo === null ? 'on' : ''}" href="${qs({ tipo: 'tudo' })}">Tudo</a>`,
      ...tipos.map((t) => `<a class="chip ${tipo === t ? 'on' : ''}" href="${qs({ tipo: t })}">${esc(t)}</a>`),
    ].join(''))}
    ${chips('Mostrar', TOPS.map((n) =>
      `<a class="chip ${n === top ? 'on' : ''}" href="${qs({ top: n })}">Top ${n}</a>`).join(''))}

    <div class="cards" style="margin-top:18px">
      <div class="stat"><div class="k">${unidade[1]}</div><div class="v">${r.pares}</div></div>
      <div class="stat"><div class="k">Pedidos</div><div class="v">${r.pedidos}</div></div>
      <div class="stat"><div class="k">Faturamento em produto</div><div class="v green">${brl(r.receitaCents)}</div><div class="sub">sem frete</div></div>
      <div class="stat"><div class="k">Modelos diferentes</div><div class="v">${r.produtos}</div></div>
    </div>

    <table>
      <thead><tr>
        <th>#</th><th>Produto</th>
        <th class="r">${unidade[0]}</th><th class="r">Pedidos</th>
        <th class="r">Faturamento</th><th class="r">Numeração top</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <p class="rodape"><b>Faturamento em produto</b> é preço × quantidade dos itens; o frete e o desconto do
      cupom ficam de fora, porque são do pedido e não do produto — por isso ele não bate com o faturamento
      da tela de Pedidos. <b>Numeração top</b> é a que mais saiu daquele modelo, com o total entre parênteses.
      A vitrine <b>Mais Vendidos</b> da home sai <b>deste ranking</b> e se refaz sozinha: são as
      ${MV_VAGAS} primeiras posições dos últimos <b>${MV_JANELA} dias</b>, contando só quem vendeu
      ${MV_MIN}+ pares e ainda está no catálogo. Vaga que sobrar é preenchida pela lista de reserva
      (<span class="mono">src/checkout/maisVendidos.js</span>), que é o que a loja mostrava antes de
      ter venda própria. A marca <span class="tag">na vitrine</span> mostra quem está lá agora — no
      filtro de <b>${MV_JANELA} dias</b> / <b>Tênis</b> ela acompanha as primeiras linhas; em outro
      recorte pode discordar, porque a vitrine tem recorte fixo.</p>`;
  res.type('html').send(layout('Mais vendidos', inner, 'ranking'));
});

// GET /admin/catalogo — estado do catálogo + reimportação do CSV
router.get('/catalogo', async (req, res) => {
  const c = await catalogCount();
  const { rel, file } = caminhoCsv();
  let csv = null;
  try {
    const st = fs.statSync(file);
    csv = { existe: true, mtime: st.mtimeMs, kb: Math.round(st.size / 1024) };
  } catch { csv = { existe: false }; }

  const erro = req.query.erro ? `<div class="note">⚠️ Reimportação falhou: <b>${esc(req.query.erro)}</b><br>O catálogo que estava no ar não foi alterado.</div>` : '';
  const ok = req.query.ok
    ? `<div class="saved">✅ Catálogo reimportado: <b>${esc(req.query.p)}</b> produtos e <b>${esc(req.query.v)}</b> variantes. A loja já está servindo a lista nova.</div>`
    : '';

  const inner = `
    <h2 style="margin:0 0 6px">Catálogo</h2>
    <p style="color:var(--soft);margin:0 0 18px">Os produtos vêm do CSV versionado no repositório. O deploy sozinho <b>não</b> atualiza a loja — o boot só importa quando o catálogo está vazio, pra não desfazer nada sem você mandar. Depois de subir um produto novo no CSV, é aqui que ele entra no ar.</p>
    ${ok}${erro}
    <div class="cards" style="margin-top:16px">
      <div class="stat"><div class="k">Produtos no ar</div><div class="v">${c.products}</div></div>
      <div class="stat"><div class="k">Variantes</div><div class="v">${c.variants}</div></div>
    </div>
    <div class="sec">
      <h3>Arquivo de origem</h3>
      <p class="hint">É o CSV que vai no git. Para incluir um produto, adicione as linhas dele neste arquivo e faça o deploy — depois clique no botão abaixo.</p>
      <div class="kv"><span class="kk">Caminho</span><span class="vv mono">${esc(rel)}</span></div>
      ${csv.existe
        ? `<div class="kv"><span class="kk">Modificado em</span><span class="vv">${dt(csv.mtime)}</span></div>
           <div class="kv"><span class="kk">Tamanho</span><span class="vv">${csv.kb} KB</span></div>`
        : '<div class="kv"><span class="kk">Situação</span><span class="vv">arquivo não encontrado</span></div>'}
    </div>
    <div class="sec">
      <h3>Reimportar do CSV</h3>
      <p class="hint">Regrava produtos e variantes a partir do arquivo, em uma transação: se o CSV estiver quebrado, nada é alterado e a loja continua vendendo. <b>Pedidos não são tocados.</b> Preço e "de" são realinhados pelo valor configurado no serviço.</p>
      <form method="post" action="/admin/catalogo/reimportar"
        onsubmit="return confirm('Reimportar o catálogo do CSV? Produtos e variantes são regravados a partir do arquivo. Pedidos não são afetados.')">
        <button class="btn" type="submit" ${csv.existe ? '' : 'disabled'}>Reimportar catálogo</button>
      </form>
    </div>`;
  res.type('html').send(layout('Catálogo', inner, 'catalog'));
});

// POST /admin/catalogo/reimportar — regrava o catálogo a partir do CSV.
// Pesa alguns segundos (milhares de variantes numa transação), e a resposta só
// sai quando o banco confirma — quem clicou precisa saber se entrou. Não deixou
// de prender o processo por ser assíncrono: prende a REQUISIÇÃO, e o limite de
// tempo da função na Vercel vale aqui. É aceitável porque é ação manual e rara,
// mas não dá pra chamar isto de rota pública nem em loop.
router.post('/catalogo/reimportar', async (req, res) => {
  try {
    const r = await reimportarCatalogo();
    // O catálogo fica num cache de 60s em memória; sem forçar, a loja
    // continuaria servindo a lista velha por até um minuto depois do clique.
    await loadCatalog(true);
    // A vitrine Mais Vendidos guarda os handles dela por um minuto. Se um
    // campeão de venda saiu do CSV, sem isto ela ficaria apontando para uma
    // página de produto que acabou de deixar de existir.
    esquecerMaisVendidos();
    res.redirect(`/admin/catalogo?ok=1&p=${r.products}&v=${r.variants}`);
  } catch (e) {
    console.error('[admin] reimportar catálogo falhou:', e.message);
    res.redirect(`/admin/catalogo?erro=${encodeURIComponent(e.message)}`);
  }
});

// GET /admin/gateway — seleção do gateway de pagamento
// Gateways que ESTA loja usa, e a CONTA de cada um. O registro em
// src/gateways.js tem cinco, porque o código é compartilhado entre lojas; só
// os desta lista aparecem na aba e passam no POST.
//
// A Estilo de Artista nasceu SEM conta nenhuma: as chaves da A Fonte (a Coreon
// própria dela e a UmbrellaPag "Dripzone Sneakers") ficaram fora do .env de
// propósito — vender com elas mandaria o dinheiro para a conta de outra loja,
// sem erro nenhum aparecer. Coreon e Umbrella estão aqui por serem os dois
// gateways em uso na família. Ao ligar a conta, TROQUE o texto pelo nome real
// dela: é a única coisa que mostra, ANTES do clique, para onde o dinheiro vai.
//
// A lista vale para a tela E para o POST. Esconder no HTML não impede um POST
// à mão, e este é o tipo de engano que só se descobre no extrato.
const GATEWAYS_DA_LOJA = {
  coreon: 'conta Coreon 3333e1b3-… (desde 14/09/2026)',
  umbrella: 'conta UmbrellaPag "Broke Zone" (CNPJ 58.834.496/0001-89) — confirmada pelo dono em 01/10/2026',
  solution: 'conta Solution Payments do dono, chave final 8801 (desde 29/09/2026)',
  pixgate: 'conta PixGate do dono, chave final cIfc (desde 02/10/2026)',
};

// Endereço usado no webhook cadastrado no painel do gateway. É o do Render
// (RENDER_EXTERNAL_URL), que não muda, e não o APP_URL — este passa a ser o
// domínio próprio assim que ele entra no ar. Fora do Render não existe a
// variável e sobra o APP_URL, que em desenvolvimento é o localhost mesmo.
const URL_WEBHOOK = (process.env.RENDER_EXTERNAL_URL || config.appUrl).replace(/\/$/, '');

router.get('/gateway', (req, res) => {
  const current = activeGatewayId();
  const saved = req.query.saved === '1';
  const daLoja = Object.values(GATEWAYS).filter((g) => !!GATEWAYS_DA_LOJA[g.id]);

  const opts = daLoja.map((g) => {
    const isCur = g.id === current;
    const key = g.hasKey();
    // Gateway que exige cadastro do postback no painel dele precisa da URL
    // COMPLETA (é o que se cola lá); os outros recebem a URL por cobrança.
    //
    // E a URL completa aqui é a do RENDER, não a do domínio próprio, mesmo com
    // APP_URL apontando para afonte.shop. O webhook da Coreon é cadastrado UMA
    // vez por conta: se ele seguisse o domínio, perder ou trocar o domínio
    // viraria cliente pagando sem o pedido fechar. O endereço onrender.com não
    // muda. As duas entregam no mesmo serviço — a diferença é só quem sobrevive
    // a uma troca de domínio.
    const hook = g.webhookNoPainel ? `${URL_WEBHOOK}/webhooks/${g.id}` : `/webhooks/${g.id}`;
    const pills = [
      isCur ? '<span class="pill cur">Ativo</span>' : '',
      key ? '<span class="pill ok">Chave OK</span>' : '<span class="pill no">Sem chave</span>',
    ].join(' ');
    return `<label class="gw-opt ${isCur ? 'sel' : ''}">
      <input type="radio" name="gateway" value="${g.id}" ${isCur ? 'checked' : ''}>
      <div><div class="nm">${esc(g.name)}</div>
        <div class="meta">Conta: <b>${esc(GATEWAYS_DA_LOJA[g.id])}</b></div>
        <div class="meta">Webhook: <span class="mono">${esc(hook)}</span>${key ? '' : ' · configure a chave no Render pra usar'}</div>
        ${g.webhookNoPainel ? `<div class="meta">⚠️ Cadastre <b>esta</b> URL no painel do gateway — ele não aceita postback por cobrança.${
          URL_WEBHOOK === config.appUrl ? '' : ` É o endereço do Render de propósito, e não <span class="mono">${esc(config.appUrl)}</span>: o webhook é cadastrado uma vez por conta, e este endereço não muda se o domínio mudar.`
        }</div>` : ''}
      </div>${pills}</label>`;
  }).join('');

  // A nota se monta a partir da própria lista, para não envelhecer quando um
  // gateway entrar ou sair do GATEWAYS_DA_LOJA.
  const nomes = daLoja.map((g) => `<b>${esc(g.name)}</b>`).join(' e ');
  const notaLista = `<div class="note" style="margin-bottom:14px">${
    daLoja.length > 1
      ? `Aparecem só os gateways com conta desta loja: ${nomes}. <b>Confira o nome da conta na opção antes de trocar</b> —
         elas têm donos diferentes, e é o nome que diz para onde o dinheiro vai.`
      : `Aparece só ${nomes}: é a conta desta loja que processa cobrança hoje.`
  } O código suporta cinco gateways; os que não são desta loja ficam fora da lista, para que uma chave herdada de
    outra loja nunca mande o dinheiro para a conta errada. A lista é o <span class="mono">GATEWAYS_DA_LOJA</span> em
    <span class="mono">src/routes/admin.js</span>.</div>`;

  const curG = GATEWAYS[current];
  // Dois alarmes diferentes, e o segundo é o grave.
  const semChave = !curG.hasKey()
    ? `<div class="note">⚠️ O gateway ativo (<b>${esc(curG.name)}</b>) está <b>sem chave</b> configurada — o checkout vai falhar até você definir a chave no Render.</div>`
    : '';
  // Se a Coreon ficar sem chave, o código cai sozinho no primeiro gateway que
  // tiver uma (src/gateways.js) — e as que sobraram são da Nation 47. O
  // checkout continuaria funcionando, mas o dinheiro entraria na conta errada.
  const foraDaLoja = !GATEWAYS_DA_LOJA[current]
    ? `<div class="note" style="border-color:#7a2233;background:#33141c">🚨 <b>O gateway ativo é ${esc(curG.name)}, que não é desta loja.</b>
        A conta <b>não é a desta loja</b> — <b>o dinheiro das vendas pode estar caindo em outra</b>. Isso acontece sozinho
        quando os gateways desta loja ficam sem chave: o código escolhe o primeiro que tiver uma. Confira
        <span class="mono">COREON_API_KEY</span> e <span class="mono">COREON_API_SECRET</span> no Render e volte para um
        gateway desta loja abaixo.</div>`
    : '';
  const warn = foraDaLoja + semChave;

  const inner = `
    <h2 style="margin:0 0 6px">Gateway de pagamento</h2>
    <p style="color:var(--soft);margin:0 0 18px">Por qual gateway o checkout gera o PIX. A troca vale na hora, sem redeploy.</p>
    ${notaLista}
    ${saved ? '<div class="saved">✅ Gateway atualizado.</div>' : ''}
    ${warn}
    <form method="post" action="/admin/gateway" class="gw" style="margin-top:14px">
      ${opts}
      <div><button class="btn" type="submit">Salvar gateway</button></div>
    </form>`;
  res.type('html').send(layout('Gateway', inner, 'gateway'));
});

// POST /admin/gateway — salva a escolha
router.post('/gateway', (req, res) => {
  const g = String(req.body?.gateway || '');
  // A peneira é aqui, não no HTML: o formulário mostra só os gateways desta
  // loja, mas um POST à mão com outro id passaria direto e mandaria o dinheiro
  // para a conta da Nation 47.
  if (!GATEWAYS_DA_LOJA[g]) {
    console.warn(`[admin] tentativa de ativar gateway fora desta loja: ${g || '(vazio)'} — recusada`);
    return res.redirect('/admin/gateway');
  }
  try {
    setActiveGateway(g);
    console.log(`[admin] gateway ativo alterado para: ${g}`);
  } catch (e) {
    console.error('[admin] gateway inválido:', e.message);
    return res.redirect('/admin/gateway');
  }
  res.redirect('/admin/gateway?saved=1');
});

// GET /admin/whatsapp — número de atendimento da loja.
// Vale na hora, sem redeploy: as páginas da loja leem o contato a cada request.
router.get('/whatsapp', (req, res) => {
  const ct = getContato();
  const saved = req.query.saved === '1';
  const erro = req.query.erro ? `<div class="note">⚠️ ${esc(req.query.erro)}<br>O número que estava no ar continua o mesmo.</div>` : '';

  // 55 + DDD + 8 dígitos: pode ser um fixo com WhatsApp Business, mas quase
  // sempre é o 9 do celular que ficou pra trás — e um número errado aqui só
  // aparece quando o cliente clica e não chega ninguém. Avisa, sem bloquear.
  const semNove = /^55\d{2}\d{8}$/.test(ct.whatsapp);
  const alerta = semNove
    ? `<div class="note" style="margin-bottom:12px">⚠️ Esse número tem <b>8 dígitos</b> depois do DDD. Celular brasileiro tem 9 (começa com 9). Confira se não faltou o <b>9</b> — se for um fixo com WhatsApp Business, pode ignorar.</div>`
    : '';

  const preview = ct.whatsapp
    ? `${alerta}
       <div class="kv"><span class="kk">Como o cliente vê</span><span class="vv"><b>${esc(formatarWhatsapp(ct.whatsapp))}</b></span></div>
       <div class="kv"><span class="kk">Link do botão</span><span class="vv mono"><a href="${esc(linkWhatsapp(ct.whatsapp, ct.mensagem))}" target="_blank" rel="noopener">wa.me/${esc(ct.whatsapp)}</a></span></div>
       <div class="kv"><span class="kk">Mensagem automática</span><span class="vv">${ct.mensagem ? `<b>${esc(ct.mensagem)}</b>` : '<i>nenhuma — a conversa abre em branco</i>'}</span></div>
       <p class="muted2" style="margin:10px 0 0">Abra o link acima antes de sair da tela: se cair no WhatsApp certo e já com a mensagem escrita, está valendo pra loja inteira.</p>`
    : `<div class="note">Sem número salvo — o botão flutuante de WhatsApp e as menções ao número <b>não aparecem</b> na loja. É de propósito: melhor não ter WhatsApp do que mandar o cliente pra um número errado.</div>`;

  const inner = `
    <h2 style="margin:0 0 6px">WhatsApp da loja</h2>
    <p style="color:var(--soft);margin:0 0 18px">O número do botão flutuante, do rodapé e da tela de rastreio, e a mensagem que já vai escrita na conversa. A troca vale na hora, sem redeploy — é só dar F5 na loja.</p>
    ${saved ? '<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Contato salvo. O número novo já está no ar.</div>' : ''}
    ${erro}
    <div class="sec">
      <h3>No ar agora</h3>
      <p class="hint">É isto que o cliente encontra hoje na loja.</p>
      ${preview}
    </div>
    <form method="post" action="/admin/whatsapp">
      <div class="sec">
        <h3>Trocar o número</h3>
        <p class="hint">Escreva do jeito que quiser — <b>(47) 99722-9918</b>, <b>47 99722-9918</b> ou <b>+55 47 99722-9918</b>. O DDI 55 entra sozinho se você não colocar. Lembre do <b>9</b> na frente do celular. Deixe em branco pra tirar o WhatsApp da loja.</p>
        <div class="fld" style="max-width:320px">
          <label>Número do WhatsApp</label>
          <input class="in" name="whatsapp" value="${esc(ct.whatsapp ? formatarWhatsapp(ct.whatsapp) : '')}" placeholder="(47) 99722-9918" inputmode="tel">
        </div>
      </div>
      <div class="sec">
        <h3>Mensagem automática</h3>
        <p class="hint">É o texto que já aparece escrito quando o cliente clica no botão de WhatsApp — ele só dá enviar. Vale igual em toda a loja. Deixe em branco pra abrir a conversa vazia.<br><b>Atenção:</b> o WhatsApp é o aplicativo do cliente — ele pode apagar e escrever outra coisa antes de enviar, e não existe jeito de travar isso. O que a loja controla é o que já vai escrito.</p>
        <div class="fld" style="max-width:640px">
          <label>Mensagem</label>
          <input class="in" name="mensagem" value="${esc(ct.mensagem)}" placeholder="Olá! Vim pelo site e gostaria de mais informações." maxlength="400">
        </div>
      </div>
      <div class="sec">
        <h3>E-mail de atendimento</h3>
        <p class="hint">Aparece no rodapé da loja e é o contato mostrado quando não há WhatsApp configurado.</p>
        <div class="fld" style="max-width:320px">
          <label>E-mail</label>
          <input class="in" name="email" value="${esc(ct.email)}" placeholder="suporte@exemplo.com.br" inputmode="email">
        </div>
      </div>
      <button class="btn" type="submit">Salvar contato</button>
    </form>`;
  res.type('html').send(layout('WhatsApp', inner, 'whats'));
});

// POST /admin/whatsapp — salva o contato.
// Número inválido não é salvo: um dígito a menos aqui manda todo cliente que
// clica no botão pra um número que não existe, e ninguém avisa.
router.post('/whatsapp', (req, res) => {
  const whatsapp = normalizarWhatsapp(req.body?.whatsapp);
  const email = String(req.body?.email || '').trim();

  if (!whatsappValido(whatsapp)) {
    return res.redirect(`/admin/whatsapp?erro=${encodeURIComponent(
      `"${String(req.body?.whatsapp || '').slice(0, 40)}" não parece um WhatsApp válido. Celular brasileiro tem DDD + 9 dígitos (ex.: 47 99722-9918).`)}`);
  }
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return res.redirect(`/admin/whatsapp?erro=${encodeURIComponent(`"${email.slice(0, 40)}" não parece um e-mail válido.`)}`);
  }

  saveContato({
    whatsapp,
    email: email || getContato().email,
    mensagem: req.body?.mensagem,
  });
  console.log(`[admin] contato salvo — whatsapp: ${whatsapp || '(vazio)'}`);
  res.redirect('/admin/whatsapp?saved=1');
});

// GET /admin/personalizar — personalização do checkout
router.get('/personalizar', (req, res) => {
  const cx = getCustomization();
  const saved = req.query.saved === '1';
  const brl2 = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');

  // linhas de frete (as atuais + 1 vazia pra adicionar)
  const shipRows = [...cx.shipping, { id: '', name: '', cents: '', eta: '' }].map((o) => `
    <div class="row3">
      <input class="in" name="ship_id" placeholder="id" value="${esc(o.id)}">
      <input class="in" name="ship_name" placeholder="Nome (ex: Frete Grátis)" value="${esc(o.name)}">
      <input class="in" name="ship_cents" placeholder="centavos" value="${o.cents === '' ? '' : o.cents}">
      <input class="in" name="ship_eta" placeholder="Prazo (ex: 7 dias úteis)" value="${esc(o.eta)}">
    </div>`).join('');

  // Um produto de verdade para a pré-visualização: checkout com carrinho vazio
  // mostra "seu carrinho está vazio" e não daria para ver cor nenhuma.
  let amostra = '';
  try {
    const cat = loadCatalog();
    for (const p of (cat?.products || [])) {
      const v = (p.variants || []).find((x) => x.available !== false);
      if (v) { amostra = v.id; break; }
    }
  } catch { /* catálogo vazio: a prévia mostra o estado de carrinho vazio */ }

  // Sempre MAX_BUMPS blocos: os salvos preenchidos, o resto em branco para
  // cadastrar. Slot sem ID de variação é descartado ao salvar, então deixar
  // vazio é o jeito de não ter aquela oferta.
  const bumps = Array.from({ length: MAX_BUMPS }, (_, i) => cx.orderBumps[i] || {
    enabled: false, title: '', description: '', image: '', variantId: '', priceCents: 0,
  });
  const k = cx.checkout;
  const L = cx.layout;
  const cor = (nome, rotulo, valor, dica) => `
    <div class="c"><label for="ck_${nome}">${rotulo}</label>
      <input type="color" id="ck_${nome}" name="ck_${nome}" value="${esc(valor)}" data-alvo="${nome}">
      ${dica ? `<span class="muted2">${dica}</span>` : ''}</div>`;
  // Croqui de cada arranjo. Ler "resumo recolhido" e entender o que acontece
  // com a página são coisas diferentes — o desenho responde antes da prévia.
  // Cinza é o formulário, roxo é o resumo do pedido.
  const croqui = (tipo) => {
    const q = (x, y, w, h, cls, r = 2) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
    // A caixa é larga e baixa (74x26) para o desenho encher o cartão da opção.
    // Num quadro mais alto o SVG sobraria nas laterais e pareceria desalinhado.
    const dentro = {
      // formulário largo à esquerda, resumo em coluna estreita à direita
      lado: q(2, 2, 46, 22, 'cq-form') + q(52, 2, 20, 13, 'cq-res'),
      // resumo ocupando a largura toda, formulário embaixo
      topo: q(2, 2, 70, 7, 'cq-res') + q(2, 11, 70, 13, 'cq-form'),
      // resumo virou uma barra fina; o formulário sobe
      recolhivel: q(2, 2, 70, 4, 'cq-res', 1.5) + q(2, 8, 70, 16, 'cq-form'),
      arredondado: q(8, 3, 58, 20, 'cq-form', 6),
      reto: q(8, 3, 58, 20, 'cq-form', 0),
    }[tipo] || '';
    return `<svg class="cq" viewBox="0 0 74 26" aria-hidden="true">${dentro}</svg>`;
  };

  const radio = (campo, valor, rotulo, atual, dica) => `
    <label class="opt${valor === atual ? ' opt--on' : ''}">
      <input type="radio" name="${campo}" value="${valor}" ${valor === atual ? 'checked' : ''}>
      <span><b>${rotulo}</b>${dica ? `<i>${dica}</i>` : ''}</span>
      ${croqui(valor)}
    </label>`;
  const check = (campo, rotulo, ligado, dica) => `
    <label class="chkline"><input type="checkbox" name="${campo}" ${ligado ? 'checked' : ''}>
      <span>${rotulo}${dica ? ` <span class="muted2">— ${dica}</span>` : ''}</span></label>`;

  const inner = `
    <h2 style="margin:0 0 6px">Personalização do checkout</h2>
    <p style="color:var(--soft);margin:0 0 18px">Cores, logo, estrutura, frete e oferta.
      Aplica na hora, sem redeploy — a prévia ao lado mostra antes de salvar.</p>
    ${saved ? '<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Personalização salva.</div>' : ''}

    <div class="pz">
      <form method="post" action="/admin/personalizar" id="fPers" class="pz-form">

      <div class="sec">
        <h3>Cores do checkout</h3>
        <p class="hint">Valem só do checkout para dentro. As linhas mais claras e mais
          escuras saem da cor de linha, e a letra do botão vira preta ou branca sozinha,
          pelo que tiver mais contraste.</p>
        <div class="colorrow">
          ${cor('bg', 'Fundo', k.bg)}
          ${cor('card', 'Cartão', k.card)}
          ${cor('tinta', 'Texto e números', k.tinta)}
          ${cor('cinza', 'Texto secundário', k.cinza)}
          ${cor('linha', 'Linhas', k.linha)}
          ${cor('botao', 'Botão', k.botao)}
        </div>
        <p class="hint" style="margin:14px 0 0">O verde de confirmado e o azul do PIX não
          entram aqui de propósito: são cor de status e da marca Pix, e mexer neles faria
          o cliente ler errado o que está acontecendo com o pagamento dele.</p>
      </div>

      <div class="sec">
        <h3>Cores da marca</h3>
        <p class="hint">Usadas na vitrine e nos detalhes: destaque, topo escuro e botões da loja.</p>
        <div class="colorrow">
          <div class="c"><label>Marca</label><input type="color" name="color_brand" value="${esc(cx.colors.brand)}"></div>
          <div class="c"><label>Destaque</label><input type="color" name="color_volt" value="${esc(cx.colors.volt)}"></div>
          <div class="c"><label>Topo</label><input type="color" name="color_black" value="${esc(cx.colors.black)}"></div>
        </div>
      </div>

      <div class="sec">
        <h3>Logo</h3>
        <p class="hint">São duas artes porque o checkout tem dois fundos: o topo é escuro e
          o painel do resumo é branco. Logo de tinta clara some no branco. Se você enviar só
          a primeira, ela é usada nos dois lugares. PNG, JPG, WEBP ou SVG, até 500 KB.</p>
        <div class="logos">
          <div class="logo-slot">
            <label>Fundo escuro (topo da loja)</label>
            <div class="logo-prev logo-prev--dark" id="prevEscura">${
              cx.logo.escura ? `<img src="/marca/logo.png?v=${Date.now()}" alt="">` : '<span>sem arte enviada</span>'}</div>
            <input type="file" accept="image/*" id="fileEscura" class="in">
            <input type="hidden" name="logo_escura" id="logoEscura" value="${cx.logo.escura ? '__MANTER__' : ''}">
            <button type="button" class="mini" data-limpa="Escura">Remover</button>
          </div>
          <div class="logo-slot">
            <label>Fundo claro (resumo do checkout)</label>
            <div class="logo-prev" id="prevClara">${
              cx.logo.clara ? `<img src="/marca/logo-claro.png?v=${Date.now()}" alt="">` : '<span>usa a de cima</span>'}</div>
            <input type="file" accept="image/*" id="fileClara" class="in">
            <input type="hidden" name="logo_clara" id="logoClara" value="${cx.logo.clara ? '__MANTER__' : ''}">
            <button type="button" class="mini" data-limpa="Clara">Remover</button>
          </div>
        </div>
      </div>

      <div class="sec">
        <h3>Estrutura</h3>
        <p class="hint">Onde fica o resumo do pedido e o que aparece na página. No celular o
          resumo já vem sempre no topo — estas opções valem para o computador.</p>

        <div class="fld"><label>Resumo do pedido</label>
          <div class="opts">
            ${radio('lay_resumo', 'lado', 'Coluna à direita', L.resumo, 'como está hoje')}
            ${radio('lay_resumo', 'topo', 'Acima do formulário', L.resumo, 'ocupa a largura toda')}
            ${radio('lay_resumo', 'recolhivel', 'Recolhido', L.resumo, 'barra com o total, abre ao clicar')}
          </div>
        </div>

        <div class="fld"><label>Cantos</label>
          <div class="opts">
            ${radio('lay_cantos', 'arredondado', 'Arredondados', L.cantos, '')}
            ${radio('lay_cantos', 'reto', 'Retos', L.cantos, '')}
          </div>
        </div>

        <div class="fld" style="margin-top:18px"><label>Seções</label>
          ${check('lay_cronometro', 'Cronômetro de oferta', L.cronometro, 'barra preta com contagem regressiva')}
          ${check('lay_trust', 'Faixa de garantias', L.trust, 'a linha logo abaixo do topo')}
          ${check('lay_lgpd', 'Bloco "usamos seus dados para"', L.lgpd, '')}
          ${check('lay_depoimentos', 'Depoimentos', L.depoimentos, '')}
        </div>
        <p class="hint" style="margin:6px 0 0">Sobre o cronômetro: relógio que reinicia a cada
          visita não marca prazo nenhum, e oferta com prazo inexistente é publicidade enganosa
          pelo CDC (art. 37). Ligue só se a promoção tiver hora real de acabar.</p>
      </div>

      <div class="sec">
        <h3>Faixa de confiança</h3>
        <p class="hint">Separe os itens por <b>·</b>. Só entra <b>fato verificável</b>
          ("Devolução em até 7 dias"), nunca adjetivo ("compra 100% segura") nem selo que a
          loja não tem — o que está anunciado vira obrigação (CDC art. 30). Vazio faz a faixa sumir.</p>
        <div class="fld"><input class="in" name="topbar" value="${esc(cx.topbar)}"></div>
      </div>

      <div class="sec">
        <h3>Opções de frete</h3>
        <p class="hint">Edite as opções. Valor em <b>centavos</b> (ex: 1740 = R$ 17,40; 0 = grátis). Deixe o nome vazio pra remover.</p>
        <div class="row3" style="margin-bottom:4px">
          <span class="muted2">id</span><span class="muted2">nome</span><span class="muted2">centavos</span><span class="muted2">prazo</span>
        </div>
        ${shipRows}
      </div>

      <div class="sec">
        <h3>Order bumps (ofertas no checkout)</h3>
        <p class="hint">Produtos extras com preço especial, marcáveis com um clique antes do pagamento. Até ${MAX_BUMPS}; cada um vira um checkbox na tela de pagamento.</p>
        ${bumps.map((b, i) => `
        <div class="bumpslot">
          <div class="bumpnum">Oferta ${i + 1}</div>
          <label class="chkline"><input type="checkbox" name="bump_enabled_${i}" ${b.enabled ? 'checked' : ''}> Ativar esta oferta</label>
          <div class="fld"><label>Título</label><input class="in" name="bump_title_${i}" value="${esc(b.title)}" placeholder="Leve uma Juliet junto por R$ 49"></div>
          <div class="fld"><label>Descrição</label><input class="in" name="bump_description_${i}" value="${esc(b.description)}"></div>
          <div class="fld"><label>ID da variação do produto ofertado</label><input class="in" name="bump_variantId_${i}" value="${esc(b.variantId)}" placeholder="ex: impermeabilizante-sneaker-guard::unico"></div>
          <div class="fld"><label>Imagem (URL) — opcional (usa a do produto se vazio)</label><input class="in" name="bump_image_${i}" value="${esc(b.image)}" placeholder="https://..."></div>
          <div class="fld" style="max-width:200px"><label>Preço da oferta (R$)</label><input class="in" name="bump_price_${i}" value="${b.variantId ? brl2(b.priceCents) : ''}" placeholder="39,90"></div>
        </div>`).join('')}
        <p class="muted2">O desconto é a diferença entre o preço real da variação e o preço da oferta — o checkout mostra "de/por" sozinho. Deixar o ID em branco remove a oferta.</p>
      </div>

      <div class="acoes">
        <button class="btn" type="submit">Salvar personalização</button>
        <button class="btn btn--ghost" type="submit" name="restaurar" value="1"
          onclick="return confirm('Volta cores, logo e estrutura ao padrão. Frete e order bump não são tocados. Confirma?')">Restaurar padrão</button>
      </div>
      </form>

      <aside class="pz-prev">
        <div class="pz-prev-hd">
          <b>Prévia</b>
          <div class="pz-disp">
            <button type="button" class="mini on" data-larg="1280">Computador</button>
            <button type="button" class="mini" data-larg="390">Celular</button>
          </div>
        </div>
        <div class="pz-quadro"><iframe id="prev" src="/admin/personalizar/previa" title="Prévia do checkout"></iframe></div>
        <p class="muted2" style="margin:10px 0 0">Cores e estrutura mudam aqui na hora.
          Só o que está salvo vai para a loja.</p>
      </aside>
    </div>

    <style>
      /* Esta tela é a única do painel com duas colunas de trabalho, então ela
         estica o container além dos 1100px padrão — senão a prévia fica com
         uns 300px e a estrutura do checkout vira um borrão. */
      .wrap:has(.pz){max-width:1560px}
      .pz{display:grid;grid-template-columns:minmax(0,660px) minmax(0,1fr);gap:24px;align-items:start}
      @media(max-width:1180px){.wrap:has(.pz){max-width:1100px}.pz{grid-template-columns:minmax(0,1fr)}}
      /* .sec segura 720px por padrão; aqui a coluna manda */
      .pz-form .sec{max-width:none}
      .pz-prev{position:sticky;top:16px;background:var(--card);border:1px solid var(--line);
        border-radius:14px;padding:14px}
      .pz-prev-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .pz-disp{display:flex;gap:6px}
      .mini{background:#241f33;color:var(--ink);border:1px solid var(--line);border-radius:8px;
        padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}
      .mini.on{background:var(--brand);border-color:var(--brand);color:#fff}
      /* A prévia roda numa janela de LARGURA REAL e é reduzida por escala.
         Encaixar o checkout num quadro estreito não servia: ele colapsa para
         uma coluna abaixo de 900px, então "coluna à direita" e "acima do
         formulário" desenhavam exatamente a mesma tela e clicar não mudava
         nada. O zoom é o que deixa a diferença aparecer. */
      /* fundo escuro, não branco: no modo Celular sobra espaço dos dois lados,
         e contra o branco o aparelho se dissolvia na moldura */
      .pz-quadro{position:relative;overflow:hidden;background:#0e0c14;
        border:1px solid var(--line);border-radius:10px}
      .pz-quadro iframe{position:absolute;top:0;left:0;border:0;background:#fff;
        transform-origin:top left}
      .opts{display:flex;gap:8px;flex-wrap:wrap}
      .opt{flex:1 1 150px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;
        gap:4px 8px;cursor:pointer;background:#241f33;border:1.5px solid var(--line);
        border-radius:10px;padding:11px 12px}
      .opt--on{border-color:var(--brand);background:#2a2140}
      .opt input{margin-top:2px;accent-color:var(--brand)}
      .opt > span{align-self:start}
      .opt b{display:block;font-size:13.5px;font-weight:600}
      .opt i{display:block;font-style:normal;font-size:11.5px;color:var(--soft);margin-top:2px}
      /* croqui do arranjo: linha de baixo, atravessando o cartão inteiro */
      .cq{grid-column:1 / -1;width:100%;height:auto;margin-top:9px;display:block}
      .cq-form{fill:#3b3550}
      .cq-res{fill:var(--brand);opacity:.55}
      .opt--on .cq-res{opacity:1}
      .opt--on .cq-form{fill:#484063}
      .logos{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      @media(max-width:640px){.logos{grid-template-columns:1fr}}
      .logo-slot{display:flex;flex-direction:column;gap:8px}
      .logo-slot label{font-size:12px;color:var(--soft)}
      .logo-prev{height:82px;border:1px dashed var(--line);border-radius:10px;background:#fff;
        display:grid;place-items:center;padding:10px}
      .logo-prev--dark{background:#0b0a0f}
      .logo-prev img{max-height:60px;max-width:100%;object-fit:contain}
      .logo-prev span{font-size:12px;color:#8b8794}
      .logo-slot .mini{align-self:flex-start}
      .acoes{display:flex;gap:10px;flex-wrap:wrap;max-width:720px}
      .acoes .btn{width:auto;padding:13px 20px}
      .btn--ghost{background:none;border:1px solid var(--line);color:var(--soft)}
    </style>

    <script>
    (function(){
      var quadro=document.getElementById('prev');
      var AMOSTRA=${JSON.stringify(amostra)};

      // O checkout lê o carrinho do localStorage, e a prévia divide a mesma
      // origem que o painel — dá para semear um item sem rota nova. Só semeia
      // se estiver vazio, para não atropelar um carrinho de verdade.
      try{
        if(AMOSTRA && !localStorage.getItem('cart')){
          var c={};c[AMOSTRA]=1;localStorage.setItem('cart',JSON.stringify(c));
        }
      }catch(e){}

      function doc(){ try{ return quadro.contentDocument; }catch(e){ return null; } }

      // Pinta a prévia mexendo só nas variáveis CSS e nas classes da raiz .ck —
      // é exatamente o que o servidor faz ao renderizar, então o que se vê aqui
      // é o que sai salvo.
      function pinta(){
        var d=doc(); if(!d||!d.body) return;
        var raiz=d.querySelector('.ck'); if(!raiz) return;
        var v=function(n){ var e=document.getElementById('ck_'+n); return e?e.value:''; };
        var s=d.getElementById('previewVars');
        if(!s){ s=d.createElement('style'); s.id='previewVars'; d.head.appendChild(s); }
        s.textContent='.ck{--ck-bg:'+v('bg')+';--ck-card:'+v('card')+';--ck-tinta:'+v('tinta')
          +';--ck-cinza:'+v('cinza')+';--ck-linha:'+v('linha')+';--ck-verde:'+v('botao')+'}'
          +'body:has(.ck){background:'+v('bg')+'}';

        var resumo=(document.querySelector('input[name=lay_resumo]:checked')||{}).value||'lado';
        raiz.classList.toggle('ck--resumo-topo',resumo==='topo');
        raiz.classList.toggle('ck--resumo-recolhivel',resumo==='recolhivel');
        var cantos=(document.querySelector('input[name=lay_cantos]:checked')||{}).value||'arredondado';
        raiz.classList.toggle('ck--reto',cantos==='reto');

      }

      // Seção desligada não existe no HTML, então CSS nenhum a faz aparecer:
      // ligar uma exige renderizar de novo. Cor e estrutura não recarregam —
      // só as caixas de seção, e com um respiro para quem marca três seguidas.
      var chk=function(n){ var e=document.querySelector('input[name='+n+']'); return e&&e.checked?'1':'0'; };
      var pendente=null;
      function recarrega(){
        clearTimeout(pendente);
        pendente=setTimeout(function(){
          var resumo=(document.querySelector('input[name=lay_resumo]:checked')||{}).value||'lado';
          var cantos=(document.querySelector('input[name=lay_cantos]:checked')||{}).value||'arredondado';
          quadro.src='/admin/personalizar/previa?resumo='+resumo+'&cantos='+cantos
            +'&cronometro='+chk('lay_cronometro')+'&trust='+chk('lay_trust')
            +'&lgpd='+chk('lay_lgpd')+'&depoimentos='+chk('lay_depoimentos');
        },220);
      }

      quadro.addEventListener('load',pinta);
      document.getElementById('fPers').addEventListener('input',pinta);
      document.getElementById('fPers').addEventListener('change',function(e){
        pinta();
        // Qualquer opção de estrutura recarrega a prévia, não só as caixas.
        // "Recolhido" precisa do <details> no HTML, que classe nenhuma cria —
        // trocar só a classe movia o resumo mas nunca mostrava a barra que abre.
        if(e.target.name&&e.target.name.indexOf('lay_')===0) recarrega();
      });

      // marca visual do rádio escolhido
      document.querySelectorAll('.opts').forEach(function(g){
        g.addEventListener('change',function(){
          g.querySelectorAll('.opt').forEach(function(o){
            o.classList.toggle('opt--on',o.querySelector('input').checked);
          });
        });
      });

      // Numa tela estreita a prévia desce para baixo do formulário, e quem
      // clica em "Recolhido" lá na Estrutura não vê nada acontecer. Só então
      // vale trazer a prévia para perto — na tela larga ela já está fixa ao
      // lado, e rolar a página seria atrapalhar.
      var caixa=document.querySelector('.pz-prev');
      function mostraPrevia(){
        if(window.matchMedia('(min-width:1181px)').matches) return;
        caixa.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
      document.querySelectorAll('input[name^=lay_]').forEach(function(el){
        el.addEventListener('change',mostraPrevia);
      });

      // Zoom da prévia. A janela de dentro tem largura de aparelho de verdade
      // (1280 no computador, 390 no celular) e é encolhida por transform até
      // caber na coluna. Sem isso o checkout enxergaria a largura do quadro,
      // cairia no arranjo de uma coluna e as opções de resumo ficariam iguais.
      var moldura=document.querySelector('.pz-quadro');
      var LARG_ALVO=1280, ALT_ALVO=1500;
      function ajustaZoom(){
        var cabe=moldura.clientWidth;
        if(!cabe) return;
        // Nunca AMPLIAR: um celular de 390px esticado até encher a coluna vira
        // um checkout gigante que não parece com celular nenhum. Reduzir tudo
        // bem, aumentar não — quando sobra espaço, o aparelho fica centralizado.
        var k=Math.min(cabe/LARG_ALVO,1);
        moldura.style.height=Math.round(ALT_ALVO*k)+'px';
        quadro.style.width=LARG_ALVO+'px';
        quadro.style.height=ALT_ALVO+'px';
        quadro.style.transform='scale('+k+')';
        quadro.style.left=Math.round(Math.max(0,(cabe-LARG_ALVO*k)/2))+'px';
      }
      ajustaZoom();
      window.addEventListener('resize',ajustaZoom);

      document.querySelectorAll('.pz-disp .mini').forEach(function(bt){
        bt.addEventListener('click',function(){
          document.querySelectorAll('.pz-disp .mini').forEach(function(o){o.classList.remove('on')});
          bt.classList.add('on');
          LARG_ALVO=parseInt(bt.getAttribute('data-larg'),10);
          ALT_ALVO=LARG_ALVO===390?1700:1500;
          ajustaZoom();
        });
      });

      // Logo: o arquivo vira data URI aqui no navegador e viaja num campo
      // escondido. Evita multipart e dependência nova só para dois arquivos.
      var LIMITE=500*1024;
      function ligaArquivo(qual){
        var inp=document.getElementById('file'+qual);
        var alvo=document.getElementById('logo'+qual);
        var prev=document.getElementById('prev'+qual);
        inp.addEventListener('change',function(){
          var f=inp.files&&inp.files[0]; if(!f) return;
          if(f.size>LIMITE){
            alert('Essa imagem tem '+Math.round(f.size/1024)+' KB. O limite é 500 KB — '
              +'exporte menor ou salve como PNG otimizado.');
            inp.value=''; return;
          }
          var r=new FileReader();
          r.onload=function(){
            alvo.value=r.result;
            prev.innerHTML='<img alt="">';
            prev.querySelector('img').src=r.result;
          };
          r.readAsDataURL(f);
        });
      }
      ligaArquivo('Escura'); ligaArquivo('Clara');

      document.querySelectorAll('[data-limpa]').forEach(function(bt){
        bt.addEventListener('click',function(){
          var qual=bt.getAttribute('data-limpa');
          document.getElementById('logo'+qual).value='';
          document.getElementById('file'+qual).value='';
          document.getElementById('prev'+qual).innerHTML='<span>'
            +(qual==='Escura'?'sem arte enviada':'usa a de cima')+'</span>';
        });
      });
    })();
    </script>`;
  res.type('html').send(layout('Personalização', inner, 'custom'));
});

// GET /admin/personalizar/previa — o checkout renderizado com as opções de
// ESTRUTURA que estão na tela, mesmo sem salvar. Só as estruturais vêm por
// query: cor a prévia troca sozinha por CSS, sem recarregar nada.
router.get('/personalizar/previa', (req, res) => {
  const q = req.query;
  const atual = getCustomization();
  const lig = (nome, padrao) => (q[nome] == null ? padrao : q[nome] === '1');
  const cx = {
    ...atual,
    layout: {
      resumo: ['lado', 'topo', 'recolhivel'].includes(String(q.resumo)) ? String(q.resumo) : atual.layout.resumo,
      cantos: String(q.cantos) === 'reto' ? 'reto' : 'arredondado',
      cronometro: lig('cronometro', atual.layout.cronometro),
      trust: lig('trust', atual.layout.trust),
      depoimentos: lig('depoimentos', atual.layout.depoimentos),
      lgpd: lig('lgpd', atual.layout.lgpd),
    },
  };
  res.type('html').send(comCustomizacao(cx, () => checkoutPage()));
});

// POST /admin/personalizar — salva
router.post('/personalizar', (req, res) => {
  const body = req.body || {};
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const hex = (v, fb) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : fb);

  const ids = arr(body.ship_id), names = arr(body.ship_name), cents = arr(body.ship_cents), etas = arr(body.ship_eta);
  const shipping = [];
  for (let i = 0; i < names.length; i++) {
    const name = String(names[i] || '').trim();
    if (!name) continue; // linha vazia = ignorada/removida
    let id = String(ids[i] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) id = 'frete' + (shipping.length + 1);
    shipping.push({ id, name, cents: Math.max(0, parseInt(cents[i], 10) || 0), eta: String(etas[i] || '').trim() });
  }

  // "39,90" / "1.299,00" -> centavos. Virou função porque agora há um preço
  // por oferta, e não um só.
  const brlParaCents = (v) => Math.max(0, Math.round(parseFloat(String(v || '0').replace(/\./g, '').replace(',', '.')) * 100) || 0);

  // "Restaurar padrão" devolve só a aparência. Frete e order bump são
  // configuração de venda: quem clica aqui quer desfazer a cor errada, não
  // perder os fretes cadastrados.
  if (body.restaurar) {
    resetVisual();
    console.log('[admin] aparência restaurada ao padrão');
    return res.redirect('/admin/personalizar?saved=1');
  }

  const d = defaults();
  const atual = getCustomization();
  // O campo da logo chega em três estados: o marcador __MANTER__ (o usuário não
  // mexeu), um data URI novo, ou vazio (clicou em remover). Sem esse marcador o
  // formulário devolveria vazio a cada salvamento e apagaria a arte enviada.
  const logo = (campo, guardada) => {
    const v = String(body[campo] || '');
    return v === '__MANTER__' ? guardada : v;
  };

  const cx = {
    colors: {
      brand: hex(body.color_brand, d.colors.brand),
      volt: hex(body.color_volt, d.colors.volt),
      black: hex(body.color_black, d.colors.black),
    },
    checkout: {
      bg: hex(body.ck_bg, d.checkout.bg),
      card: hex(body.ck_card, d.checkout.card),
      tinta: hex(body.ck_tinta, d.checkout.tinta),
      cinza: hex(body.ck_cinza, d.checkout.cinza),
      linha: hex(body.ck_linha, d.checkout.linha),
      botao: hex(body.ck_botao, d.checkout.botao),
    },
    layout: {
      resumo: String(body.lay_resumo || d.layout.resumo),
      cantos: String(body.lay_cantos || d.layout.cantos),
      // checkbox desmarcada não é enviada pelo formulário, então a ausência é
      // um "não" de verdade — aqui não cabe cair no padrão.
      cronometro: !!body.lay_cronometro,
      trust: !!body.lay_trust,
      depoimentos: !!body.lay_depoimentos,
      lgpd: !!body.lay_lgpd,
    },
    logo: {
      escura: logo('logo_escura', atual.logo.escura),
      clara: logo('logo_clara', atual.logo.clara),
    },
    topbar: String(body.topbar || '').slice(0, 200),
    shipping: shipping.length ? shipping : undefined,
    // Um bloco por slot do formulário. `lerBumps` (customization.js) descarta
    // os que ficaram sem ID e aplica o teto, então aqui é só coletar.
    orderBumps: Array.from({ length: MAX_BUMPS }, (_, i) => ({
      enabled: !!body[`bump_enabled_${i}`],
      title: String(body[`bump_title_${i}`] || '').slice(0, 120),
      description: String(body[`bump_description_${i}`] || '').slice(0, 200),
      image: String(body[`bump_image_${i}`] || '').trim(),
      variantId: String(body[`bump_variantId_${i}`] || ''),
      priceCents: brlParaCents(body[`bump_price_${i}`]),
    })),
  };
  saveCustomization(cx);
  console.log('[admin] personalização salva');
  res.redirect('/admin/personalizar?saved=1');
});

// ------------------------------------------------------------------- E-MAIL
// Tela pra escrever e mandar e-mail para qualquer endereço. É sempre manual:
// nada sai daqui sozinho. A configuração do remetente fica na mesma página
// porque sem ela o botão de enviar não faz nada, e separar em duas telas só
// faria procurar.

// As datas do formulário (<input type="date">, "2026-08-01") viram instantes no
// fuso de São Paulo, que é o mesmo em que o painel mostra as datas dos pedidos.
// Sem fixar o fuso, o servidor do Render (UTC) jogaria as três primeiras horas
// de cada dia pro dia anterior.
const inicioDoDia = (s) => Date.parse(`${s}T00:00:00-03:00`);
const fimDoDia = (s) => Date.parse(`${s}T23:59:59.999-03:00`);

// Os e-mails de quem já comprou, sem repetir e do mais recente pro mais antigo.
// Serve pros dois usos da tela: a lista de sugestão do campo "Para" e o envio
// em lote por período. Um cliente que comprou três vezes recebe uma vez só.
async function emailsDosClientes({ de = '', ate = '', somentePagos = false } = {}) {
  const ini = de ? inicioDoDia(de) : -Infinity;
  const fim = ate ? fimDoDia(ate) : Infinity;
  const vistos = new Map();
  // 5000 cobre com folga o histórico de uma loja deste porte; o filtro por
  // data é feito aqui porque o e-mail mora dentro do JSON do cliente.
  for (const o of await listOrders({ limit: 5000 })) {
    if (o.createdAt < ini || o.createdAt > fim) continue;
    if (somentePagos && o.status !== 'paid') continue;
    const e = String(o.customer?.email || '').trim().toLowerCase();
    if (e && emailValido(e) && !vistos.has(e)) {
      vistos.set(e, { nome: o.customer?.name || '', quando: o.createdAt });
    }
  }
  return [...vistos.entries()].map(([email, v]) => ({ email, ...v }));
}

router.get('/email', async (req, res) => {
  const cfg = getEmailConfig();
  const pronto = emailPronto(cfg);
  const prov = PROVEDORES[cfg.provedor] || PROVEDORES.smtp;
  const [clientes, historico] = await Promise.all([emailsDosClientes(), listEmails(30)]);

  const avisos = [
    req.query.saved === '1' ? '<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Configuração salva.</div>' : '',
    req.query.enviado ? `<div class="saved" style="max-width:720px;margin-bottom:16px">✅ E-mail enviado para <b>${esc(req.query.enviado)}</b>.</div>` : '',
    req.query.lote ? `<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Disparando para <b>${esc(req.query.lote)}</b> clientes — cerca de meio segundo cada. Acompanhe em <i>Últimos envios</i> e dê F5 pra ver o progresso.</div>` : '',
    req.query.conf === 'on' ? '<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Confirmação automática <b>ligada</b> — todo pedido pago daqui pra frente gera e-mail pro cliente.</div>' : '',
    req.query.conf === 'off' ? '<div class="saved" style="max-width:720px;margin-bottom:16px">Confirmação automática <b>desligada</b>. Nenhum e-mail sai sozinho.</div>' : '',
    req.query.erro ? `<div class="note" style="max-width:720px;margin-bottom:16px">⚠️ ${esc(req.query.erro)}</div>` : '',
  ].join('');

  const pendencia = pronto ? '' : `<div class="note" style="max-width:720px;margin-bottom:16px">
    Ainda não dá pra enviar: falta <b>${esc(faltando(cfg).join(', '))}</b>. Preencha em <i>De onde os e-mails saem</i>, aqui embaixo.</div>`;

  // O rascunho volta pro formulário quando o envio falha — perder um texto
  // grande por causa de senha errada é o tipo de coisa que faz desistir.
  const rasc = {
    para: String(req.query.para || ''),
    assunto: String(req.query.assunto || ''),
    mensagem: String(req.query.mensagem || ''),
  };

  const opcoesProvedor = Object.entries(PROVEDORES).map(([id, p]) =>
    `<option value="${id}" ${cfg.provedor === id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');

  const linhasHist = historico.map((e) => `<tr>
      <td class="mono">${dt(e.createdAt)}</td>
      <td>${e.status === 'enviado' ? '<span class="b b-paid">enviado</span>' : '<span class="b b-pend">erro</span>'}</td>
      <td>${esc(e.para)}</td>
      <td>${esc(e.assunto)}</td>
      <td style="white-space:normal;color:#a39fb0;max-width:280px">${esc(e.erro || '')}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="color:#6b6577">Nenhum e-mail enviado ainda.</td></tr>';


  const inner = `
    <h2 style="margin:0 0 6px">E-mail</h2>
    <p style="color:var(--soft);margin:0 0 18px">Nada é enviado sem você escrever e apertar enviar.</p>
    ${avisos}${pendencia}

    <div>
      <div class="sec">
        <h3>Confirmação de pedido</h3>
        <p class="hint">O e-mail traz a nota do pedido: os produtos que o cliente comprou, o tipo de frete
          com o prazo, o total pago e o endereço de entrega. <b>Não sai mais sozinho quando o PIX é
          aprovado</b> (06/10/2026): o pagamento não dispara nada para o cliente. Use a prévia e o
          disparo de teste abaixo; o histórico de envios continua no fim desta página.
          <b>Não vai código de rastreio</b> — no momento do pagamento ele ainda nem existe.</p>
        <a class="btn" href="/admin/email/confirmacao/previa" target="_blank"
          style="background:none;border:1px solid var(--line);color:var(--soft)">Ver como fica</a>
      </div>
    </div>

    <form method="post" action="/admin/email/confirmacao/teste">
      <div class="sec">
        <h3>Testar sem gastar</h3>
        <p class="hint">Manda a confirmação de um pedido de mentira (Fulana de Tal, dois tênis, Frete Padrão)
          pro endereço que você quiser — dá pra conferir como chega no celular sem pagar um PIX de verdade.</p>
        <div class="fld" style="max-width:360px">
          <label>Enviar teste para</label>
          <input class="in" name="teste" type="email" required
            placeholder="${esc(cfg.replyTo || cfg.fromEmail || 'voce@email.com')}" autocomplete="off">
        </div>
        <button class="btn" type="submit" ${pronto ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>Enviar teste</button>
      </div>
    </form>

    <form method="post" action="/admin/email/enviar">
      <div class="sec">
        <h3>Escrever e-mail</h3>
        <p class="hint">Para um endereço só, ou para todo mundo que comprou num intervalo de datas.</p>

        <div class="chkline">
          <input type="radio" id="dst1" name="destino" value="um" checked onchange="modoDestino()">
          <label for="dst1" style="margin:0">Um endereço</label>
          <input type="radio" id="dst2" name="destino" value="periodo" onchange="modoDestino()" style="margin-left:18px">
          <label for="dst2" style="margin:0">Clientes de um período</label>
        </div>

        <div id="boxUm">
          <div class="fld">
            <label>Para</label>
            <input class="in" name="para" type="email" list="clientes"
              value="${esc(rasc.para)}" placeholder="cliente@email.com" autocomplete="off">
            <datalist id="clientes">${clientes.map((c) =>
              `<option value="${esc(c.email)}">${esc(c.nome)}</option>`).join('')}</datalist>
            ${clientes.length ? `<p class="muted2" style="margin:6px 0 0">${clientes.length} cliente${clientes.length === 1 ? '' : 's'} com e-mail nos pedidos.</p>` : ''}
          </div>
        </div>

        <div id="boxPeriodo" style="display:none">
          <div class="row3" style="grid-template-columns:1fr 1fr">
            <div class="fld" style="margin:0">
              <label>De</label>
              <input class="in" name="de" type="date">
            </div>
            <div class="fld" style="margin:0">
              <label>Até</label>
              <input class="in" name="ate" type="date">
            </div>
          </div>
          <div class="chkline" style="margin-top:10px">
            <input type="checkbox" id="sp" name="somentePagos" value="1" checked>
            <label for="sp" style="margin:0">Só quem pagou o pedido</label>
          </div>
          <p class="muted2" style="margin:0 0 12px">Desmarcado, entra também quem gerou PIX e não pagou. Deixe as datas em branco pra pegar todos os clientes da loja. Cada pessoa recebe uma vez, mesmo tendo comprado várias.</p>
        </div>

        <script>
          function modoDestino(){
            var p = document.getElementById('dst2').checked;
            document.getElementById('boxPeriodo').style.display = p ? '' : 'none';
            document.getElementById('boxUm').style.display = p ? 'none' : '';
            document.querySelector('[name=para]').required = !p;
            document.getElementById('btnEnviar').textContent = p ? 'Ver quem vai receber' : 'Enviar e-mail';
          }
        </script>
        <div class="fld">
          <label>Assunto</label>
          <input class="in" name="assunto" required maxlength="200"
            value="${esc(rasc.assunto)}" placeholder="Seu pedido na ${esc(cfg.fromNome || config.lojaNome)}">
        </div>
        <div class="fld">
          <label>Mensagem</label>
          <textarea class="in" name="mensagem" required maxlength="10000"
            placeholder="Escreva normalmente. As quebras de linha são mantidas.">${esc(rasc.mensagem)}</textarea>
        </div>
        <button class="btn" type="submit" id="btnEnviar" ${pronto ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>Enviar e-mail</button>
        ${pronto ? `<p class="muted2" style="margin:10px 0 0">Sai como <b>${esc(cfg.fromNome)}</b> &lt;${esc(cfg.fromEmail)}&gt;.</p>` : ''}
      </div>
    </form>

    <form method="post" action="/admin/email/config">
      <div class="sec">
        <h3>De onde os e-mails saem</h3>
        <p class="hint">${prov.dica}</p>
        <div class="fld" style="max-width:320px">
          <label>Serviço</label>
          <select class="in" name="provedor" onchange="this.form.submit()">${opcoesProvedor}</select>
          <p class="muted2" style="margin:6px 0 0">Trocar aqui já preenche servidor e porta.</p>
        </div>
        <div class="row3" style="grid-template-columns:1fr 120px">
          <div class="fld" style="margin:0">
            <label>Servidor (host)</label>
            <input class="in" name="host" value="${esc(cfg.host)}" placeholder="${esc(prov.host || 'smtp.seuprovedor.com')}">
          </div>
          <div class="fld" style="margin:0">
            <label>Porta</label>
            <input class="in" name="port" value="${esc(cfg.port)}" inputmode="numeric">
          </div>
        </div>
        <div class="fld">
          <label>${prov.remetenteFixo ? 'E-mail da conta' : 'Usuário'}</label>
          <input class="in" name="user" value="${esc(cfg.user)}"
            placeholder="${esc(prov.remetenteFixo ? 'nomedaloja@gmail.com' : (prov.user || 'seu login SMTP'))}"
            inputmode="${prov.remetenteFixo ? 'email' : 'text'}" autocomplete="off">
        </div>
        <div class="fld">
          <label>Senha / API key</label>
          <input class="in" name="pass" type="password" autocomplete="new-password"
            placeholder="${cfg.pass ? '•••••••• (já salva — deixe em branco pra manter)' : 'cole aqui'}">
        </div>
      </div>
      <div class="sec">
        <h3>Como o cliente vê o remetente</h3>
        <p class="hint">${prov.remetenteFixo
          ? 'O nome é livre, mas o endereço é sempre o da conta acima — o Gmail troca o "De" por ela de qualquer jeito.'
          : 'O e-mail remetente precisa estar verificado no serviço — domínio autenticado ou '
            + 'endereço confirmado por link. Sem isso o envio é recusado.'}</p>
        <div class="fld" style="max-width:320px">
          <label>Nome</label>
          <input class="in" name="fromNome" value="${esc(cfg.fromNome)}" placeholder="${esc(config.lojaNome)}">
        </div>
        <div class="fld" style="max-width:360px">
          <label>E-mail remetente</label>
          ${prov.remetenteFixo
            ? `<input class="in" value="${esc(cfg.user || '—')}" disabled style="opacity:.6">`
            : `<input class="in" name="fromEmail" value="${esc(cfg.fromEmail)}" placeholder="contato@exemplo.com.br" inputmode="email">`}
        </div>
        <div class="fld" style="max-width:360px">
          <label>Responder para <span style="opacity:.6">(opcional)</span></label>
          <input class="in" name="replyTo" value="${esc(cfg.replyTo)}" placeholder="${esc(getContato().email)}" inputmode="email">
          <p class="muted2" style="margin:6px 0 0">Onde cai a resposta do cliente. Em branco, cai no próprio remetente.</p>
        </div>
        <button class="btn" type="submit">Salvar configuração</button>
      </div>
    </form>

    <h3 style="margin:26px 0 12px;font-size:15px">Últimos envios</h3>
    <table>
      <tr><th>Quando</th><th>Status</th><th>Para</th><th>Assunto</th><th>Erro</th></tr>
      ${linhasHist}
    </table>`;
  res.type('html').send(layout('E-mail', inner, 'email'));
});

// GET /admin/email/confirmacao/previa — o e-mail exatamente como o cliente vê.
// Usa o último pedido PAGO de verdade quando existe: prévia com produto real é
// a única que mostra se o título do item cabe na linha e se a foto carrega.
router.get('/email/confirmacao/previa', async (req, res) => {
  const cfg = getEmailConfig();
  const real = req.query.exemplo === '1' ? null : (await listOrders({ limit: 1, status: 'paid' }))[0];
  const pedido = real || await pedidoExemplo();
  res.type('html').send(montarHtmlPedido(pedido, {
    fromNome: cfg.fromNome || config.lojaNome,
    contato: getContato(),
  }));
});

// POST /admin/email/confirmacao/teste — dispara a confirmação de um pedido de
// mentira. É o jeito de conferir o e-mail sem pagar um PIX pra valer.
router.post('/email/confirmacao/teste', async (req, res) => {
  const para = String(req.body?.teste || '').trim();
  if (!emailValido(para)) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent(`"${para.slice(0, 40)}" não é um e-mail válido.`)}`);
  }
  const cfg = getEmailConfig();
  const dados = { fromNome: cfg.fromNome || config.lojaNome, contato: getContato() };
  const pedido = await pedidoExemplo();
  const assunto = `[TESTE] ${assuntoPedido(pedido, dados.fromNome)}`;

  const r = await enviarEmail({
    para,
    assunto,
    mensagem: montarTextoPedido(pedido, dados),
    html: montarHtmlPedido(pedido, dados),
  });
  await logEmail({ para, assunto, corpo: '[teste da confirmação automática]', status: r.ok ? 'enviado' : 'erro', erro: r.erro });
  if (!r.ok) return res.redirect(`/admin/email?erro=${encodeURIComponent(r.erro)}`);
  res.redirect(`/admin/email?enviado=${encodeURIComponent(para)}`);
});

// POST /admin/email/config — salva remetente e credenciais.
router.post('/email/config', (req, res) => {
  const b = req.body || {};
  // Trocar o serviço no <select> dispara este POST com os campos ainda do
  // serviço antigo. Nesse caso o host/porta viram os do serviço novo, senão o
  // painel mostraria "Resend" apontando pro SMTP do Brevo.
  const trocouProvedor = PROVEDORES[b.provedor] && b.provedor !== getEmailConfig().provedor;
  const preset = PROVEDORES[b.provedor] || PROVEDORES.smtp;

  // No Gmail o remetente é o próprio usuário, então é o campo "E-mail da conta"
  // que precisa ser um endereço — o de remetente nem é enviado pelo formulário.
  const campoRemetente = preset.remetenteFixo
    ? { valor: b.user, nome: 'E-mail da conta' }
    : { valor: b.fromEmail, nome: 'E-mail remetente' };
  if (campoRemetente.valor && !emailValido(campoRemetente.valor)) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent(
      `${campoRemetente.nome}: "${String(campoRemetente.valor).slice(0, 40)}" não é um e-mail válido.`)}`);
  }
  if (b.replyTo && !emailValido(b.replyTo)) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent(`"${String(b.replyTo).slice(0, 40)}" não é um e-mail válido.`)}`);
  }

  saveEmailConfig({
    ...b,
    host: trocouProvedor ? preset.host : b.host,
    port: trocouProvedor ? preset.port : b.port,
    user: trocouProvedor ? preset.user : b.user,
  });
  console.log(`[admin] config de e-mail salva — serviço: ${b.provedor}`);
  res.redirect('/admin/email?saved=1');
});

// POST /admin/email/enviar — manda o e-mail escrito na tela.
// No modo "período" não envia nada: leva pra tela de confirmação, porque
// disparar pra uma lista inteira é o tipo de coisa que não tem desfazer.
router.post('/email/enviar', async (req, res) => {
  const para = String(req.body?.para || '').trim();
  const assunto = String(req.body?.assunto || '').trim();
  const mensagem = String(req.body?.mensagem || '');

  if (!assunto || !mensagem.trim()) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent('Assunto e mensagem não podem ficar vazios.')}`);
  }

  if (req.body?.destino === 'periodo') return await telaConfirmacao(req, res);

  const r = await enviarEmail({ para, assunto, mensagem });
  await logEmail({ para, assunto, corpo: mensagem, status: r.ok ? 'enviado' : 'erro', erro: r.erro });

  if (!r.ok) {
    console.error(`[admin] envio de e-mail falhou para ${para}: ${r.erro}`);
    // Devolve o rascunho junto do erro pra não perder o texto escrito.
    const q = new URLSearchParams({ erro: r.erro, para, assunto, mensagem: mensagem.slice(0, 1500) });
    return res.redirect(`/admin/email?${q}`);
  }
  console.log(`[admin] e-mail enviado para ${para}`);
  res.redirect(`/admin/email?enviado=${encodeURIComponent(para)}`);
});

// Confirmação do envio em lote: quantos vão receber, quem são, e só então o
// botão que dispara. O texto do e-mail viaja em campos escondidos pra não
// precisar reescrever se a lista não for a esperada.
async function telaConfirmacao(req, res) {
  const de = String(req.body?.de || '');
  const ate = String(req.body?.ate || '');
  const somentePagos = req.body?.somentePagos === '1';
  const assunto = String(req.body?.assunto || '').trim();
  const mensagem = String(req.body?.mensagem || '');

  const lista = await emailsDosClientes({ de, ate, somentePagos });
  const periodo = de || ate
    ? `de <b>${esc(de || 'sempre')}</b> até <b>${esc(ate || 'hoje')}</b>`
    : '<b>todo o histórico</b>';

  if (!lista.length) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent(
      `Nenhum cliente com e-mail ${somentePagos ? 'e pedido pago ' : ''}nesse período. Tente alargar as datas ou desmarcar "só quem pagou".`)}`);
  }

  // O plano grátis do Resend entrega 100 por dia; passar disso faz o resto
  // falhar no meio do lote, e o motivo não é óbvio olhando o histórico.
  const alerta = lista.length > 100
    ? `<div class="note" style="margin-bottom:14px">⚠️ São <b>${lista.length}</b> destinatários. O plano grátis do Resend entrega <b>100 por dia</b> — o que passar disso vai falhar. Considere quebrar em períodos menores.</div>`
    : '';

  const linhas = lista.slice(0, 200).map((c) => `<tr>
      <td>${esc(c.email)}</td><td>${esc(c.nome || '—')}</td><td class="mono">${dt(c.quando)}</td>
    </tr>`).join('');

  const inner = `
    <a class="back" href="/admin/email">← voltar e alterar</a>
    <h2 style="margin:0 0 6px">Confirmar envio em lote</h2>
    <p style="color:var(--soft);margin:0 0 18px">Ninguém recebeu nada ainda. Confira a lista antes de disparar.</p>
    ${alerta}
    <div class="sec">
      <h3>Vai para ${lista.length} ${lista.length === 1 ? 'pessoa' : 'pessoas'}</h3>
      <p class="hint">Clientes ${somentePagos ? 'com pedido <b>pago</b>' : '(pagos e pendentes)'}, ${periodo}. Cada um recebe um e-mail separado — ninguém vê o endereço dos outros.</p>
      <div class="kv"><span class="kk">Assunto</span><span class="vv"><b>${esc(assunto)}</b></span></div>
      <div class="kv"><span class="kk">Primeiras linhas</span><span class="vv">${esc(mensagem.slice(0, 180))}${mensagem.length > 180 ? '…' : ''}</span></div>
    </div>
    <form method="post" action="/admin/email/lote">
      <input type="hidden" name="de" value="${esc(de)}">
      <input type="hidden" name="ate" value="${esc(ate)}">
      <input type="hidden" name="somentePagos" value="${somentePagos ? '1' : ''}">
      <input type="hidden" name="assunto" value="${esc(assunto)}">
      <textarea name="mensagem" style="display:none">${esc(mensagem)}</textarea>
      <button class="btn" type="submit">Confirmar e enviar para ${lista.length}</button>
      <a class="back" href="/admin/email" style="margin-left:14px">cancelar</a>
    </form>
    <h3 style="margin:26px 0 12px;font-size:15px">Quem vai receber${lista.length > 200 ? ' (primeiros 200)' : ''}</h3>
    <table><tr><th>E-mail</th><th>Nome</th><th>Última compra</th></tr>${linhas}</table>`;
  return res.type('html').send(layout('Confirmar envio', inner, 'email'));
}

// POST /admin/email/lote — dispara de verdade, um e-mail por pessoa.
// Responde na hora e envia em segundo plano: com 100 destinatários e a pausa
// entre eles, a requisição estouraria o tempo limite do navegador. O resultado
// de cada um cai no histórico, que é onde se acompanha.
router.post('/email/lote', async (req, res) => {
  const de = String(req.body?.de || '');
  const ate = String(req.body?.ate || '');
  const somentePagos = req.body?.somentePagos === '1';
  const assunto = String(req.body?.assunto || '').trim();
  const mensagem = String(req.body?.mensagem || '');
  const lista = await emailsDosClientes({ de, ate, somentePagos });

  if (!assunto || !mensagem.trim() || !lista.length) {
    return res.redirect(`/admin/email?erro=${encodeURIComponent('Envio em lote cancelado: faltou assunto, mensagem ou destinatário.')}`);
  }

  res.redirect(`/admin/email?lote=${lista.length}`);

  // `emSegundoPlano` é o que mantém a instância de pé depois da resposta: na
  // Vercel ela pode ser congelada assim que o redirect sai, e o lote morreria
  // no primeiro destinatário. O limite de tempo da função continua valendo —
  // lote grande é melhor partir em dois períodos.
  emSegundoPlano((async () => {
    let ok = 0; let falhou = 0;
    for (const c of lista) {
      const r = await enviarEmail({ para: c.email, assunto, mensagem });
      await logEmail({ para: c.email, assunto, corpo: mensagem, status: r.ok ? 'enviado' : 'erro', erro: r.erro });
      if (r.ok) ok++; else falhou++;
      // Meio segundo entre um e outro: os provedores cortam quem dispara rajada,
      // e um lote deste tamanho não tem pressa nenhuma.
      await new Promise((s) => setTimeout(s, 500));
    }
    console.log(`[admin] lote concluído — ${ok} enviados, ${falhou} com erro`);
  })(), 'lote de e-mail');
});

// POST /admin/order/:id/rastreio-buscar — repesca no sistema de rastreio o
// código de um pedido pago que ficou sem ele.
//
// Substituiu o campo onde se digitava o código à mão (06/10/2026): o código
// nasce no RotaSync quando o pagamento é confirmado, e dois lugares criando
// rastreio é como o pedido acaba com um código que o cliente não vê — o aviso
// ao cliente sai de lá, com o código de lá.
//
// Não cria encomenda, só consulta: se a criação falhou de verdade (API fora na
// hora do pagamento), não há o que repescar, e a mensagem diz isso em vez de
// abrir uma encomenda nova por um clique no painel.
router.post('/order/:id/rastreio-buscar', async (req, res) => {
  const id = req.params.id;
  const o = await getOrder(id);
  if (!o) return res.status(404).send('não encontrado');

  const r = await consultarRastreio(id);
  if (r.ok) {
    await setTrackingCode(id, r.codigo, r.url);
    console.log(`[admin] rastreio repescado pedido=${id} codigo=${r.codigo}`);
  } else {
    console.warn(`[admin] rastreio não encontrado no sistema pedido=${id}: ${r.motivo}`);
  }
  res.redirect(`/admin/order/${encodeURIComponent(id)}?rastreio=${r.ok ? 'ok' : 'nao'}`);
});

// POST /admin/order/:id/pay — confirma pagamento manualmente
router.post('/order/:id/pay', async (req, res) => {
  const o = await getOrder(req.params.id);
  if (!o) return res.status(404).send('não encontrado');
  try {
    await markOrderPaid(req.params.id);
  } catch (e) {
    console.error('[admin] marcar pago falhou:', e.message);
  }
  res.redirect(`/admin/order/${encodeURIComponent(req.params.id)}`);
});

// ---------------------------------------------------------------------------
// GET /admin/app — instalar o painel como aplicativo e ligar as notificações
// ---------------------------------------------------------------------------
// ------------------------------------------------------------- SEGURANÇA
//
// Três coisas na mesma tela porque respondem à mesma pergunta ("quem entra no
// meu painel, e o que sai daqui pra fora"): a verificação em duas etapas, o
// diário de acessos e a marca que tira o dono do rastreio da própria loja.

const RESULTADO_BADGE = {
  ok: '<span class="b b-paid">Entrou</span>',
  senha: '<span class="b b-pend">Senha errada</span>',
  '2fa': '<span class="b b-pend">Código errado</span>',
  bloqueio: '<span class="b b-pend">Bloqueado</span>',
};

// O user-agent inteiro é ilegível numa tabela. O que interessa a quem olha é
// "isso parece o meu aparelho?", e pra isso bastam o sistema e o navegador.
function aparelhoCurto(ua) {
  const s = String(ua || '');
  if (!s) return '—';
  const so = /iPhone|iPad/i.test(s) ? 'iPhone' : /Android/i.test(s) ? 'Android'
    : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac'
      : /Linux/i.test(s) ? 'Linux' : 'outro';
  const nav = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera'
    : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari'
      : /Firefox\//.test(s) ? 'Firefox' : '';
  return nav ? `${so} · ${nav}` : so;
}

router.get('/seguranca', async (req, res) => {
  try {
  const ativo = doisFatoresAtivo();
  const pendente = ativo ? null : pendenteDoisFatores(config.admin.user, config.lojaNome);
  const restantes = codigosBackupRestantes();
  const acessos = await listAcessos(100);

  // QR do segredo pendente. É desenhado aqui no servidor e vai como data URI:
  // mandar o segredo para um gerador de QR de terceiro seria entregar a chave
  // do 2FA justamente a quem não deveria vê-la.
  let qr = '';
  if (pendente) {
    qr = await QRCode.toDataURL(pendente.uri, { margin: 1, width: 232 })
      .catch(() => '');
  }

  const bloco2fa = ativo
    ? `<div class="note" style="border-color:#2e9e4f">✅ <b>Ligada.</b> Todo login novo pede o código de 6 dígitos do seu app.</div>
       <div class="kv"><span class="kk">Códigos de emergência restantes</span>
         <span class="vv"><b>${restantes}</b> de 8</span></div>
       ${restantes <= 2 ? '<div class="note" style="border-color:#f0a3ae;margin-top:10px">⚠️ Estão acabando. Desligue e ligue de novo a verificação para gerar oito códigos novos.</div>' : ''}
       <form method="post" action="/admin/seguranca/2fa/desligar" style="margin-top:14px"
         onsubmit="return confirm('Desligar a verificação em duas etapas? O painel volta a exigir só a senha.')">
         <button class="btn" type="submit" style="background:#4a1620">Desligar verificação em duas etapas</button>
       </form>`
    : pendente
      ? `<p class="hint">1. Abra o app autenticador (Google Authenticator, Authy, 1Password…) e escaneie:</p>
         ${qr ? `<img src="${qr}" alt="QR Code da verificação em duas etapas" width="232" height="232"
           style="border-radius:12px;background:#fff;padding:8px;display:block;margin:0 0 12px">` : ''}
         <p class="hint">Não consegue escanear? digite este código no app:</p>
         <div class="kv"><span class="kk">Chave</span>
           <span class="vv mono" style="letter-spacing:.08em;word-break:break-all">${esc(pendente.segredo)}</span></div>
         <p class="hint" style="margin-top:14px">2. Digite abaixo o código de 6 dígitos que o app mostrar:</p>
         <form method="post" action="/admin/seguranca/2fa/confirmar">
           <input class="in" name="codigo" inputmode="numeric" maxlength="6" autocomplete="off"
             placeholder="000000" style="max-width:180px;text-align:center;letter-spacing:.3em;font-size:19px">
           <button class="btn" type="submit" style="margin-left:8px">Confirmar e ligar</button>
         </form>`
      : `<p class="hint">Hoje o painel abre <b>só com a senha</b>. Com a verificação ligada, quem souber a senha ainda precisa do código que muda a cada 30 segundos no seu celular.</p>
         <form method="post" action="/admin/seguranca/2fa/iniciar">
           <button class="btn" type="submit">Ligar verificação em duas etapas</button>
         </form>`;

  const geos = await getGeos();
  const meuIp = req.ip || '';
  // Mesmo filtro do POST: sem ele o botão anunciaria IPs que a consulta pula,
  // e o contador ficaria preso em "3 IPs novos" para sempre.
  const faltam = (await ipsSemGeo(40)).filter((ip) => !ehCloudflare(ip)).length;

  const linhas = acessos.map((a) => {
    // Registro anterior à correção do trust proxy: o IP gravado é o da BORDA
    // DA CLOUDFLARE, não o de quem acessou. Marcado pelo que é, em vez de
    // mostrar "Seattle · Cloudflare ⚠ datacenter" — que era falso alarme, e
    // alarme falso repetido ensina a ignorar o verdadeiro. O registro fica (a
    // data, o resultado e o aparelho continuam valendo); só o IP não presta.
    const antigo = ehCloudflare(a.ip);
    const g = antigo ? null : geos.get(a.ip);
    const suspeito = g && ehDatacenter(g.operadora);
    // Marcar o IP de onde o dono está AGORA é o que torna a coluna legível:
    // sem isso ele teria de decorar o próprio endereço para comparar.
    const eVoce = a.ip && a.ip === meuIp;
    const onde = antigo
      ? '<span style="color:#6b6577">registro antigo — este IP é o da Cloudflare, não o de quem acessou</span>'
      : g
        ? `<span${suspeito ? ' style="color:#f0a3ae"' : ''}>${esc(resumoGeo(g) || '—')}</span>${suspeito ? ' <b style="color:#f0a3ae">⚠ datacenter/VPN</b>' : ''}`
        : '<span style="color:#6b6577">—</span>';
    return `<tr${eVoce ? ' style="background:#151d18"' : ''}>
      <td class="mono">${dt(a.created_at)}</td>
      <td>${RESULTADO_BADGE[a.resultado] || esc(a.resultado)}</td>
      <td class="mono"${antigo ? ' style="color:#6b6577"' : ''}>${esc(a.ip || '—')}${eVoce ? ' <b style="color:#7ee29a">← você</b>' : ''}</td>
      <td>${onde}</td>
      <td>${esc(aparelhoCurto(a.user_agent))}</td>
      <td>${esc(a.usuario || '—')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#6b6577">Nenhum acesso registrado ainda.</td></tr>';

  const inner = `
    <h2 style="margin:0 0 6px">Segurança</h2>
    <p style="color:var(--soft);margin:0 0 18px">Quem entra no painel, de onde, e o que a loja conta a terceiros sobre você.</p>

    <div class="sec">
      <h3>Verificação em duas etapas</h3>
      ${bloco2fa}
    </div>

    <div class="sec">
      <h3>De onde você está agora</h3>
      <div class="kv"><span class="kk">Seu IP neste acesso</span>
        <span class="vv mono"><b style="color:var(--ink)">${esc(meuIp || '—')}</b></span></div>
      <div class="kv"><span class="kk">Onde fica</span>
        <span class="vv">${esc(resumoGeo(geos.get(meuIp)) || 'ainda não consultado')}</span></div>
      <p class="hint">Este é o seu "normal". Guarde de cabeça: é comparando com ele que os outros da lista abaixo passam a querer dizer alguma coisa. <b>No celular ele muda o tempo todo</b> — na rede móvel o endereço troca sozinho, então IP diferente sozinho não é motivo de susto. O que vale reparar é <b>cidade que você nunca visitou</b> e, principalmente, <b>datacenter ou VPN</b>.</p>
    </div>

    <div class="sec">
      <h3>Últimos acessos ao painel <span class="cnt">${acessos.length}</span></h3>
      <p class="hint">Toda tentativa entra aqui — a que deu certo e a que errou a senha. <b>Senha errada de IPs desconhecidos é ruído de fundo</b>: robôs varrem a internet procurando painéis o dia inteiro, e o freio já trava na 9ª tentativa. O que exige ação é <b>"Entrou" de um IP que não é você</b> — nesse caso troque a ADMIN_PASSWORD no Render, que derruba todas as sessões abertas na hora, e ligue a verificação em duas etapas.</p>
      <form method="post" action="/admin/seguranca/geo" style="margin-bottom:14px">
        <button class="btn" type="submit" style="background:#272233"${faltam ? '' : ' disabled'}>
          🌎 Descobrir cidade e operadora${faltam ? ` (${faltam} IP${faltam === 1 ? '' : 's'} novo${faltam === 1 ? '' : 's'})` : ' — tudo consultado'}
        </button>
      </form>
      <p class="muted2" style="margin:-8px 0 14px">Só consulta quando você clica, e cada IP uma única vez. É consulta a um serviço de fora (ipwho.is), então o endereço sai daqui — por isso não é automático.</p>
      <table>
        <thead><tr><th>Quando</th><th>Resultado</th><th>IP</th><th>De onde</th><th>Aparelho</th><th>Usuário digitado</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  res.type('html').send(layout('Segurança', inner, 'seg'));
  } catch (e) {
    // Rota async: sem este catch, um erro aqui viraria unhandled rejection.
    console.error('[admin/seguranca]', e);
    res.status(500).type('html').send(layout('Segurança',
      '<div class="note" style="border-color:#f0a3ae;max-width:640px">Não consegui montar esta tela. O erro está no log do Render.</div>', 'seg'));
  }
});

// Consulta cidade/operadora dos IPs que ainda não têm. Sob demanda, nunca
// automático — ver o comentário de geoip.js. Em sequência e não em paralelo:
// são até 40 endereços num clique, e o serviço é gratuito; disparar 40 pedidos
// de uma vez é o jeito mais rápido de tomar bloqueio por excesso.
router.post('/seguranca/geo', async (_req, res) => {
  try {
    // IP de borda da Cloudflare fica de fora: são os registros anteriores à
    // correção do trust proxy, e consultar só devolveria a cidade do
    // datacenter que atendeu — informação sobre a Cloudflare, não sobre quem
    // acessou. Gastaria consulta para preencher a tabela com ruído.
    for (const ip of (await ipsSemGeo(40)).filter((ip) => !ehCloudflare(ip))) {
      const g = await consultarGeo(ip);
      // Sem resultado não grava: fica sem cache e o próximo clique tenta de
      // novo, em vez de guardar um "não sei" para sempre.
      if (g) await saveGeo(g);
    }
  } catch (e) {
    console.error('[admin/geo]', e.message);
  }
  res.redirect('/admin/seguranca');
});

router.post('/seguranca/2fa/iniciar', (_req, res) => {
  iniciarDoisFatores(config.admin.user, config.lojaNome);
  res.redirect('/admin/seguranca');
});

router.post('/seguranca/2fa/confirmar', (req, res) => {
  const r = confirmarDoisFatores(req.body?.codigo);
  if (!r.ok) {
    return res.type('html').send(layout('Segurança', `
      <div class="note" style="border-color:#f0a3ae;max-width:640px">❌ ${esc(r.erro)}</div>
      <p><a href="/admin/seguranca">← voltar</a></p>`, 'seg'));
  }
  // Os códigos de emergência aparecem UMA vez, aqui. Não há segunda chance de
  // propósito: guardá-los em claro no banco para reexibir depois derrubaria o
  // motivo de eles existirem.
  const lista = r.backup.map((c) => `<div class="mono" style="font-size:17px;padding:7px 0;letter-spacing:.06em">${esc(c)}</div>`).join('');
  res.type('html').send(layout('Segurança', `
    <div class="note" style="border-color:#2e9e4f;max-width:640px">✅ <b>Verificação em duas etapas ligada.</b></div>
    <div class="sec" style="max-width:640px">
      <h3>Guarde estes 8 códigos de emergência AGORA</h3>
      <p class="hint">Eles são a sua saída se você perder o celular do app. <b>Esta tela não volta.</b> Imprima, tire uma foto, ou guarde no gerenciador de senhas — em algum lugar que não seja o próprio celular do autenticador.</p>
      <div style="background:#0e0d14;border:1.5px solid var(--line);border-radius:10px;padding:14px 18px;margin:12px 0">${lista}</div>
      <p class="muted2">Cada um funciona <b>uma única vez</b>, no mesmo campo do código.</p>
      <p style="margin-top:16px"><a class="btn" href="/admin/seguranca" style="text-decoration:none">Guardei — voltar</a></p>
    </div>`, 'seg'));
});

router.post('/seguranca/2fa/desligar', (_req, res) => {
  desligarDoisFatores();
  res.redirect('/admin/seguranca');
});



router.get('/app', async (req, res) => {
  const prefs = getPushPrefs();
  const subs = await listPushSubs();
  const saved = req.query.saved === '1';
  const testado = req.query.teste;

  const lista = subs.length
    ? subs.map((s) => `
        <div class="kv">
          <span class="kk">
            <b style="color:var(--ink)">${esc(s.apelido || 'Aparelho')}</b><br>
            <span style="font-size:12px">ligado em ${dt(s.createdAt)}${s.lastOk ? ` · último aviso entregue ${dt(s.lastOk)}` : ' · ainda não recebeu nenhum'}</span>
            ${s.lastErro ? `<br><span style="font-size:12px;color:#f0a3ae">⚠️ última tentativa falhou — ${esc(s.lastErro)}</span>` : ''}
          </span>
          <span class="vv">
            <form method="post" action="/admin/app/remover" onsubmit="return confirm('Este aparelho para de receber notificação. Confirma?')">
              <input type="hidden" name="endpoint" value="${esc(s.endpoint)}">
              <button class="navbtn" type="submit">Remover</button>
            </form>
          </span>
        </div>`).join('')
    : '<div class="note">Nenhum aparelho ligado ainda — <b>nenhuma notificação está sendo enviada</b>. Use o botão acima no celular em que você quer receber.</div>';

  const avisoTeste = testado === 'ok'
    ? '<div class="saved" style="max-width:720px;margin-bottom:16px">📤 Teste disparado. Deve chegar em alguns segundos — inclusive com o app fechado.</div>'
    : testado === 'vazio'
      ? '<div class="note" style="max-width:720px;margin-bottom:16px">Nenhum aparelho ligado ainda, então não havia para onde mandar.</div>'
      : '';

  const inner = `
    <h2 style="margin:0 0 6px">App no celular</h2>
    <p style="color:var(--soft);margin:0 0 18px">Instala este painel como aplicativo na tela de início e faz o celular apitar quando cai pedido. Não passa por loja de aplicativo: é o próprio painel, com ícone e notificação.</p>
    ${saved ? '<div class="saved" style="max-width:720px;margin-bottom:16px">✅ Preferências salvas.</div>' : ''}
    ${avisoTeste}

    <div class="sec">
      <h3>1. Ligar as notificações neste aparelho</h3>
      <p class="hint">Precisa ser feito <b>em cada celular</b> que for receber — o navegador guarda a permissão por aparelho, não por conta.</p>
      <div id="estado" class="note" style="margin-bottom:12px">Verificando este aparelho…</div>
      <button class="btn" id="ligar" type="button" style="display:none">🔔 Ligar notificações neste aparelho</button>
      <form method="post" action="/admin/app/teste" style="display:inline-block;margin-left:8px">
        <button class="btn" type="submit" style="background:#272233">Enviar teste</button>
      </form>
    </div>

    <div class="sec">
      <h3>Se a notificação só chega quando você abre o app</h3>
      <p class="hint">Isso é a <b>economia de bateria do Android</b> congelando o aplicativo: as mensagens ficam represadas e só entram quando você abre. O ajuste é no celular, uma vez — o site não tem como mandar nisso.</p>
      <div class="kv"><span class="kk"><b style="color:var(--ink)">1. Liberar o app</b><br><span style="font-size:12.5px">Ajustes → <b>Apps</b> → <b>${esc(config.lojaNome)} Admin</b> → <b>Bateria</b> → marcar <b>Sem restrições</b> (em alguns aparelhos: "Não otimizar" ou "Irrestrito").</span></span></div>
      <div class="kv"><span class="kk"><b style="color:var(--ink)">2. Liberar o Chrome também</b><br><span style="font-size:12.5px">Mesmo caminho, mas em <b>Chrome</b>. É ele quem recebe a mensagem e entrega pro app — se o Chrome estiver congelado, o app não fica sabendo.</span></span></div>
      <div class="kv"><span class="kk"><b style="color:var(--ink)">3. Xiaomi, Motorola, Samsung e afins</b><br><span style="font-size:12.5px">Esses fabricantes têm uma trava extra, por fora do Android. Procure por <b>Início automático</b>, <b>Autostart</b> ou <b>Apps em suspensão</b> e libere os dois. Na Xiaomi costuma ser o que resolve.</span></span></div>
      <p class="muted2" style="margin:12px 0 0">Depois de ajustar: deixe o celular bloqueado uns 15 minutos e mande um <b>Enviar teste</b> de outro aparelho (ou peça para alguém). Se chegar com a tela apagada, está resolvido.</p>
    </div>

    <div class="sec">
      <h3>Diagnóstico da imagem</h3>
      <p class="hint">Só serve para descobrir por que a notificação aparece com a imagem errada. Ele primeiro tenta <b>baixar</b> a arte neste celular e conta o resultado aqui na tela, depois dispara <b>três notificações iguais</b>, cada uma pedindo a imagem de um jeito diferente. Olhe qual delas mostra o "47" roxo e me conte o número — é isso que diz onde está o problema.</p>
      <div id="diag" class="note" style="margin-bottom:12px">Toque no botão para começar.</div>
      <button class="btn" id="btdiag" type="button" style="background:#272233">🔬 Testar a imagem neste celular</button>
    </div>

    <div class="sec">
      <h3>2. Colocar o ícone na tela de início</h3>
      <p class="hint">Sem isso funciona igual pelo navegador <b>no Android</b>. <b>No iPhone é obrigatório</b>: o iOS só entrega notificação para site que está na tela de início — no Safari em aba, ele nem deixa pedir permissão.</p>
      <div class="kv"><span class="kk"><b style="color:var(--ink)">iPhone (Safari)</b><br><span style="font-size:12.5px">Abrir <b>o /admin desta loja</b> no Safari → botão <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b>. Depois abra pelo ícone novo e volte aqui para ligar as notificações.</span></span></div>
      <div class="kv"><span class="kk"><b style="color:var(--ink)">Android (Chrome)</b><br><span style="font-size:12.5px">Use o botão abaixo. No menu <b>⋮</b> do Chrome, <b>"Instalar aplicativo"</b> faz a mesma coisa — mas <b>"Adicionar à tela inicial"</b> NÃO: aquilo cria só um atalho, e atalho deixa a notificação pertencendo ao Chrome, com o ícone dele.</span></span></div>
      <div id="instalastatus" class="note" style="margin:12px 0">Verificando…</div>
      <button class="btn" id="btinstalar" type="button" style="display:none">📲 Instalar como aplicativo</button>
    </div>

    <form method="post" action="/admin/app/config">
      <div class="sec">
        <h3>3. Quando o celular deve apitar</h3>
        <p class="hint">Vale para todos os aparelhos da lista.</p>
        <label class="chkline"><input type="checkbox" name="pago" ${prefs.pago ? 'checked' : ''}> <span><b>Venda aprovada</b> — o PIX foi pago. <span class="muted2">Chega mesmo que o celular esteja sem sinal na hora: fica guardada por 24h.</span></span></label>
        <label class="chkline"><input type="checkbox" name="pix" ${prefs.pix ? 'checked' : ''}> <span><b>PIX gerado</b> — alguém fechou o carrinho e ainda não pagou. <span class="muted2">Apita mais: nem todo PIX vira venda. Quando o pagamento entra, o aviso de venda substitui este na tela.</span></span></label>
        <button class="btn" type="submit">Salvar</button>
      </div>
    </form>

    <div class="sec">
      <h3>Aparelhos recebendo hoje</h3>
      <p class="hint">Trocou de celular, ou parou de receber? Remova aqui e ligue de novo no aparelho novo.</p>
      ${lista}
    </div>

    <script>
    (function () {
      var caixa = document.getElementById('estado');
      var botao = document.getElementById('ligar');
      var CHAVE = ${JSON.stringify(chavePublica())};

      function diz(txt, classe) { caixa.className = classe || 'note'; caixa.innerHTML = txt; }

      // A chave VAPID viaja em base64url e a API do navegador quer bytes crus.
      function bytesDaChave(base64url) {
        var b64 = (base64url + '='.repeat((4 - base64url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }

      function apelido() {
        var ua = navigator.userAgent;
        var aparelho = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
          : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
          : /Mac/.test(ua) ? 'Mac' : 'Aparelho';
        var nav = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox'
          : /Safari/.test(ua) ? 'Safari' : 'navegador';
        return aparelho + ' (' + nav + ')';
      }

      var naTelaDeInicio = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
      var ehApple = /iPhone|iPad|iPod/.test(navigator.userAgent);

      // --- Instalar de verdade (WebAPK) ---
      // O atalho de "Adicionar à tela inicial" e o app instalado sao coisas
      // diferentes, e a diferenca aparece justamente na notificacao: no atalho
      // quem entrega e o Chrome, entao o Android mostra o NOME DO SITE e o
      // ICONE DO CHROME, e a arte da loja fica so no cantinho. Instalado, a
      // notificacao passa a ser do app — nome e icone da Nation.
      // Por isso este botao existe: ele dispara a instalacao DE VERDADE, sem
      // depender de achar o item certo no menu do Chrome (o item errado, que
      // esta logo ao lado, cria justamente o atalho que causa o problema).
      var promptInstalar = null;
      var cxinst = document.getElementById('instalastatus');
      var btinst = document.getElementById('btinstalar');
      var jaInstalado = naTelaDeInicio;

      function dizInst(txt, classe) { cxinst.className = classe || 'note'; cxinst.innerHTML = txt; }

      window.addEventListener('beforeinstallprompt', function (e) {
        // Segura o aviso automatico do Chrome pra disparar no clique do botao.
        // So chega aqui quando NAO existe app instalado — o proprio evento e a
        // prova de que hoje isto e atalho (ou nada).
        e.preventDefault();
        promptInstalar = e;
        btinst.style.display = 'inline-block';
        dizInst('Este aparelho <b>ainda não tem o aplicativo instalado</b> — o que existe hoje é atalho. Toque no botão: a janela que abrir precisa dizer <b>Instalar</b>.');
      });

      window.addEventListener('appinstalled', function () {
        dizInst('✅ Instalado! Agora <b>apague o ícone antigo</b> da tela de início, abra pelo novo e ligue as notificações lá dentro.', 'saved');
        btinst.style.display = 'none';
      });

      btinst.addEventListener('click', async function () {
        if (!promptInstalar) return;
        btinst.disabled = true;
        promptInstalar.prompt();
        var escolha = await promptInstalar.userChoice;
        promptInstalar = null;
        btinst.disabled = false;
        if (escolha.outcome !== 'accepted') {
          dizInst('Instalação cancelada. Recarregue a página para tentar de novo.');
          btinst.style.display = 'none';
        }
      });

      if (jaInstalado) {
        dizInst('✅ Você está <b>dentro do aplicativo instalado</b> agora.', 'saved');
      } else if (ehApple) {
        dizInst('No iPhone é pelo Safari: <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. O iOS não tem botão de instalar.');
      } else {
        // O evento chega logo depois do carregamento; esta espera evita
        // anunciar "nao da pra instalar" antes de o Chrome ter se manifestado.
        setTimeout(function () {
          if (!promptInstalar && !jaInstalado) {
            dizInst('O Chrome não ofereceu instalação nesta página. Quase sempre significa que <b>o app já está instalado</b> — nesse caso feche isto e abra pelo ícone da tela de início. Se não estiver, confira se você está mesmo no <b>Chrome</b>.');
          }
        }, 2500);
      }

      // --- Diagnóstico da imagem ---
      // Existe porque a notificação chegava com a imagem do Google mesmo com o
      // app instalado certo e o service worker usando o titulo/corpo enviados.
      // Trocar a arte no servidor duas vezes nao mudou nada, entao adivinhar
      // saiu caro: isto separa "o celular nao consegue baixar a imagem" de "o
      // Android ignora a imagem", que tem conserto completamente diferente.
      // A MESMA arte que o service worker manda. Eram dois caminhos diferentes,
      // e o diagnóstico testava um arquivo que a notificação real não usava.
      var ARTE = '/assets/app/notificacao-logo-192.png';
      var btdiag = document.getElementById('btdiag');
      var cxdiag = document.getElementById('diag');

      btdiag.addEventListener('click', async function () {
        btdiag.disabled = true;
        var linhas = [];
        function mostra() { cxdiag.innerHTML = linhas.join('<br>'); }
        linhas.push('Começando…'); mostra();

        try {
          if (!('serviceWorker' in navigator)) throw new Error('sem service worker neste navegador');
          var reg = await navigator.serviceWorker.getRegistration('/admin');
          if (!reg) throw new Error('o app ainda não está registrado — ligue as notificações antes');

          // Passo 1: o celular consegue mesmo baixar o arquivo?
          // Se falhar aqui, o problema nunca foi a arte: e rede/cache/bloqueio.
          var dataUri = null;
          try {
            var resp = await fetch(ARTE, { cache: 'no-store' });
            var blob = await resp.blob();
            linhas.push('1️⃣ Baixar a imagem: <b style="color:#7ee29a">deu certo</b> — '
              + blob.size + ' bytes, tipo ' + (blob.type || 'desconhecido'));
            dataUri = await new Promise(function (ok, falha) {
              var fr = new FileReader();
              fr.onload = function () { ok(fr.result); };
              fr.onerror = function () { falha(new Error('não converteu')); };
              fr.readAsDataURL(blob);
            });
          } catch (e) {
            linhas.push('1️⃣ Baixar a imagem: <b style="color:#f0a3ae">FALHOU</b> — ' + e.message
              + '<br><i>Achamos o problema: o celular não consegue pegar a arte.</i>');
          }
          mostra();

          // Passo 2: tres notificacoes iguais, mudando SO como a imagem e pedida.
          // A terceira leva a imagem embutida no proprio pedido (data:), que nao
          // depende de baixar nada — se ate ela sair errada, quem manda na
          // imagem e o Android, e nao ha o que mudar no site.
          await reg.showNotification('1 · caminho relativo', {
            body: 'A imagem apareceu certa aqui?', icon: ARTE, tag: 'diag1',
          });
          await reg.showNotification('2 · endereço completo', {
            body: 'A imagem apareceu certa aqui?', icon: location.origin + ARTE, tag: 'diag2',
          });
          if (dataUri) {
            await reg.showNotification('3 · imagem embutida', {
              body: 'Esta não precisa baixar nada.', icon: dataUri, tag: 'diag3',
            });
          }
          linhas.push('2️⃣ Disparei ' + (dataUri ? 3 : 2) + ' notificações. Olhe a barra de notificações'
            + ' e me diga <b>quais mostram o "47" roxo</b> e quais mostram a imagem do Google.');
          mostra();
        } catch (e) {
          linhas.push('<b style="color:#f0a3ae">Parou:</b> ' + (e && e.message ? e.message : e));
          mostra();
        }
        btdiag.disabled = false;
      });

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // No iPhone essa é quase sempre a MESMA situação do passo 2: fora da
        // tela de início o iOS esconde a API inteira, e a mensagem genérica de
        // "navegador não suporta" mandaria trocar de celular à toa.
        diz(ehApple && !naTelaDeInicio
          ? 'Falta o passo 2: no iPhone as notificações só existem depois de <b>Adicionar à Tela de Início</b>. Faça isso, abra pelo ícone novo e volte nesta tela.'
          : 'Este navegador não faz notificação. Tente pelo <b>Chrome</b> (Android) ou <b>Safari</b> (iPhone, iOS 16.4 ou mais novo).');
        return;
      }
      if (ehApple && !naTelaDeInicio) {
        diz('Quase lá: no iPhone, faça o <b>passo 2</b> primeiro. Depois abra o painel pelo ícone da tela de início e volte aqui.');
        return;
      }
      if (Notification.permission === 'denied') {
        diz('As notificações estão <b>bloqueadas</b> para este site nas configurações do navegador. Libere no cadeado ao lado do endereço (ou em Ajustes → Notificações) e recarregue.');
        return;
      }

      diz('Pronto para ligar neste aparelho: <b>' + apelido() + '</b>.');
      botao.style.display = 'inline-block';

      botao.addEventListener('click', async function () {
        botao.disabled = true;
        try {
          diz('Registrando…');
          var reg = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' });
          await navigator.serviceWorker.ready;

          // O pedido de permissão TEM que sair do clique. Chamado sozinho no
          // carregamento, o navegador nega na hora por ser gesto não solicitado.
          var permissao = await Notification.requestPermission();
          if (permissao !== 'granted') {
            diz('Você não autorizou. Toque de novo e escolha <b>Permitir</b>.');
            botao.disabled = false;
            return;
          }

          var inscricao = await reg.pushManager.getSubscription();
          if (!inscricao) {
            inscricao = await reg.pushManager.subscribe({
              userVisibleOnly: true, // exigido: toda mensagem vira notificação visível
              applicationServerKey: bytesDaChave(CHAVE),
            });
          }

          var r = await fetch('/admin/app/inscrever', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inscricao: inscricao.toJSON(), apelido: apelido() }),
          });
          if (!r.ok) throw new Error('o painel recusou (' + r.status + ')');

          diz('✅ Ligado. Recarregando a lista…', 'saved');
          setTimeout(function () { location.href = '/admin/app?saved=1'; }, 900);
        } catch (e) {
          diz('Não deu certo: ' + (e && e.message ? e.message : e) + '<br>Confira se está abrindo por <b>https</b> e tente de novo.');
          botao.disabled = false;
        }
      });
    })();
    </script>`;
  res.type('html').send(layout('App', inner, 'app'));
});

// POST /admin/app/inscrever — o celular entrega o endereço de entrega dele.
// Já está atrás do guard: só quem entrou no painel cadastra aparelho.
router.post('/app/inscrever', async (req, res) => {
  const i = req.body?.inscricao;
  if (!i?.endpoint || !i?.keys?.p256dh || !i?.keys?.auth) {
    return res.status(400).json({ error: 'inscrição incompleta' });
  }
  await salvarPushSub({
    endpoint: i.endpoint,
    p256dh: i.keys.p256dh,
    auth: i.keys.auth,
    apelido: req.body?.apelido,
  });
  console.log(`[push] aparelho inscrito: ${String(req.body?.apelido || 'sem apelido')}`);
  res.json({ ok: true });
});

router.post('/app/remover', async (req, res) => {
  await removerPushSub(req.body?.endpoint || '');
  res.redirect('/admin/app');
});

router.post('/app/config', (req, res) => {
  savePushPrefs({ pago: !!req.body?.pago, pix: !!req.body?.pix });
  res.redirect('/admin/app?saved=1');
});

router.post('/app/teste', async (req, res) => {
  try {
    const r = await notificarTeste();
    res.redirect(`/admin/app?teste=${r.semAparelho ? 'vazio' : 'ok'}`);
  } catch (e) {
    console.error('[push] teste falhou:', e.message);
    res.redirect('/admin/app?teste=erro');
  }
});

export default router;
