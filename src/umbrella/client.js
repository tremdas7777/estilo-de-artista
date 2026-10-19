import config from '../config.js';

const digits = (v) => String(v || '').replace(/\D/g, '');

// Endereço no formato da UmbrellaPag. Todos os campos são obrigatórios na doc,
// então os opcionais viram string vazia em vez de sumirem do payload.
function address(c) {
  return {
    street: c.street || '',
    streetNumber: String(c.number || ''),
    complement: c.complement || '',
    zipCode: digits(c.cep),
    neighborhood: c.neighborhood || '',
    city: c.city || '',
    state: c.state || '',
    country: 'BR',
  };
}

// Cash-in PIX (UmbrellaPag). Interface unificada igual aos outros gateways.
// Doc: POST {base}/user/transactions, header x-api-key, valores em CENTAVOS.
// Resposta: { status, message, data: { id, status:"WAITING_PAYMENT", amount,
//   qrCode, pix:{ qrcode, expirationDate }, ... } } — o copia-e-cola vem
//   duplicado em data.qrCode e data.pix.qrcode.
export async function createPayment({ orderId, amountCents, description, notificationUrl, ip, customer }) {
  if (!config.umbrella.apiKey) throw new Error('UMBRELLA_API_KEY ausente');
  const base = config.umbrella.baseUrl || 'https://api-gateway.umbrellapag.com/api';
  const c = customer || {};
  const addr = address(c);

  const body = {
    amount: amountCents,                 // centavos — é o valor efetivamente cobrado
    currency: 'BRL',
    paymentMethod: 'PIX',
    installments: 1,
    postbackUrl: notificationUrl,
    metadata: JSON.stringify({ orderId }),
    traceable: true,
    ip: ip || undefined,
    pix: { expiresInDays: 1 },
    customer: {
      name: c.name,
      // email/phone são obrigatórios — fallback evita 400 travar o checkout.
      //
      // CUIDADO com este fallback: a Umbrella DEDUPLICA o cliente pelo e-mail e
      // PRENDE nele o CPF da PRIMEIRA cobrança — o document que vai nas
      // seguintes é ignorado, e a transação nasce com o CPF antigo (visto em
      // 02/09/2026: seis testes seguidos com CPFs diferentes gravaram todos o
      // primeiro, e o provedor recusou todos por causa dele). Se o fallback
      // pegasse, TODO pedido sem e-mail viraria o MESMO cliente lá, com um CPF
      // só. Hoje não pega: o /api/orders exige e-mail válido antes de criar o
      // pedido (validate em src/routes/checkoutApi.js).
      //
      // A outra ponta disso: quem digitar um CPF bem-formado mas INEXISTENTE
      // fica com ele preso ao e-mail, e a HubPague — o provedor desta conta,
      // que confere o CPF de verdade, ao contrário do PluggouV2 da conta
      // antiga — recusa esse pedido E os próximos do mesmo e-mail, mesmo depois
      // de o cliente corrigir. Se aparecer "CPF inválido" em cliente que jura
      // que o CPF está certo, é isto: o cadastro dele lá precisa ser corrigido.
      email: c.email || 'cliente@exemplo.com.br',
      phone: digits(c.phone) || '11999999999',
      externalRef: orderId,
      document: { number: digits(c.cpf), type: 'CPF' },
      address: addr,
    },
    // fee=0 de propósito: o frete já está embutido no amount. Mandar de novo aqui
    // arriscaria a Umbrella somar duas vezes; o endereço vai só pra antifraude.
    shipping: { fee: 0, address: addr },
    // Um único item = total do pedido (garante que a soma bata com o amount pós-desconto).
    items: [{
      title: description || `Pedido ${config.lojaNome} #${orderId}`,
      unitPrice: amountCents,
      quantity: 1,
      tangible: true,
      externalRef: orderId,
    }],
  };

  const res = await fetch(`${base}/user/transactions`, {
    method: 'POST',
    headers: {
      'x-api-key': config.umbrella.apiKey,
      'User-Agent': 'UMBRELLAB2B/1.0',   // a doc exige este User-Agent
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) {
    throw new Error(`Umbrella transaction ${res.status}: ${text.slice(0, 300)}`);
  }

  const tx = data?.data || null;
  const pixCode = tx?.pix?.qrcode || tx?.qrCode;

  if (!tx?.id || !pixCode) {
    throw new Error(`Umbrella resposta inesperada: ${text.slice(0, 300)}`);
  }

  return {
    transactionId: String(tx.id),                     // uuid — volta como objectId no postback
    pixCode,                                          // copia-e-cola (EMV)
    valueCents: Number(tx.amount) || amountCents,     // centavos
    status: tx.status,                                // "WAITING_PAYMENT"
  };
}

export default { createPayment };
