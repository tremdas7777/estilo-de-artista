import config from '../config.js';

// FONTE DA VERDADE do desconto. O front espelha este cálculo só pra exibir.
// Regra: itens "elegíveis" = preço == eligiblePriceCents (R$ 99) E, se
// promo.handles estiver configurada, handle casando com a lista. Com minQty+
// unidades elegíveis, aplica taxa NUM/DEN sobre o total elegível (escala p/ 3, 4, 5...).
// Ex: 1 par = R$99; 2 = R$149 (desconto 4900/19800 ≈ 24,7%); 4 = R$298.
//
// Elegibilidade de UM item. Exportada porque o front espelha esta mesma
// decisão (pages.js) e o admin pode querer conferir item a item.
export function itemElegivel(it, promo = config.promo) {
  if (it.priceCents !== promo.eligiblePriceCents) return false;
  const lista = promo.handles || [];
  if (!lista.length) return true;
  const h = String(it.handle || '').toLowerCase();
  // Sem handle não dá para afirmar que casa. Com a lista ligada, a promo é
  // opt-in: na dúvida o item fica de fora e o cliente paga o preço cheio —
  // o inverso daria desconto a produto que não está na oferta.
  if (!h) return false;
  return lista.some((p) => h.includes(p));
}

export function computeDiscount(items) {
  const { minQty, num, den, label } = config.promo;

  let eligibleQty = 0;
  let eligibleCents = 0;
  for (const it of items) {
    if (itemElegivel(it)) {
      eligibleQty += it.qty;
      eligibleCents += it.priceCents * it.qty;
    }
  }

  if (eligibleQty < minQty || eligibleCents <= 0) {
    return { discountCents: 0, applies: false, label };
  }
  const discountCents = Math.round((eligibleCents * num) / den);
  return { discountCents, applies: true, label };
}

export default { computeDiscount, itemElegivel };
