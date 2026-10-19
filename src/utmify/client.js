// UTMify — lança o pedido no painel deles, com a campanha que trouxe a venda.
// Dois disparos por pedido: waiting_payment quando o PIX é gerado e paid quando
// o webhook do gateway confirma. O mesmo orderId nos dois, que é como eles
// cruzam iniciado x pago (mandar só o pago esconderia a taxa de conversão).
import config from '../config.js';

const { apiUrl, apiToken } = config.utmify;

// Eles esperam "YYYY-MM-DD HH:MM:SS" em UTC, não ISO.
const utc = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// Campo ausente tem de ir como null, não string vazia: com '' o painel mostra
// a venda como "sem campanha" em vez de agrupar no orgânico.
const ouNulo = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '') || null;

function corpo(order, status) {
  const t = order.tracking || {};
  return {
    orderId: order.id,
    platform: 'EstiloDeArtista',
    paymentMethod: 'pix',
    status,
    createdAt: utc(order.createdAt),
    approvedDate: status === 'paid' ? utc(order.paidAt || Date.now()) : null,
    refundedAt: null,
    customer: {
      name: order.customer?.name || '',
      email: order.customer?.email || '',
      phone: somenteDigitos(order.customer?.phone),
      document: somenteDigitos(order.customer?.cpf),
      country: 'BR',
      ip: order.fb?.ip || '',
    },
    products: (order.items || []).map((i) => ({
      id: String(i.variantId),
      name: i.title || 'Produto',
      planId: null,
      planName: null,
      quantity: i.qty || 1,
      priceInCents: i.priceCents || 0,
    })),
    trackingParameters: {
      src: ouNulo(t.src),
      sck: ouNulo(t.sck),
      utm_source: ouNulo(t.utm_source),
      utm_campaign: ouNulo(t.utm_campaign),
      utm_medium: ouNulo(t.utm_medium),
      utm_content: ouNulo(t.utm_content),
      utm_term: ouNulo(t.utm_term),
    },
    // Receita cheia do pedido, frete incluído. O dashboard da UTMify mostra o
    // `userCommissionInCents` ("valor recebido pelo vendedor", na doc deles)
    // como faturamento — e o frete É dinheiro que entra, então ele fica aqui.
    //
    // Antes o frete ia em `gatewayFeeInCents`, que a doc define como "valor
    // recebido pela plataforma", isto é, a TAXA do gateway. O painel descontava
    // o frete da receita e a venda aparecia menor do que foi: um pedido de
    // R$ 176,00 com R$ 27,00 de frete caía como R$ 149,00 no dashboard, mesmo
    // estando certo no /admin, na PixGate e na notificação da própria UTMify
    // (quem usa o total cheio é a notificação; o dashboard, não).
    //
    // No exemplo oficial da UTMify o frete fica junto da receita: óleo R$ 80 +
    // R$ 20 de frete -> total 10000, gatewayFee 400 (só a taxa real do PIX),
    // userCommission 9600. O frete não é custo de gateway em lugar nenhum.
    //
    // `gatewayFeeInCents: 0` porque a taxa real não é conhecida aqui: ela não
    // vem na criação da cobrança e o pedido não a guarda. Zero é o número
    // honesto — declarar o frete no lugar dela era o que distorcia o dashboard.
    // Se um dia a taxa for gravada no pedido, é ela que entra neste campo (e aí
    // o ROAS fica fiel sem mexer na receita).
    commission: {
      totalPriceInCents: order.totalCents || 0,
      gatewayFeeInCents: 0,
      userCommissionInCents: order.totalCents || 0,
    },
    isTest: false,
  };
}

// Nunca lança: a UTMify fora do ar não pode derrubar o checkout nem o webhook
// do gateway. Falhou, fica o log e a venda segue normal.
export async function sendOrder(order, status, { isTest = false } = {}) {
  if (!apiToken) return { skipped: 'sem UTMIFY_API_TOKEN' };
  try {
    const payload = { ...corpo(order, status), isTest };
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-token': apiToken },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const txt = await r.text();
    if (!r.ok) {
      console.error(`[utmify] ${status} pedido ${order.id}: HTTP ${r.status} ${txt.slice(0, 200)}`);
      return { ok: false, status: r.status, body: txt };
    }
    return { ok: true, body: txt };
  } catch (e) {
    console.error(`[utmify] ${status} pedido ${order.id} falhou:`, e.message);
    return { ok: false, error: e.message };
  }
}

export default { sendOrder };
