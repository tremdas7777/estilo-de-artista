import webpush from 'web-push';
import config from '../config.js';
import {
  getSetting, setSetting, listPushSubs, removerPushSub, marcarPushOk, marcarPushErro,
} from '../db.js';
import { getContato } from './contato.js';

// Notificação no celular (Web Push) quando cai pedido.
//
// Por que Web Push e não um app de loja: o /admin já é um site, e um site
// instalado na tela de início recebe notificação nativa no Android e no iPhone
// (iOS 16.4+, e SÓ depois de "Adicionar à Tela de Início" — no Safari em aba o
// próprio iOS bloqueia). Sem loja de aplicativo, sem build, sem revisão.
//
// As chaves VAPID (a identidade do servidor perante o Google/Apple) ficam no
// BANCO, não em variável de ambiente, de propósito: elas nascem sozinhas no
// primeiro uso e trocar env var no Render exige deploy novo. Como as
// inscrições dos aparelhos moram no mesmo banco, os dois somem juntos se o
// disco for zerado — e nunca fica uma chave nova tentando entregar em
// inscrição assinada com a antiga (o que daria 403 em todo envio).

const KEY_VAPID = 'push_vapid';
const KEY_PREFS = 'push_prefs';

function chaves() {
  const raw = getSetting(KEY_VAPID, null);
  if (raw) {
    try {
      const c = JSON.parse(raw);
      if (c?.publicKey && c?.privateKey) return c;
    } catch { /* corrompido: gera de novo abaixo */ }
  }
  const novas = webpush.generateVAPIDKeys();
  setSetting(KEY_VAPID, JSON.stringify(novas));
  console.log('[push] chaves VAPID criadas (primeiro uso)');
  return novas;
}

export const chavePublica = () => chaves().publicKey;

// O padrão de contato exigido pelo protocolo: é para onde o servidor de push
// (Google/Apple) reclama se a loja abusar. Sem `mailto:`/`https:` válido a
// entrega é recusada, então cai no domínio da loja se não houver e-mail.
function assunto() {
  const email = getContato()?.email;
  return email && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)
    ? `mailto:${email}`
    : (config.appUrl.startsWith('https://') ? config.appUrl : 'mailto:suporte@exemplo.com.br');
}

export function getPushPrefs() {
  try {
    const p = JSON.parse(getSetting(KEY_PREFS, '') || '{}');
    return { pago: p.pago !== false, pix: p.pix !== false, acesso: p.acesso !== false };
  } catch {
    return { pago: true, pix: true, acesso: true };
  }
}

export function savePushPrefs({ pago, pix, acesso }) {
  setSetting(KEY_PREFS, JSON.stringify({ pago: !!pago, pix: !!pix, acesso: !!acesso }));
}

const brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// A notificação carrega SÓ o tipo do evento e o valor, a pedido do dono
// (18/08/2026). Nome do cliente saiu de propósito: notificação aparece na tela
// bloqueada, à vista de quem estiver por perto, e nome de cliente com valor de
// compra ao lado é dado dele, não da loja. Quem precisa do detalhe toca na
// notificação e cai no pedido, que já pede senha.

// Entrega para TODOS os aparelhos inscritos. Nunca lança: é chamada de dentro
// do fluxo de pagamento, e notificação que falha não pode derrubar uma venda.
// Padrão de urgência é ALTA porque tudo que este arquivo manda é aviso de
// dinheiro entrando — nada aqui pode esperar o celular acordar sozinho. Deixar
// 'normal' como padrão já custou: o aviso de PIX só aparecia quando o dono
// abria o app. Aviso que puder esperar declara 'normal' explicitamente.
async function enviar({ title, body, url = '/admin', tag, ttl = 3600, urgencia = 'high' }) {
  const subs = await listPushSubs();
  // Sai antes de tocar nas chaves: sem aparelho inscrito não há por que criar
  // VAPID nem escrever no banco a cada pedido.
  if (!subs.length) return { enviados: 0, removidos: 0, semAparelho: true };

  const { publicKey, privateKey } = chaves();
  webpush.setVapidDetails(assunto(), publicKey, privateKey);
  const payload = JSON.stringify({ title, body, url, tag });

  let enviados = 0; let removidos = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        payload,
        { TTL: ttl, urgency: urgencia },
      );
      await marcarPushOk(s.endpoint);
      enviados += 1;
    } catch (e) {
      const st = e?.statusCode;
      // 404/410 = o navegador jogou a inscrição fora (app desinstalado,
      // notificação bloqueada, dados limpos). Insistir nela nunca mais vai
      // funcionar, então some da lista em vez de virar erro eterno no painel.
      if (st === 404 || st === 410) {
        await removerPushSub(s.endpoint);
        removidos += 1;
      } else {
        await marcarPushErro(s.endpoint, `${st || 'sem status'}: ${e.message}`);
      }
      console.error(`[push] falha (${st || '—'}) em ${s.apelido || 'aparelho'}: ${e.message}`);
    }
  }));
  if (enviados || removidos) console.log(`[push] ${title} → ${enviados} aparelho(s), ${removidos} removido(s)`);
  return { enviados, removidos, semAparelho: false };
}

// Venda confirmada. TTL de 24h e urgência alta: se o celular estava sem sinal,
// a notificação ainda vale quando ele voltar — dinheiro entrou de qualquer jeito.
export async function notificarPedidoPago(order) {
  if (!getPushPrefs().pago) return { enviados: 0, desligado: true };
  return enviar({
    title: '💰 Venda aprovada',
    body: brl(order.totalCents),
    url: `/admin/order/${order.id}`,
    tag: `pedido-${order.id}`,
    ttl: 86400,
    urgencia: 'high',
  });
}

// PIX gerado (ainda não pago). TTL curto de propósito: o QR da Coreon vale 15
// minutos, então uma notificação entregue depois disso só avisaria de uma
// cobrança que já morreu. Mesma `tag` do pago — quando o cliente paga, a
// notificação de venda SUBSTITUI esta na tela em vez de empilhar duas.
//
// Urgência ALTA, e isto não é exagero: com urgência normal o servidor de push
// tem permissão para SEGURAR a mensagem enquanto o celular dorme e só entregar
// quando ele acorda. Junto com o TTL de 15 min, o resultado era a notificação
// aparecer só quando o dono abria o app — e as que passavam de 15 min morriam
// pelo caminho. Alta manda acordar o aparelho na hora.
export async function notificarPixGerado(order) {
  if (!getPushPrefs().pix) return { enviados: 0, desligado: true };
  return enviar({
    title: '⏳ PIX gerado',
    body: brl(order.totalCents),
    url: `/admin/order/${order.id}`,
    tag: `pedido-${order.id}`,
    ttl: 900,
    urgencia: 'high',
  });
}

// Alguém entrou no painel — ou tentou. É o aviso que transforma "descobri
// semana passada" em "vi na hora": se chegar um destes e não for você, dá tempo
// de trocar a senha antes de a pessoa fazer estrago.
//
// O IP vai no corpo porque é o que responde "fui eu?" sem abrir o painel: o seu
// aparelho você reconhece, o IP de outra cidade não. Sem TTL longo — aviso de
// segurança que chega no dia seguinte não serve, e o registro fica no /admin
// de qualquer jeito.
export async function notificarAcessoAdmin({ resultado, ip, userAgent }) {
  if (!getPushPrefs().acesso) return { enviados: 0, desligado: true };
  const movel = /Mobi|Android|iPhone|iPad/i.test(String(userAgent || ''));
  const aparelho = movel ? 'celular' : 'computador';
  const textos = {
    ok: { title: '🔓 Entraram no painel', body: `${aparelho} · IP ${ip || '—'}` },
    senha: { title: '⚠️ Senha errada no painel', body: `${aparelho} · IP ${ip || '—'}` },
    '2fa': { title: '⚠️ Código de 2 etapas errado', body: `senha certa, código errado · IP ${ip || '—'}` },
    bloqueio: { title: '🚨 Tentativas demais no painel', body: `bloqueado por 5 min · IP ${ip || '—'}` },
  };
  const t = textos[resultado];
  if (!t) return { enviados: 0 };
  return enviar({
    ...t,
    url: '/admin/acessos',
    // Sem tag: cada tentativa é um aviso próprio. Agrupar esconderia
    // justamente o que interessa aqui, que é a repetição.
    ttl: 600,
    urgencia: 'high',
  });
}

export async function notificarTeste() {
  return enviar({
    title: '🔔 Notificação de teste',
    body: 'Deu certo — é assim que a venda vai chegar.',
    url: '/admin/app',
    tag: 'teste',
    ttl: 300,
    urgencia: 'high',
  });
}

export default {
  chavePublica, getPushPrefs, savePushPrefs,
  notificarPedidoPago, notificarPixGerado, notificarTeste,
};
