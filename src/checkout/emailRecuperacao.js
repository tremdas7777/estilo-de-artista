// E-mail de recuperação de PIX abandonado.
//
// É SEMPRE manual: sai do botão do /admin, nunca sozinho. Isso não é limitação
// técnica, é a mesma regra do resto do envio nesta loja ("nada sai daqui
// sozinho") — e aqui ela pesa mais que no resto, porque este é o único e-mail
// que carrega uma oferta de preço.
//
// O layout reaproveita as peças da confirmação de pedido (emailPedido.js): o
// cliente já recebeu aquele e-mail, e chegar com outra identidade visual no
// segundo contato parece golpe justo no e-mail que pede pra clicar num link.
import config from '../config.js';
import { logEmail } from '../db.js';
import { getContato, formatarWhatsapp } from './contato.js';
import {
  esc, brl, primeiroNome, cabecalho, linhaItem, linhaTotal,
} from './emailPedido.js';
import {
  getEmailConfig, emailPronto, faltando, emailValido, enviarEmail,
} from './email.js';
import {
  RECUPERACAO, recuperacaoHref, carimbarDisparo, montarItens,
} from './recuperacao.js';

// Horas por extenso pro texto do prazo. A janela é configurável, então "48
// horas" não pode ficar escrito na mão em três lugares diferentes.
const prazoTexto = () => {
  const h = Math.round(RECUPERACAO.janelaMs / 3_600_000);
  if (h >= 48 && h % 24 === 0) return `${h / 24} dias`;
  return `${h} ${h === 1 ? 'hora' : 'horas'}`;
};

export function assuntoRecuperacao(order, fromNome) {
  const nome = primeiroNome(order?.customer?.name);
  // O nome no assunto é o que separa este e-mail de promoção genérica na caixa
  // de entrada — e ele é verdade: a oferta é daquele pedido, não de todo mundo.
  return nome
    ? `${nome}, seu pedido ainda está reservado`
    : 'Seu pedido ainda está reservado';
}

// O botão. Table em vez de <a> solto porque o Outlook ignora padding em link, e
// o botão sairia como texto sublinhado no meio do e-mail — justo o elemento de
// que esta mensagem inteira depende.
function botao(url, texto) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr><td align="center" bgcolor="#f10769" style="border-radius:12px">
      <a href="${esc(url)}" style="display:inline-block;padding:15px 34px;font-size:16px;
        font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;
        font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${esc(texto)}</a>
    </td></tr></table>`;
}

export function montarHtmlRecuperacao(order, { fromNome, contato, url, montado }) {
  const c = order.customer || {};
  const ola = primeiroNome(c.name) ? `Oi, ${esc(primeiroNome(c.name))}!` : 'Oi!';
  const itens = montado.items.map(linhaItem).join('');
  const antes = order.totalCents;
  const agora = montado.totalCents;
  const economia = antes > agora ? antes - agora : 0;

  const zap = contato?.whatsapp ? formatarWhatsapp(contato.whatsapp) : '';
  const suporte = [
    contato?.email ? `<a href="mailto:${esc(contato.email)}" style="color:#f10769">${esc(contato.email)}</a>` : '',
    zap ? `WhatsApp ${esc(zap)}` : '',
  ].filter(Boolean).join(' ou ');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seu pedido ainda está reservado</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f3f6;
  font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
    style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;
    border:1px solid #e5e2ec">

    <tr><td style="background:#0b0a0f;padding:18px 24px">${cabecalho(fromNome)}</td></tr>

    <tr><td style="padding:26px 24px 6px;color:#1c1a22">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">${ola}</div>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#5c5769">
        Você montou este pedido e o PIX não chegou a ser pago. Ele continua separado
        aqui — e pra você fechar agora, <b style="color:#1c1a22">baixamos o preço</b>.
      </p>
    </td></tr>

    <tr><td style="padding:14px 24px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="border:1px solid #e5e2ec;border-radius:12px">
        <tr><td style="padding:4px 18px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${itens}</table>
        </td></tr>
        <tr><td style="padding:6px 18px 16px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${linhaTotal('Preço anterior', brl(antes))}
            ${montado.discountCents ? linhaTotal('Desconto da oferta', `- ${brl(montado.discountCents)}`) : ''}
            ${linhaTotal(montado.shipping?.name || 'Frete', montado.shippingCents ? brl(montado.shippingCents) : 'Grátis')}
            ${linhaTotal('Você paga agora', brl(agora), { forte: true })}
          </table>
        </td></tr>
      </table>
    </td></tr>

    ${economia ? `<tr><td style="padding:14px 24px 0">
      <div style="background:#eaf7ef;border-radius:10px;padding:12px 14px;color:#166534;
        font-size:14px;line-height:1.5;text-align:center">
        Você economiza <b>${brl(economia)}</b> neste pedido.
      </div>
    </td></tr>` : ''}

    <tr><td style="padding:24px 24px 8px">${botao(url, `Pagar ${brl(agora)} no PIX`)}</td></tr>

    <tr><td style="padding:4px 24px 0;text-align:center;color:#8b8796;font-size:13px;line-height:1.6">
      Seu endereço e CPF já estão preenchidos — é só confirmar e pagar.
    </td></tr>

    <tr><td style="padding:18px 24px 0">
      <div style="background:#fdf6e9;border-radius:10px;padding:12px 14px;color:#8a5a00;
        font-size:13.5px;line-height:1.5;text-align:center">
        Este preço vale por <b>${prazoTexto()}</b>. Depois disso o pedido volta ao valor normal.
      </div>
    </td></tr>

    <tr><td style="padding:22px 24px 26px;color:#5c5769;font-size:14px;line-height:1.6">
      Se preferir levar mais de um par, dá pra acrescentar na mesma tela — cada par a mais
      sai por ${brl(RECUPERACAO.adicionalCents)}, e vai tudo na mesma entrega.
      ${suporte ? `<br><br>Qualquer dúvida, responda este e-mail ou fale com a gente pelo ${suporte}.` : ''}
    </td></tr>

    <tr><td style="padding:16px 24px;border-top:1px solid #e5e2ec;color:#8b8796;font-size:12px;line-height:1.5">
      Você recebeu este e-mail porque iniciou um pedido na ${esc(fromNome)}.
      Se não quiser mais mensagens como esta, é só responder pedindo pra sair.
    </td></tr>
  </table>
</body></html>`;
}

// Versão em texto puro — mesma razão da confirmação: e-mail só-HTML pontua pior
// em filtro de spam, e este é justamente o que não pode cair na caixa errada.
export function montarTextoRecuperacao(order, { fromNome, url, montado }) {
  const c = order.customer || {};
  const nome = primeiroNome(c.name);
  const linhas = [
    nome ? `Oi, ${nome}!` : 'Oi!',
    '',
    'Você montou este pedido e o PIX não chegou a ser pago. Ele continua separado aqui,',
    'e pra você fechar agora nós baixamos o preço.',
    '',
    ...montado.items.map((it) => `- ${it.qty}x ${it.title || it.variantId}  ${brl(it.priceCents * it.qty)}`),
    '',
    `Preço anterior: ${brl(order.totalCents)}`,
    `Você paga agora: ${brl(montado.totalCents)}`,
    '',
    'Pague pelo link abaixo (seu endereço e CPF já estão preenchidos):',
    url,
    '',
    `Este preço vale por ${prazoTexto()}.`,
    '',
    `-- ${fromNome}`,
    'Você recebeu este e-mail porque iniciou um pedido na loja.',
  ];
  return linhas.join('\n');
}

// Manda a oferta de UM pedido. NUNCA lança: um endereço problemático no meio do
// lote não pode derrubar os outros noventa e nove.
//
// A ordem importa. O carimbo vem ANTES do envio porque é ele que destrava o
// link — carimbar depois abriria a janela em que o e-mail já chegou e o link
// ainda responde "oferta não disponível". Se o envio falhar depois disso, o
// pedido fica carimbado sem ter recebido nada: o prejuízo é a pessoa não ver a
// oferta, que é exatamente onde ela já estava.
export async function enviarRecuperacao(order) {
  const cfg = getEmailConfig();
  if (!emailPronto(cfg)) return { ok: false, erro: `E-mail não configurado (falta ${faltando(cfg).join(', ')}).` };

  const para = String(order?.customer?.email || '').trim();
  if (!emailValido(para)) return { ok: false, erro: 'Pedido sem e-mail válido.' };

  const montado = await montarItens(order, []);
  if (montado.erro) return { ok: false, erro: montado.erro };

  // Última conferência antes de gastar um envio: o carimbo recusa pedido pago
  // ou velho demais, e nos dois casos o e-mail não deve sair.
  if (!await carimbarDisparo(order)) {
    return { ok: false, erro: 'Pedido já foi pago ou está fora do prazo de recuperação.' };
  }

  const fromNome = cfg.fromNome || config.lojaNome || 'Estilo de Artista';
  const contato = getContato();
  // Absoluta: o caminho relativo do link só resolve dentro do site, e aqui ele
  // vai ser clicado de dentro do Gmail.
  const url = `${config.appUrl}${recuperacaoHref(order)}`;
  const assunto = assuntoRecuperacao(order, fromNome);

  const r = await enviarEmail({
    para,
    assunto,
    mensagem: montarTextoRecuperacao(order, { fromNome, url, montado }),
    html: montarHtmlRecuperacao(order, { fromNome, contato, url, montado }),
  });

  // Mesmo histórico de "Últimos envios" do /admin. O corpo gravado é o resumo,
  // não o HTML inteiro: o histórico é pra conferir se saiu e pra quem, e um
  // e-mail deste tamanho tornaria a tela ilegível.
  try {
    await logEmail({
      para,
      assunto,
      corpo: `[recuperação do pedido ${order.id} — ${brl(order.totalCents)} por ${brl(montado.totalCents)}]`,
      status: r.ok ? 'enviado' : 'erro',
      erro: r.erro,
    });
  } catch { /* histórico não pode derrubar o envio */ }

  return r;
}

export default {
  assuntoRecuperacao, montarHtmlRecuperacao, montarTextoRecuperacao, enviarRecuperacao,
};
