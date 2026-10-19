import config from '../config.js';

const digits = (v) => String(v || '').replace(/\D/g, '');

// Cria uma cobrança PIX (cash-in) no PayShark.
// Doc: POST {base}/payment, header Authorization: Bearer <key>, valores em CENTAVOS.
// Resposta: { id: "pay_...", status: "PENDING", amount, data: { copypaste, e2e } }.
export async function createPayment({ orderId, amountCents, shippingCents = 0, description, notificationUrl, ip, customer }) {
  if (!config.payshark.apiKey) throw new Error('PAYSHARK_API_KEY ausente');
  const base = config.payshark.baseUrl || 'https://api.gatewaypayshark.com.br/v1';
  const c = customer || {};

  const body = {
    amount: amountCents,               // centavos
    currency: 'BRL',
    method: 'PIX',
    description: description || `Pedido ${orderId} - ${config.lojaNome}`,
    externalRef: orderId,              // volta no webhook pra casar o pedido
    notificationUrl,
    ip: ip || undefined,
    payer: {
      name: c.name,
      taxId: digits(c.cpf),
      email: c.email || undefined,
      phone: digits(c.phone) || undefined,
    },
    // Um único item = total do pedido (garante que a soma bata com o amount pós-desconto).
    items: [{ quantity: 1, name: `Pedido ${config.lojaNome} #${orderId}`, price: amountCents, type: 'PHYSICAL' }],
    delivery: {
      fee: shippingCents || 0,         // informativo (não é somado ao amount)
      address: {
        country: 'BR',
        state: c.state,
        city: c.city,
        district: c.neighborhood,
        street: c.street,
        number: String(c.number || ''),
        complement: c.complement || undefined,
        zipCode: digits(c.cep),
      },
    },
  };

  const res = await fetch(`${base}/payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payshark.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) {
    throw new Error(`PayShark payment ${res.status}: ${text.slice(0, 300)}`);
  }
  const pixCode = data?.data?.copypaste;
  if (!data?.id || !pixCode) {
    throw new Error(`PayShark resposta inesperada: ${text.slice(0, 300)}`);
  }
  return {
    transactionId: String(data.id),   // "pay_..."
    pixCode,                           // copia-e-cola (EMV) — QR é gerado a partir dele
    valueCents: Number(data.amount) || amountCents,
    status: data.status,              // "PENDING"
  };
}

export default { createPayment };
