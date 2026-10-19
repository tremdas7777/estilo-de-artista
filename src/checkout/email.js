import nodemailer from 'nodemailer';
import { getSetting, setSetting } from '../db.js';

// Envio de e-mail pelo /admin. A configuração mora no banco (igual ao contato e
// ao gateway) pra trocar de provedor sem redeploy — o padrão aceita variável de
// ambiente porque o mesmo código atende mais de uma loja no Render.
//
// Tudo aqui é SMTP. Resend e Brevo têm API HTTP própria, mas os dois também
// falam SMTP, e um caminho só significa que trocar de provedor é mexer em
// quatro campos do painel em vez de escrever cliente novo.
const KEY = 'email_config';

// Os dois serviços gratuitos + a saída pra qualquer outro. `dica` é o que
// aparece no /admin explicando de onde tirar usuário e senha.
export const PROVEDORES = {
  gmail: {
    nome: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    user: '',
    // Único provedor daqui em que o remetente NÃO é livre: o Gmail reescreve o
    // cabeçalho "De" para a conta autenticada. Por isso o save copia o usuário
    // para o remetente — sem isso o painel mostraria um endereço que o cliente
    // nunca vai ver.
    remetenteFixo: true,
    dica: 'Use a conta do Gmail da loja. A senha <b>não</b> é a que você digita pra entrar no Gmail: '
      + 'tem que ser uma <b>senha de aplicativo</b> de 16 letras, criada em '
      + '<code>myaccount.google.com → Segurança → Senhas de app</code> (só aparece com a '
      + 'verificação em duas etapas ligada). O e-mail sai da própria conta, então não precisa '
      + 'verificar domínio. Limite de 500 e-mails por dia.',
  },
  resend: {
    nome: 'Resend',
    host: 'smtp.resend.com',
    port: 465,
    user: 'resend', // no Resend o usuário é literalmente "resend"
    dica: 'A senha é a <b>API Key</b> (começa com <code>re_</code>), em resend.com → API Keys. '
      + 'O usuário é sempre <code>resend</code>. Enquanto o domínio não estiver verificado, o Resend '
      + 'só deixa enviar de <code>onboarding@resend.dev</code> e só para o e-mail da sua conta.',
  },
  brevo: {
    nome: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 587,
    user: '',
    dica: 'Em brevo.com → SMTP & API → SMTP. O usuário é o login que aparece lá '
      + '(algo como <code>8a1b2c@smtp-brevo.com</code>) e a senha é a <b>SMTP key</b> — '
      + 'não é a senha que você usa pra entrar no site do Brevo. Antes de conseguir enviar, '
      + 'cadastre o e-mail remetente em <b>Remetentes</b> e clique no link de confirmação que '
      + 'eles mandam pra ele — serve inclusive pra um endereço <code>@gmail.com</code>, sem '
      + 'precisar mexer em DNS.',
  },
  smtp: {
    nome: 'Outro (SMTP manual)',
    host: '',
    port: 587,
    user: '',
    dica: 'Qualquer provedor serve: Gmail, Zoho, Hostinger, Locaweb. Pegue servidor, porta, '
      + 'usuário e senha no painel deles. No Gmail tem que ser uma <b>senha de aplicativo</b>, '
      + 'não a senha normal da conta.',
  },
};

export function defaults() {
  // Servidor e porta saem do preset do provedor padrão: quem abre a tela pela
  // primeira vez já encontra tudo preenchido menos usuário e senha.
  const provedor = PROVEDORES[process.env.EMAIL_PROVEDOR] ? process.env.EMAIL_PROVEDOR : 'gmail';
  const preset = PROVEDORES[provedor];
  return {
    provedor,
    host: process.env.EMAIL_HOST || preset.host,
    port: Number(process.env.EMAIL_PORT || preset.port),
    user: process.env.EMAIL_USER || preset.user,
    pass: process.env.EMAIL_PASS || '',
    fromNome: process.env.EMAIL_FROM_NOME || process.env.LOJA_NOME || 'Estilo de Artista',
    fromEmail: process.env.EMAIL_FROM || '',
    replyTo: process.env.EMAIL_REPLY_TO || '',
  };
}

export function getEmailConfig() {
  const d = defaults();
  const raw = getSetting(KEY, null);
  if (!raw) return d;
  try {
    const c = JSON.parse(raw);
    return {
      provedor: PROVEDORES[c.provedor] ? c.provedor : d.provedor,
      host: typeof c.host === 'string' ? c.host : d.host,
      port: Number(c.port) || d.port,
      user: typeof c.user === 'string' ? c.user : d.user,
      pass: typeof c.pass === 'string' ? c.pass : d.pass,
      fromNome: typeof c.fromNome === 'string' ? c.fromNome : d.fromNome,
      fromEmail: typeof c.fromEmail === 'string' ? c.fromEmail : d.fromEmail,
      replyTo: typeof c.replyTo === 'string' ? c.replyTo : d.replyTo,
    };
  } catch {
    return d;
  }
}

// `pass` vazio no formulário quer dizer "não mexi na senha" — o campo do /admin
// nunca devolve a senha salva (não faz sentido jogar segredo no HTML), então
// sem esse cuidado todo save sem retypar a chave apagaria a chave.
export function saveEmailConfig(obj) {
  const atual = getEmailConfig();
  const provedor = PROVEDORES[obj?.provedor] ? obj.provedor : atual.provedor;
  const novaSenha = String(obj?.pass ?? '').trim();
  const user = String(obj?.user ?? '').trim().slice(0, 160);
  // No Gmail o remetente é sempre a conta autenticada — o servidor deles troca
  // o "De" de qualquer jeito. Copiar aqui evita o painel prometer um endereço
  // e o cliente receber de outro.
  const fromEmail = PROVEDORES[provedor].remetenteFixo
    ? user
    : String(obj?.fromEmail ?? '').trim().slice(0, 160);
  setSetting(KEY, JSON.stringify({
    provedor,
    host: String(obj?.host ?? '').trim().slice(0, 160),
    port: Number(obj?.port) || PROVEDORES[provedor].port,
    user,
    pass: novaSenha || atual.pass,
    fromNome: String(obj?.fromNome ?? '').trim().slice(0, 80),
    fromEmail,
    replyTo: String(obj?.replyTo ?? '').trim().slice(0, 160),
  }));
}

// Falta qualquer um destes e o envio nem é tentado: melhor a tela dizer o que
// falta do que o cliente esperar um e-mail que morreu num erro de SMTP.
export function emailPronto(cfg = getEmailConfig()) {
  return Boolean(cfg.host && cfg.port && cfg.pass && cfg.fromEmail);
}

export function faltando(cfg = getEmailConfig()) {
  const f = [];
  if (!cfg.host) f.push('servidor (host)');
  if (!cfg.port) f.push('porta');
  if (!cfg.pass) f.push('senha / API key');
  if (!cfg.fromEmail) f.push('e-mail remetente');
  return f;
}

export function emailValido(v) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(v || '').trim());
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// O corpo é escrito como texto puro no /admin. Aqui ele vira um HTML sóbrio —
// caixa branca, nome da loja no topo — porque e-mail sem formatação nenhuma
// cai em spam com mais facilidade e parece golpe pro cliente.
function montarHtml({ mensagem, fromNome }) {
  const corpo = esc(mensagem).replace(/\r?\n/g, '<br>');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f3f6;
  font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
    style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;
    border:1px solid #e5e2ec">
    <tr><td style="background:#0b0a0f;padding:18px 24px">
      <span style="color:#fff;font-size:17px;font-weight:800;letter-spacing:-.02em">${esc(fromNome)}</span>
    </td></tr>
    <tr><td style="padding:26px 24px;color:#1c1a22;font-size:15px;line-height:1.6">${corpo}</td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #e5e2ec;color:#8b8796;font-size:12px">
      Este e-mail foi enviado por ${esc(fromNome)}.
    </td></tr>
  </table>
</body></html>`;
}

// Um transporte por configuração. Guardar o objeto entre envios reaproveita a
// conexão; a chave é o que define o destino, então mudar qualquer campo no
// /admin gera transporte novo sem precisar reiniciar o serviço.
let cache = { chave: '', transporte: null };

function transporte(cfg) {
  const chave = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass}`;
  if (cache.chave !== chave) {
    cache = {
      chave,
      transporte: nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port),
        // 465 é TLS direto; 587 abre em claro e sobe pra TLS no STARTTLS.
        secure: Number(cfg.port) === 465,
        auth: { user: cfg.user, pass: cfg.pass },
      }),
    };
  }
  return cache.transporte;
}

// Manda o e-mail. Nunca lança: devolve { ok, erro } pro /admin mostrar o motivo
// na tela, porque erro de SMTP quase sempre é uma coisa boba (senha, porta,
// remetente não verificado) e o texto do provedor diz qual é.
//
// `html` opcional: quem já tem um layout próprio (a confirmação de pedido, que
// precisa de tabela de itens) passa o HTML pronto e `mensagem` vira só a versão
// em texto puro. Sem `html`, o comportamento é o de sempre — a mensagem
// escrita no /admin entra na caixa branca padrão.
export async function enviarEmail({ para, assunto, mensagem, html }) {
  const cfg = getEmailConfig();
  if (!emailPronto(cfg)) return { ok: false, erro: `Falta configurar: ${faltando(cfg).join(', ')}.` };
  if (!emailValido(para)) return { ok: false, erro: `"${String(para || '').slice(0, 60)}" não é um e-mail válido.` };

  // \r e \n em assunto/destinatário é a receita clássica de injeção de
  // cabeçalho SMTP. O nodemailer já barra, mas limpar aqui é de graça.
  const limpo = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
  const to = limpo(para);
  const subject = limpo(assunto).slice(0, 200);

  try {
    const info = await transporte(cfg).sendMail({
      from: cfg.fromNome ? `"${cfg.fromNome.replace(/"/g, '')}" <${cfg.fromEmail}>` : cfg.fromEmail,
      to,
      replyTo: cfg.replyTo || undefined,
      subject,
      text: String(mensagem ?? ''),
      html: html || montarHtml({ mensagem, fromNome: cfg.fromNome || cfg.fromEmail }),
    });
    return { ok: true, id: info?.messageId || '' };
  } catch (e) {
    return { ok: false, erro: e?.message || 'Erro desconhecido no envio.' };
  }
}

export default {
  PROVEDORES, defaults, getEmailConfig, saveEmailConfig,
  emailPronto, faltando, emailValido, enviarEmail,
};
