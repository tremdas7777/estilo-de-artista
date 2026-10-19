import crypto from 'node:crypto';
import config from '../config.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
// PII: lowercase + trim antes do hash. Vazio -> não envia o campo.
const hash = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  return s ? sha256(s) : undefined;
};
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// Telefone com DDI 55 (E.164 sem '+', só dígitos) — depois hasheia.
function hashPhone(phone) {
  let d = onlyDigits(phone);
  if (d && !d.startsWith('55')) d = '55' + d;
  return d ? sha256(d) : undefined;
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
}

// Envia o Purchase pela CAPI. event_id = orderId (mesmo do browser) -> dedup automático.
export async function sendPurchase(order) {
  const { pixelId, capiToken, testEventCode, apiVersion } = config.facebook;
  if (!capiToken || !pixelId) {
    console.warn('[capi] FB_CAPI_TOKEN/FB_PIXEL_ID ausente — Purchase server-side pulado.');
    return { skipped: true };
  }

  const c = order.customer || {};
  const fb = order.fb || {};
  const { first, last } = splitName(c.name);

  const user_data = {
    em: hash(c.email),
    ph: hashPhone(c.phone),
    fn: hash(first),
    ln: hash(last),
    external_id: hash(onlyDigits(c.cpf)),
    ct: hash(c.city),
    st: hash(c.state),
    zp: hash(onlyDigits(c.cep)),
    country: hash('br'),
    // SEM hash (regra da API):
    client_ip_address: fb.ip || undefined,
    client_user_agent: fb.userAgent || undefined,
    fbp: fb.fbp || undefined,
    fbc: fb.fbc || undefined,
  };
  // remove chaves undefined
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);

  const contents = (order.items || []).map((it) => ({ id: String(it.variantId), quantity: it.qty }));
  const content_ids = contents.map((x) => x.id);
  const num_items = contents.reduce((s, x) => s + x.quantity, 0);

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor((order.paidAt || Date.now()) / 1000),
    event_id: order.id, // dedup com o browser
    action_source: 'website',
    event_source_url: `${config.appUrl}/checkout`,
    user_data,
    custom_data: {
      currency: order.currency || config.currency,
      value: Number((order.totalCents / 100).toFixed(2)),
      content_type: 'product',
      content_ids,
      contents,
      num_items,
    },
  };

  const payload = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[capi] erro Purchase:', res.status, JSON.stringify(data).slice(0, 300));
      return { ok: false };
    }
    console.log('[capi] Purchase enviado. event_id=', order.id);
    return { ok: true, data };
  } catch (e) {
    console.error('[capi] falha ao enviar Purchase:', e.message);
    return { ok: false };
  }
}

export default { sendPurchase };
