import config from '../config.js';
import { todas as gravacoesDe, resumo as resumoGravacao } from './gravacao.js';
import adminApi from '../shopify/adminApi.js';
import { resolveVariant } from './products.js';
import { computeDiscount } from './promo.js';
import { getShippingOption } from './catalog.js';

const reais = (cents) => (cents / 100).toFixed(2);

// Só os dígitos do telefone, sem o DDI.
//
// O 55 do começo só é código de país quando o número tem 12 ou 13 dígitos
// (55 + DDD + 8 ou 9). Com 10 ou 11 dígitos, "55" é o DDD de Santa Maria/RS —
// e tirar ali estragaria o número de todo cliente daquela região.
export function telefoneDigitos(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d;
}

// Fixo: DDD + 8 dígitos, começando entre 2 e 5.
// Celular: DDD + 9 dígitos, começando com 9 (obrigatório desde 2016).
// Não existe DDD abaixo de 11.
export function telefoneValido(phone) {
  const d = telefoneDigitos(phone);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  if (d.length === 11) return d[2] === '9';
  return /[2-5]/.test(d[2]);
}

// Telefone em E.164 (+55...). A Shopify recusa outros formatos.
export function toE164(phone) {
  const d = telefoneDigitos(phone);
  return d ? `+55${d}` : '';
}

// Revalida o carrinho contra a Shopify (NUNCA confia no preço do front).
export async function resolveCart(cartItems) {
  const items = [];
  for (const { variantId, qty } of cartItems) {
    const q = Math.max(1, Math.min(20, parseInt(qty, 10) || 0));
    if (!q) continue;
    const v = await resolveVariant(variantId);
    if (!v) throw new Error(`Variante ${variantId} não encontrada no catálogo`);
    items.push({
      variantId: v.id,
      qty: q,
      priceCents: v.priceCents,
      title: v.title,
      image: v.image,
      productId: v.productId,
      // usado por promo.js quando a promo é restrita a certos produtos
      handle: v.handle || '',
    });
  }
  if (!items.length) throw new Error('Carrinho vazio');
  const subtotalCents = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
  return { items, subtotalCents };
}

// Preço final: subtotal + promo + frete escolhido (tudo recalculado e validado no backend).
export function priceOrder({ items, subtotalCents, shippingId }) {
  const promo = computeDiscount(items);
  const afterDiscount = Math.max(0, subtotalCents - promo.discountCents);
  const shipping = getShippingOption(shippingId);
  if (!shipping) throw new Error('Selecione uma opção de frete válida');
  const totalCents = afterDiscount + shipping.cents;
  return { subtotalCents, discountCents: promo.discountCents, shippingCents: shipping.cents, totalCents, shipping };
}

// Monta o payload de pedido da Shopify. financialStatus: 'pending' | 'paid'.
export function buildShopifyOrder(order, { financialStatus }) {
  const c = order.customer;
  const paid = financialStatus === 'paid';

  const line_items = order.items.map((it) => ({
    variant_id: Number(it.variantId),
    quantity: it.qty,
  }));

  const note_attributes = [
    { name: 'CPF', value: String(c.cpf || '').replace(/\D/g, '') },
    { name: 'PixGate Transaction', value: order.transactionId || '' },
    { name: 'Checkout Order', value: order.id },
  ];

  // Gravação vai como note_attribute, e não como property de line item: usar
  // property obrigaria a quebrar a linha em uma por texto, e a quantidade
  // deixaria de bater com a que gerou o PIX. Aqui ela aparece no pedido sem
  // tocar em nada do que já fecha.
  for (const { item, g } of gravacoesDe(order.items)) {
    note_attributes.push({
      name: `Gravação — ${item.title || item.variantId}`,
      value: resumoGravacao(g),
    });
  }

  const address = {
    first_name: c.name?.split(/\s+/)[0] || c.name || '',
    last_name: c.name?.split(/\s+/).slice(1).join(' ') || '',
    name: c.recipient || c.name || '',
    address1: [c.street, c.number].filter(Boolean).join(', '),
    address2: [c.complement, c.neighborhood].filter(Boolean).join(' - '),
    city: c.city || '',
    province: c.state || '',
    zip: String(c.cep || '').replace(/\D/g, ''),
    country: 'BR',
    phone: toE164(c.phone),
  };

  const payload = {
    email: c.email,
    phone: toE164(c.phone),
    currency: order.currency || config.currency,
    financial_status: paid ? 'paid' : 'pending',
    inventory_behaviour: 'decrement_obeying_policy',
    send_receipt: paid,
    send_fulfillment_receipt: false,
    tags: paid ? 'PixGate, PIX' : 'PixGate, PIX, Aguardando PIX',
    line_items,
    note_attributes,
    customer: {
      first_name: address.first_name,
      last_name: address.last_name,
      email: c.email,
      phone: toE164(c.phone),
    },
    shipping_address: address,
    billing_address: address,
    shipping_lines: [{ title: order.shipping.name, price: reais(order.shippingCents) }],
  };

  // Desconto: pro total da Shopify bater com o valor real do PIX.
  if (order.discountCents > 0) {
    payload.discount_codes = [
      { code: config.promo.code, amount: reais(order.discountCents), type: 'fixed_amount' },
    ];
  }

  // Pago: registra a transação junto (usado no fallback de criar já pago).
  if (paid) {
    payload.transactions = [
      { kind: 'sale', status: 'success', amount: reais(order.totalCents), gateway: 'PixGate' },
    ];
  }

  return payload;
}

// A réplica na Shopify só faz sentido com variantes DA Shopify (id numérico).
// Com o catálogo próprio os ids são "handle::numeracao" — mandar isso viraria
// Number(...) = NaN e criaria pedido corrompido lá. Nesse caso não replica.
export function shopifySyncable(order) {
  return (order.items || []).every((it) => /^\d+$/.test(String(it.variantId)));
}

// Cria o pedido PENDENTE na Shopify. Falha aqui NÃO bloqueia o checkout.
export async function createShopifyPending(order) {
  if (!shopifySyncable(order)) return null;
  const payload = buildShopifyOrder(order, { financialStatus: 'pending' });
  const created = await adminApi.createOrder(payload);
  return created?.id ? String(created.id) : null;
}

// Confirma pagamento na Shopify: pending -> paid via transação; ou cria já pago (fallback).
export async function confirmShopifyPaid(order) {
  if (!shopifySyncable(order) && !order.shopifyOrderId) return null;
  if (order.shopifyOrderId) {
    await adminApi.createTransaction(order.shopifyOrderId, {
      kind: 'sale',
      status: 'success',
      amount: reais(order.totalCents),
      gateway: 'PixGate',
    });
    return order.shopifyOrderId;
  }
  const payload = buildShopifyOrder(order, { financialStatus: 'paid' });
  const created = await adminApi.createOrder(payload);
  return created?.id ? String(created.id) : null;
}

export default { resolveCart, priceOrder, buildShopifyOrder, createShopifyPending, confirmShopifyPaid, shopifySyncable, toE164 };
