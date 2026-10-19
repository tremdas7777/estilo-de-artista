import config from '../config.js';

const digits = (v) => String(v || '').replace(/\D/g, '');

// Cash-in PIX (Coreon Pay). Interface unificada igual aos outros gateways.
// Doc: POST {base}/api/v1/payments, headers X-Api-Key + X-Api-Secret,
// valores em CENTAVOS. Resposta: { success, transaction_id, external_reference,
// status, amount, payment_url, checkout_url, pix_qrcode, pix_copy_paste }.
//
// DIFERENÇA IMPORTANTE pros outros gateways: a Coreon NÃO aceita URL de
// postback por cobrança — o webhook é cadastrado uma vez no painel dela. Por
// isso o `notificationUrl` (com o token secreto) é ignorado aqui e o webhook
// acha o pedido pelo `external_reference`, que é o id do pedido.
//
// Verificado contra a API em 17/08/2026 (cobrança real de R$ 99):
//  - a resposta vem SEM envelope `data` — os campos são de primeiro nível;
//  - `pix_copy_paste` é o EMV; `pix_qrcode` veio como URL de imagem pronta;
//  - o provedor por trás é a Paya55, e ela RECUSA valores baixos: R$ 1,00
//    voltou 500 "Erro ao criar cobrança PIX na Paya55" e R$ 99,00 passou.
//    Um CPF com dígito verificador inválido também derruba a criação;
//  - `qr_valid_seconds` = 900. O QR vale 15 MINUTOS (a Umbrella dava 1 dia),
//    então o cliente que demora pra pagar precisa refazer o pedido.
export async function createPayment({ orderId, amountCents, description, customer }) {
  if (!config.coreon.apiKey) throw new Error('COREON_API_KEY ausente');
  if (!config.coreon.apiSecret) throw new Error('COREON_API_SECRET ausente');

  const base = config.coreon.baseUrl || 'https://app.coreonpay.com';
  const c = customer || {};
  const titulo = description || `Pedido ${config.lojaNome} #${orderId}`;

  const body = {
    amount: amountCents,                 // centavos — é o valor efetivamente cobrado
    payment_method: 'pix',
    product_name: titulo,
    // Campo obrigatório na doc. Sai do APP_URL/RENDER_EXTERNAL_URL, então
    // acompanha a loja sozinho quando o mesmo código roda em outro serviço.
    domain: config.coreon.domain,
    external_reference: orderId,         // é por AQUI que o webhook acha o pedido
    description: titulo,
    customer: {
      name: c.name,
      // email/phone/document costumam ser obrigatórios no antifraude —
      // fallback evita 400 travar o checkout.
      email: c.email || `cliente@${config.coreon.domain}`,
      document: digits(c.cpf),
      phone: digits(c.phone) || '11999999999',
    },
  };

  const res = await fetch(`${base}/api/v1/payments`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.coreon.apiKey,
      'X-Api-Secret': config.coreon.apiSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) {
    throw new Error(`Coreon payment ${res.status}: ${text.slice(0, 300)}`);
  }
  if (data && data.success === false) {
    throw new Error(`Coreon recusou: ${data.message || data.error || text.slice(0, 300)}`);
  }

  const tx = data?.data || data || {};
  const transactionId = tx.transaction_id ?? tx.id;
  // `pix_copy_paste` é o EMV — é o único campo confiável para o copia-e-cola.
  // `pix_qrcode` NÃO é o código: no teste veio uma URL de imagem pronta
  // (api.qrserver.com/...), e em outras contas vem base64. Só serve de reserva
  // quando não parece link/imagem — senão o cliente copiaria uma URL e o PIX
  // não colaria no app do banco.
  const qr = String(tx.pix_qrcode || '');
  const qrEhImagem = /^(data:|https?:)/i.test(qr);
  const pixCode = tx.pix_copy_paste || (qrEhImagem ? '' : qr);

  if (!transactionId || !pixCode) {
    throw new Error(`Coreon resposta inesperada: ${text.slice(0, 300)}`);
  }

  return {
    transactionId: String(transactionId),
    pixCode,                                          // copia-e-cola (EMV)
    valueCents: Number(tx.amount) || amountCents,     // centavos
    status: tx.status || 'pending',
  };
}

export default { createPayment };
