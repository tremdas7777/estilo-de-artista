import config from '../config.js';

const digits = (v) => String(v || '').replace(/\D/g, '');

// Cash-in PIX (PixGate). Interface unificada igual ao PayShark.
// Doc: POST {base}/api/v1/cashin, header Apikey, valor em REAIS.
// Resposta: { id, pix (copia-e-cola), value, status: "PENDING" }.
export async function createPayment({ orderId, amountCents, description, notificationUrl, customer }) {
  if (!config.pixgate.apiKey) throw new Error('PIXGATE_API_KEY ausente');
  const base = config.pixgate.baseUrl || 'https://app.pixgateip.com';
  const c = customer || {};

  const body = {
    nome: c.name,
    cpf: digits(c.cpf),
    valor: Number((amountCents / 100).toFixed(2)), // reais, 2 casas
    descricao: description || `Pedido ${orderId} - ${config.lojaNome}`,
    postback: notificationUrl || undefined,
    device: 'web',
  };

  const res = await fetch(`${base}/api/v1/cashin`, {
    method: 'POST',
    headers: {
      Apikey: config.pixgate.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) {
    throw new Error(`PixGate cashin ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!data?.id || !data?.pix) {
    throw new Error(`PixGate cashin resposta inesperada: ${text.slice(0, 300)}`);
  }
  return {
    transactionId: String(data.id),
    pixCode: data.pix,
    valueCents: Math.round(Number(data.value) * 100),
    status: data.status,
  };
}

// Consulta uma transação na PixGate. Doc: GET {base}/api/stats/:id, que aceita
// o id, o end2end ou o external_id. Resposta: { status, paid, pending, type,
// method, value, created_at, paid_at }.
//
// Existe por causa do webhook: o postback dela manda só `amount`, que é o valor
// LÍQUIDO (já descontada a taxa). Conferir o líquido contra o total do pedido
// reprova TODA venda legítima — R$ 179,00 com 4,99% chega como 170,07, menor que
// o esperado, e o pedido fica pendente mesmo pago. A Coreon manda o bruto e o
// webhook dela até avisa disso em comentário; aqui o campo tem o mesmo nome e
// significado diferente.
//
// Baixar o `value` daqui resolve sem abrir brecha: o valor vem da PixGate, por
// uma chamada autenticada que sai DESTE servidor, e não do corpo do postback,
// que é o que um atacante controla.
export async function getTransaction(id) {
  if (!config.pixgate.apiKey) throw new Error('PIXGATE_API_KEY ausente');
  if (!id) throw new Error('getTransaction sem id');
  const base = config.pixgate.baseUrl || 'https://app.pixgateip.com';

  const res = await fetch(`${base}/api/stats/${encodeURIComponent(String(id))}`, {
    method: 'GET',
    headers: { Apikey: config.pixgate.apiKey, Accept: 'application/json' },
    // O webhook não pode ficar pendurado: sem teto, uma consulta lenta seguraria
    // a confirmação do pedido (e na Vercel a função tem tempo contado).
    signal: AbortSignal.timeout(8000),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }

  if (!res.ok) throw new Error(`PixGate stats ${res.status}: ${text.slice(0, 300)}`);
  if (!data || typeof data !== 'object') {
    throw new Error(`PixGate stats resposta inesperada: ${text.slice(0, 300)}`);
  }

  const valor = Number(data.value);
  return {
    id: data.id != null ? String(data.id) : null,
    status: String(data.status || '').toUpperCase(),
    paid: data.paid === true,
    pending: data.pending === true,
    type: String(data.type || '').toUpperCase(),
    method: String(data.method || '').toUpperCase(),
    // `value` é o valor da cobrança em reais; aqui tudo é centavo.
    valueCents: Number.isFinite(valor) ? Math.round(valor * 100) : null,
    paidAt: data.paid_at || null,
  };
}

export default { createPayment, getTransaction };
