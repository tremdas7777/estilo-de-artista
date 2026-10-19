import config from '../config.js';

const digits = (v) => String(v || '').replace(/\D/g, '');

// Basic auth: usuário fixo "x" + chave secreta, em base64. Doc:
// Authorization: Basic $(echo -n 'x:sk_SUA_CHAVE' | base64)
function authHeader(key) {
  return `Basic ${Buffer.from(`x:${key}`, 'utf8').toString('base64')}`;
}

// Cash-in PIX (Solution Payments). Interface unificada igual aos outros gateways.
// Doc: POST {base}/v1/transactions.php, Basic auth, valores em CENTAVOS.
// Resposta: { httpCode, body: { transaction: { id, status, amount, pix: { qrcode } } } }.
export async function createPayment({ orderId, amountCents, description, notificationUrl, customer }) {
  if (!config.solution.apiKey) throw new Error('SOLUTION_API_KEY ausente');
  const base = config.solution.baseUrl || 'https://api.solutionpayments.com.br';
  const c = customer || {};

  const body = {
    paymentMethod: 'pix',
    amount: amountCents,                 // centavos
    postbackUrl: notificationUrl,
    customer: {
      name: c.name,
      // email/phone são obrigatórios na doc — fallback evita 400 travar o checkout
      email: c.email || 'cliente@exemplo.com.br',
      phone: digits(c.phone) || '11999999999',
      document: { number: digits(c.cpf), type: 'cpf' },
    },
    // Um único item = total do pedido (garante que a soma bata com o amount pós-desconto).
    items: [{
      title: description || `Pedido ${config.lojaNome} #${orderId}`,
      unitPrice: amountCents,
      quantity: 1,
    }],
  };

  const res = await fetch(`${base}/v1/transactions.php`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config.solution.apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) {
    throw new Error(`Solution transaction ${res.status}: ${text.slice(0, 300)}`);
  }

  // A resposta vem envelopada em body.transaction; aceita a forma "crua" por segurança.
  const tx = data?.body?.transaction || data?.transaction || null;
  const pixCode = tx?.pix?.qrcode || tx?.pix?.copyPaste || tx?.qrcode;

  if (!tx?.id || !pixCode) {
    throw new Error(`Solution resposta inesperada: ${text.slice(0, 300)}`);
  }

  return {
    transactionId: String(tx.id),
    pixCode,                                          // copia-e-cola (EMV)
    valueCents: Number(tx.amount) || amountCents,     // centavos na criação
    status: tx.status,                                // "waiting_payment"
  };
}

// Consulta uma transação direto na Solution. É o que o webhook usa para
// confirmar o pagamento: o postback dela não tem assinatura, então a palavra
// final é a da API, com a nossa chave, e não a do corpo que chegou.
// Doc: GET {base}/v1/transaction.php?id=<id>, mesma Basic auth, valor em CENTAVOS.
// Nunca lança: devolve { ok:false, motivo } para o webhook decidir o que fazer.
export async function getTransaction(id, { timeoutMs = 3500 } = {}) {
  if (!config.solution.apiKey) return { ok: false, motivo: 'SOLUTION_API_KEY ausente' };
  if (!id) return { ok: false, motivo: 'pedido sem id de transação' };
  const base = config.solution.baseUrl || 'https://api.solutionpayments.com.br';

  try {
    const res = await fetch(`${base}/v1/transaction.php?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: authHeader(config.solution.apiKey), Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }
    const tx = data?.body?.transaction || data?.transaction || null;
    if (!tx?.status) return { ok: false, motivo: `resposta inesperada: ${text.slice(0, 200)}` };

    return { ok: true, status: String(tx.status).toLowerCase(), amountCents: Number(tx.amount) };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

export default { createPayment, getTransaction };
