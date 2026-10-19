import config from '../config.js';
import { getCustomization } from './customization.js';
import { getProducts } from './products.js';
import { logoDaLoja } from '../views/pages.js';
import { getContato, formatarWhatsapp } from './contato.js';

// Peças do e-mail de confirmação de pedido: layout, texto e assunto.
//
// Desde 06/10/2026 este arquivo só MONTA o e-mail — não envia nada sozinho. O
// disparo automático no pagamento saiu (a pedido do dono), e com ele a função
// de envio e o liga/desliga do /admin. Quem usa estas peças hoje é o /admin:
// a prévia ("Ver como fica") e o disparo de teste.
//
// É a nota do que a pessoa comprou, quanto pagou e por qual frete. O botão
// "Acompanhar pedido" saiu junto com a página de rastreio (06/10/2026), e o
// CÓDIGO de rastreio nunca foi no e-mail, de propósito: no momento do pagamento
// ele ainda nem existe (é digitado no /admin depois do despacho), e prometer
// código num e-mail que não tem nenhum só gera cliente perguntando cadê.
// Sempre vazio desde 06/10/2026: a página /rastrear-pedido foi removida, e o
// botão "Acompanhar pedido" apontaria para um 404 — pior que não ter botão.
//
// A função ficou (em vez de sair, com os dois trechos do corpo do e-mail indo
// junto) porque o layout já trata a string vazia escondendo o botão: é o mesmo
// caminho que rodava quando não havia domínio https configurado. Se um dia
// voltar uma página de acompanhamento, é só esta função voltar a devolver a URL.
export function linkRastreio() {
  return '';
}

// Endereço em linhas curtas, do jeito que a pessoa confere de bater o olho.
export function enderecoLinhas(c = {}) {
  const l1 = [c.street, c.number].filter(Boolean).join(', ');
  const l2 = [c.complement, c.neighborhood].filter(Boolean).join(' - ');
  const l3 = [[c.city, c.state].filter(Boolean).join(' - '), c.cep].filter(Boolean).join(' · ');
  return [c.recipient && c.recipient !== c.name ? `A/C ${c.recipient}` : '', l1, l2, l3]
    .map((s) => String(s || '').trim()).filter(Boolean);
}

export function montarHtmlPedido(order, { fromNome, contato }) {
  const c = order.customer || {};
  const itens = (order.items || []).map(linhaItem).join('');
  const frete = order.shipping || {};
  const prazo = String(frete.eta || '').trim();
  const ola = primeiroNome(c.name) ? `Oi, ${esc(primeiroNome(c.name))}!` : 'Oi!';

  // Pedido que nasceu da oferta pós-compra vai na MESMA caixa do pedido que a
  // destravou. Sem esta linha o cliente recebe dois e-mails de confirmação e
  // fica achando que vão chegar duas encomendas separadas.
  const juntoCom = order.upsellDe
    ? `<p style="margin:0 0 18px;padding:12px 14px;background:#f6f3fd;border-radius:10px;
         color:#4a3d6b;font-size:13px;line-height:1.5">
         Estes itens vão na <b>mesma caixa</b> do seu pedido
         <span style="font-family:ui-monospace,Menlo,Consolas,monospace">${esc(order.upsellDe)}</span> — é uma entrega só.</p>`
    : '';

  const zap = contato?.whatsapp ? formatarWhatsapp(contato.whatsapp) : '';
  const suporte = [
    contato?.email ? `e-mail <a href="mailto:${esc(contato.email)}" style="color:#f10769">${esc(contato.email)}</a>` : '',
    zap ? `WhatsApp ${esc(zap)}` : '',
  ].filter(Boolean).join(' ou ');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pedido confirmado</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f3f6;
  font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
    style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;
    border:1px solid #e5e2ec">
    <tr><td style="background:#0b0a0f;padding:16px 24px">
      ${cabecalho(fromNome)}
    </td></tr>

    <tr><td style="padding:26px 24px 0;color:#1c1a22">
      <div style="display:inline-block;background:#e8f7ea;color:#1c7a33;font-size:12px;font-weight:700;
        padding:6px 12px;border-radius:999px;letter-spacing:.02em">PAGAMENTO CONFIRMADO</div>
      <h1 style="margin:14px 0 6px;font-size:22px;line-height:1.25;letter-spacing:-.02em">${ola} Recebemos o seu pagamento.</h1>
      <p style="margin:0 0 4px;color:#5c5769;font-size:14px;line-height:1.6">
        Seu pedido está confirmado e já entrou na fila de separação. Abaixo está tudo o que você comprou.</p>
      <p style="margin:0 0 20px;color:#8b8796;font-size:13px">
        Pedido <span style="font-family:ui-monospace,Menlo,Consolas,monospace;color:#1c1a22">${esc(order.id)}</span></p>
      ${juntoCom}
    </td></tr>

    <tr><td style="padding:0 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="width:100%;border-collapse:collapse;border-top:1px solid #efedf3">${itens}</table>
    </td></tr>

    <tr><td style="padding:8px 24px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
        ${linhaTotal('Subtotal', brl(order.subtotalCents))}
        ${order.discountCents ? linhaTotal('Desconto', `- ${brl(order.discountCents)}`) : ''}
        ${linhaTotal(frete.name ? `Frete — ${frete.name}` : 'Frete', order.shippingCents ? brl(order.shippingCents) : 'Grátis')}
        <tr><td colspan="2" style="border-top:1px solid #e5e2ec;font-size:0;line-height:0">&nbsp;</td></tr>
        ${linhaTotal('Total pago', brl(order.totalCents), { forte: true })}
      </table>
    </td></tr>

    <tr><td style="padding:22px 24px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="width:100%;background:#faf9fc;border:1px solid #efedf3;border-radius:10px">
        <tr><td style="padding:16px 18px;color:#1c1a22;font-size:14px;line-height:1.6">
          <div style="font-weight:700;margin-bottom:8px">Entrega</div>
          <div style="color:#5c5769">
            <b style="color:#1c1a22">${esc(frete.name || 'Frete')}</b>${prazo ? ` · prazo de ${esc(prazo)} após o envio` : ''}
          </div>
          <div style="color:#5c5769;margin-top:10px">
            ${esc(c.name || '')}<br>${enderecoLinhas(c).map(esc).join('<br>')}
          </div>
        </td></tr>
      </table>
    </td></tr>

    ${linkRastreio(order) ? `<tr><td style="padding:24px 24px 0" align="center">
      <a href="${esc(linkRastreio(order))}" target="_blank"
        style="display:inline-block;background:#0b0a0f;color:#ffffff;font-size:15px;font-weight:700;
        text-decoration:none;padding:14px 30px;border-radius:12px">Acompanhar pedido</a>
      <div style="color:#8b8796;font-size:12.5px;margin-top:9px">
        O número do pedido já vai preenchido — é só confirmar o CPF usado na compra.</div>
    </td></tr>` : ''}

    <tr><td style="padding:20px 24px 26px;color:#5c5769;font-size:14px;line-height:1.6">
      Não precisa fazer mais nada — é só aguardar. Se algum dado acima estiver errado,
      responda este e-mail o quanto antes${suporte ? `, ou fale com a gente pelo ${suporte}` : ''}.
    </td></tr>

    <tr><td style="padding:16px 24px;border-top:1px solid #e5e2ec;color:#8b8796;font-size:12px;line-height:1.5">
      Este é o comprovante de confirmação do seu pedido na ${esc(fromNome)}.
    </td></tr>
  </table>
</body></html>`;
}

// Versão em texto puro. Não é enfeite: e-mail só-HTML pontua pior em filtro de
// spam, e é o que aparece em relógio e leitor de tela.
export function montarTextoPedido(order, { fromNome, contato }) {
  const c = order.customer || {};
  const frete = order.shipping || {};
  const linhas = [
    `${primeiroNome(c.name) ? `Oi, ${primeiroNome(c.name)}!` : 'Oi!'} Recebemos o seu pagamento.`,
    '',
    `Pedido ${order.id} — confirmado.`,
    order.upsellDe ? `Estes itens vão na mesma caixa do seu pedido ${order.upsellDe}.` : null,
    '',
    'ITENS',
    ...(order.items || []).flatMap((it) => [
      `- ${it.title || it.variantId} x${it.qty || 1} — ${brl((it.priceCents || 0) * (it.qty || 1))}`,
      ...(it.gravacoes || []).map((g) => `  gravação: "${g.texto}"${g.estilo ? ` (${g.estilo})` : ''}${g.qty > 1 ? ` x${g.qty}` : ''}`),
    ]),
    '',
    `Subtotal: ${brl(order.subtotalCents)}`,
    order.discountCents ? `Desconto: -${brl(order.discountCents)}` : null,
    `Frete (${frete.name || '—'}): ${order.shippingCents ? brl(order.shippingCents) : 'Grátis'}`,
    `Total pago: ${brl(order.totalCents)}`,
    '',
    'ENTREGA',
    `${frete.name || 'Frete'}${frete.eta ? ` — prazo de ${frete.eta} após o envio` : ''}`,
    c.name || '',
    ...enderecoLinhas(c),
    '',
    linkRastreio(order) ? `Acompanhe seu pedido (confirme com o CPF da compra): ${linkRastreio(order)}` : null,
    'Não precisa fazer mais nada — é só aguardar.',
    contato?.email ? `Dúvidas: ${contato.email}` : null,
    contato?.whatsapp ? `WhatsApp: ${formatarWhatsapp(contato.whatsapp)}` : null,
    '',
    fromNome,
  ];
  // `null` é linha que não se aplica a este pedido e some; `''` é parágrafo em
  // branco de propósito — sem essa diferença o texto vira um bloco só.
  return linhas.filter((l) => l !== null).join('\n');
}

// Assunto curto e reconhecível na lista do celular: o cliente tem que saber o
// que é sem abrir. Id no fim porque é o pedaço que some no corte da prévia.
export function assuntoPedido(order, fromNome) {
  return `Pedido confirmado — ${fromNome} (${order.id})`;
}

// Pedido de mentira pra pré-visualizar e testar o envio sem precisar de venda
// de verdade — testar isto com PIX real custaria o valor do produto a cada
// tentativa.
//
// Os PRODUTOS saem do catálogo de verdade, com a foto e o preço que estão no
// ar. A primeira versão inventava dois tênis sem foto nenhuma, e teste sem foto
// esconde exatamente o que mais falha num e-mail: a imagem que não carrega.
// O CLIENTE continua fictício (Fulana, rua Exemplo) pra ninguém confundir um
// teste com pedido real no histórico.
export async function pedidoExemplo() {
  const items = [];
  try {
    for (const p of await getProducts()) {
      if (!p.image) continue;
      const v = (p.variants || []).find((x) => x.available) || (p.variants || [])[0];
      if (!v) continue;
      items.push({
        variantId: v.id,
        title: v.title || p.title,
        // O segundo item vai com 2 unidades de propósito: é o que mostra a
        // linha "Quantidade: 2" e a conta do preço vezes a quantidade.
        qty: items.length ? 2 : 1,
        priceCents: v.priceCents,
        image: v.image || p.image,
      });
      if (items.length === 2) break;
    }
  } catch { /* catálogo fora do ar: cai no par fixo abaixo */ }

  if (!items.length) {
    items.push(
      { variantId: 'exemplo::40', title: 'Tênis Exemplo — 40', qty: 1, priceCents: 9900, image: '' },
      { variantId: 'exemplo::42', title: 'Tênis Exemplo — 42', qty: 2, priceCents: 10000, image: '' },
    );
  }

  const subtotalCents = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
  // Desconto só quando sobra pedido pra descontar: em catálogo barato um
  // desconto fixo maior que o subtotal daria total negativo na prévia.
  const discountCents = subtotalCents > 5000 ? 2000 : 0;
  const shippingCents = 1740;
  return {
    id: 'exemplo123',
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
    customer: {
      name: 'Fulana de Tal',
      email: 'cliente@exemplo.com',
      street: 'Rua Exemplo', number: '123', complement: 'Apto 45',
      neighborhood: 'Centro', city: 'Joinville', state: 'SC', cep: '89201-000',
    },
    items,
    shipping: { id: 'padrao', name: 'Frete Padrão', cents: shippingCents, eta: '3 a 5 dias úteis' },
  };
}

export default {
  pedidoExemplo,
  montarHtmlPedido, montarTextoPedido, assuntoPedido,
};
