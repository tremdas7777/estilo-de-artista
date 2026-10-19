import config from '../config.js';

// Rastreio próprio (RotaSync). Cria a encomenda lá quando o pedido é pago e
// devolve o código/URL de acompanhamento, que a loja guarda no pedido.
//
// Doc conferida contra a API em 06/10/2026:
//   POST {base}/api/v1/orders
//   Authorization: Bearer <chave da loja>   (começa com rk_)
//   Idempotency-Key: <chave do envio>
//   -> 201 { status, outcome, duplicate,
//            order: { tracking_code, tracking_url, status } }
//
// Este arquivo NUNCA lança por falha de rede, status ruim ou resposta
// inesperada: ele devolve { ok:false, motivo }. Quem chama é o caminho do
// pagamento, e rastreio que falha não pode derrubar a confirmação de um
// pagamento que já entrou — o pedido fica sem código e o /admin mostra isso.

const digits = (v) => String(v ?? '').replace(/\D/g, '');
const texto = (v) => String(v ?? '').trim();

// Só o que a API pede, e nada do que ela não pede: CPF não vai (não está no
// contrato do endpoint e é dado sensível que não precisa viajar duas vezes).
function corpo(order) {
  const c = order.customer || {};
  return {
    // `external_id` é o id do pedido na loja: é por ele que os dois lados se
    // reconhecem depois, e é o que faz a idempotência valer a pena.
    external_id: String(order.id),
    number: String(order.id),
    payment_status: 'paid',
    customer: {
      name: texto(c.name),
      email: texto(c.email),
      phone: digits(c.phone),
    },
    shipping_address: {
      street: texto(c.street),
      number: texto(c.number),
      // Nomes diferentes dos dois lados: a loja guarda `neighborhood` e `cep`,
      // a API espera `district` e `postal_code`. Mapear errado aqui vira
      // etiqueta sem bairro ou sem CEP — encomenda que não sai.
      complement: texto(c.complement),
      district: texto(c.neighborhood),
      city: texto(c.city),
      state: texto(c.state),
      postal_code: texto(c.cep),
    },
    items: (order.items || []).map((i) => ({
      name: texto(i.title) || 'Produto',
      quantity: i.qty || 1,
    })),
  };
}

// Consulta a encomenda já criada, pelo id do pedido na loja.
//   GET {base}/api/v1/orders/{external_id}
//   -> { external_id, tracking: { order: { tracking_code, … }, tracking_url, … } }
//
// Serve de resgate quando o POST não dá o código de volta: a API casa a
// `Idempotency-Key` com o CONTEÚDO do pedido e responde 409 quando a mesma
// chave chega com conteúdo diferente. Sem este GET, um pedido que mudasse entre
// duas tentativas ficaria sem código na loja ENQUANTO a encomenda já existe lá
// — e nem pelo /admin se recuperaria o link.
export async function consultarRastreio(externalId) {
  const { baseUrl, apiKey } = config.rastreio;
  if (!apiKey) return { ok: false, motivo: 'sem RASTREIO_API_KEY' };
  if (!externalId) return { ok: false, motivo: 'sem external_id' };

  try {
    const res = await fetch(`${baseUrl}/api/v1/orders/${encodeURIComponent(String(externalId))}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }

    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status} ${text.slice(0, 200)}` };

    const t = data?.tracking || {};
    const codigo = texto(t.order?.tracking_code);
    if (!codigo) return { ok: false, motivo: `consulta sem tracking_code: ${text.slice(0, 200)}` };

    return { ok: true, codigo, url: texto(t.tracking_url), status: texto(t.status) };
  } catch (e) {
    return { ok: false, motivo: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

// Cria (ou recupera) a encomenda no RotaSync.
//
// A `Idempotency-Key` é derivada do id do pedido, então o MESMO pedido enviado
// duas vezes não abre duas encomendas: o webhook do gateway pode repetir, e a
// própria API responde `duplicate: true` com o código que já existia. É a
// mesma garantia que o markOrderPaid dá do lado da loja.
export async function criarRastreio(order) {
  const { baseUrl, apiKey } = config.rastreio;
  if (!apiKey) return { ok: false, motivo: 'sem RASTREIO_API_KEY' };
  if (!order?.id) return { ok: false, motivo: 'pedido sem id' };

  try {
    const res = await fetch(`${baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': `pedido-${order.id}-pago`,
      },
      body: JSON.stringify(corpo(order)),
      // Teto de tempo: quem espera do outro lado é o webhook do gateway.
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }

    // 409: a mesma Idempotency-Key já foi usada com OUTRO conteúdo. Acontece
    // quando o pedido mudou entre duas tentativas (gravação que falhou, deploy
    // no meio). A encomenda EXISTE lá — então em vez de devolver erro e deixar
    // o pedido sem código, busca o que já foi criado.
    if (res.status === 409) {
      const achado = await consultarRastreio(order.id);
      if (achado.ok) return { ...achado, duplicado: true, outcome: 'recuperado-do-conflito' };
      return { ok: false, motivo: `409 e a consulta também falhou: ${achado.motivo}` };
    }

    if (!res.ok) {
      return { ok: false, motivo: `HTTP ${res.status} ${text.slice(0, 200)}` };
    }

    const o = data?.order || {};
    const codigo = texto(o.tracking_code);
    // 2xx sem código é resposta que não dá para usar: melhor dizer que falhou
    // do que gravar string vazia e o /admin mostrar o pedido como despachado.
    if (!codigo) {
      return { ok: false, motivo: `resposta sem tracking_code: ${text.slice(0, 200)}` };
    }

    return {
      ok: true,
      codigo,
      url: texto(o.tracking_url),
      duplicado: data?.duplicate === true,
      outcome: texto(data?.outcome),
    };
  } catch (e) {
    return { ok: false, motivo: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

export default { criarRastreio };
