import crypto from 'node:crypto';
import config from '../config.js';
import { doisFatoresAtivo } from './twoFactor.js';

// Login do /admin. Era HTTP Basic: funcionava, mas quem abria o painel via a
// caixinha cinza do navegador, que não aceita estilo nenhum. Agora é uma tela
// nossa + sessão em cookie assinado (HMAC), sem dependência nova.
//
// O header Basic continua sendo aceito no middleware — script, curl e os
// atalhos antigos seguem funcionando. O que sumiu foi o `WWW-Authenticate` na
// resposta: é ele que faz o navegador abrir o popup.

const COOKIE = 'n47_admin';
const SESSAO_MS = 12 * 60 * 60 * 1000; // 12h: um dia de trabalho sem relogar

// Chave derivada da senha. Efeito colateral desejado: trocar ADMIN_PASSWORD no
// Render invalida na hora todas as sessões abertas.
function chave() {
  return crypto.createHash('sha256')
    .update(`n47-admin|${config.admin.user}|${config.admin.password}`)
    .digest();
}

// Chave SEPARADA para o bilhete de "senha certa, falta o código do 2FA".
//
// Separada não é preciosismo: o bilhete tem o mesmo formato do cookie de
// sessão (corpo.assinatura, e o corpo só carrega a validade). Assinado com a
// MESMA chave, ele passaria em tokenValido() — ou seja, quem parasse no meio do
// login, antes de digitar o código, teria em mãos um cookie de sessão válido e
// o 2FA não teria servido pra nada. Com chave diferente o HMAC não confere e
// cada bilhete só abre a porta pra que foi feito.
function chave2fa() {
  return crypto.createHash('sha256')
    .update(`n47-2fa|${config.admin.user}|${config.admin.password}`)
    .digest();
}

const b64u = (b) => Buffer.from(b).toString('base64url');

// Comparação em tempo constante pra não vazar senha nem assinatura por timing.
export function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function assinar(corpo) {
  return crypto.createHmac('sha256', chave()).update(corpo).digest('base64url');
}

export function criarToken() {
  const corpo = b64u(JSON.stringify({ exp: Date.now() + SESSAO_MS }));
  return `${corpo}.${assinar(corpo)}`;
}

function tokenValido(token) {
  const [corpo, sig] = String(token || '').split('.');
  if (!corpo || !sig) return false;
  if (!safeEqual(sig, assinar(corpo))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

// Bilhete do segundo passo. Vida curta de propósito: são 5 minutos pra pegar o
// celular e digitar os 6 dígitos. Não vai em cookie — viaja num campo escondido
// do formulário, então não fica guardado no navegador depois.
const PENDENTE_MS = 5 * 60 * 1000;

export function criarPendente() {
  const corpo = b64u(JSON.stringify({ exp: Date.now() + PENDENTE_MS }));
  return `${corpo}.${crypto.createHmac('sha256', chave2fa()).update(corpo).digest('base64url')}`;
}

export function pendenteValido(token) {
  const [corpo, sig] = String(token || '').split('.');
  if (!corpo || !sig) return false;
  const esperada = crypto.createHmac('sha256', chave2fa()).update(corpo).digest('base64url');
  if (!safeEqual(sig, esperada)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

// Sem cookie-parser no projeto — o header é simples o bastante pra ler na mão.
function lerCookie(req, nome) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function darSessao(req, res) {
  res.cookie(COOKIE, criarToken(), {
    httpOnly: true,          // fora do alcance de qualquer JS
    sameSite: 'lax',         // barra POST vindo de outro site (CSRF)
    secure: req.secure,      // com trust proxy, respeita o https do Render
    maxAge: SESSAO_MS,
    path: '/admin',
  });
}

export function tirarSessao(req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/admin' });
}

export const temSessao = (req) => tokenValido(lerCookie(req, COOKIE));

export function credenciaisOk(user, pass) {
  return safeEqual(user ?? '', config.admin.user) && safeEqual(pass ?? '', config.admin.password);
}

// Basic Auth continua valendo pra quem chama por script.
// Basic Auth só vale enquanto o 2FA estiver DESLIGADO. Sem esta condição o
// 2FA seria enfeite: o guard aceita sessão OU Basic, então quem soubesse a
// senha mandava `curl -u user:senha` e entrava sem ver a tela do código.
// Não existe Basic com segundo fator — o protocolo só tem dois campos.
export function basicOk(req) {
  if (doisFatoresAtivo()) return false;
  const [tipo, val] = String(req.headers.authorization || '').split(' ');
  if (tipo !== 'Basic' || !val) return false;
  const txt = Buffer.from(val, 'base64').toString();
  const i = txt.indexOf(':');
  return credenciaisOk(txt.slice(0, i), txt.slice(i + 1));
}

// Freio de força bruta, por IP e em memória. Reinício do serviço zera — dá pra
// viver com isso: o objetivo é encarecer a tentativa, não ser um WAF.
// 8 erros liberam bem mais que o dedo escorregando na senha, e 5 min de espera
// já torna a força bruta inviável sem trancar o dono do painel por muito tempo.
const tentativas = new Map();
const JANELA_MS = 5 * 60 * 1000;
const LIMITE = 8;

export function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t) return 0;
  if (Date.now() > t.ate) { tentativas.delete(ip); return 0; }
  return t.fails >= LIMITE ? Math.ceil((t.ate - Date.now()) / 1000) : 0;
}

export function registrarFalha(ip) {
  const t = tentativas.get(ip) || { fails: 0, ate: 0 };
  t.fails += 1;
  t.ate = Date.now() + JANELA_MS;
  tentativas.set(ip, t);
}

export const limparFalhas = (ip) => tentativas.delete(ip);

// Só volta pra dentro do painel — sem isto, ?next= vira redirect aberto pra
// qualquer site.
export function destinoSeguro(v) {
  const s = String(v || '');
  return /^\/admin(\/[^\s]*)?$/.test(s) ? s : '/admin';
}

export default {
  temSessao, basicOk, darSessao, tirarSessao, credenciaisOk,
  bloqueado, registrarFalha, limparFalhas, destinoSeguro, safeEqual,
  criarPendente, pendenteValido,
};
