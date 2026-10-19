// Oferta pós-compra ("upsell"): quem acabou de pagar o PIX ganha, por tempo
// limitado, uma página com o catálogo de tênis inteiro a um preço único.
//
// Por que é um pedido NOVO e não um acréscimo ao primeiro: o PIX não guarda
// credencial nenhuma do pagador — não existe o "1 clique" do cartão, cada
// cobrança exige um QR novo. O que dá pra poupar é o resto: endereço, CPF e
// telefone vêm do pedido já pago, então a pessoa só escolhe os pares e paga.
import crypto from 'node:crypto';
import { getOrder } from '../db.js';
import { loadCatalog } from './products.js';
import { TIPO_PRECO_UNICO } from './importCsv.js';

const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);

export const UPSELL = {
  ativo: process.env.UPSELL_ATIVO !== '0',
  precoCents: Math.round(num(process.env.UPSELL_PRECO_CENTS, 6900)),
  // A oferta morre junto com a empolgação da compra. Meia hora é folgado pra
  // escolher e pagar, e curto o bastante pra não virar preço permanente.
  janelaMs: Math.round(num(process.env.UPSELL_JANELA_MIN, 30) * 60_000),
  // Só o Type que tem preço único (Tênis). Óculos e chinelos custam menos que
  // a própria oferta — entrariam como aumento de preço, não como desconto.
  tipo: process.env.UPSELL_TIPO || TIPO_PRECO_UNICO,
  maxItens: Math.round(num(process.env.UPSELL_MAX_ITENS, 10)),
};

// Token do link da oferta, derivado do `postbackToken` do pedido.
//
// Derivado, e não uma coluna nova, porque o postbackToken já é único, secreto
// e está gravado. E derivado por HMAC, que é de mão única: se o link da oferta
// vazar (ele vai parar no histórico do navegador), ninguém remonta com ele o
// token que autentica os webhooks de pagamento.
//
// Sem token a URL seria só /oferta/<id do pedido> — e o id viaja por e-mail e
// WhatsApp, então bastaria ter recebido um para comprar a R$ 69 para sempre.
export function upsellToken(order) {
  return crypto.createHmac('sha256', String(order.postbackToken || ''))
    .update(`upsell:${order.id}`).digest('hex').slice(0, 24);
}

const tokenConfere = (recebido, esperado) => {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const restanteMs = (order) =>
  Math.max(0, (Number(order.paidAt) || 0) + UPSELL.janelaMs - Date.now());

// Porta de entrada da oferta: devolve `{ order, restanteMs }` ou `{ erro }`.
// Todo caminho que serve a oferta (página, catálogo e criação do 2º pedido)
// passa por aqui — é o único lugar que decide quem pode comprar barato.
export async function abrirOferta(orderId, token) {
  if (!UPSELL.ativo) return { erro: 'Oferta indisponível no momento.' };
  const order = await getOrder(String(orderId || ''));
  if (!order) return { erro: 'Pedido não encontrado.' };
  // A oferta é o prêmio de ter pago. Pedido pendente não abre — senão bastaria
  // gerar um PIX qualquer, nunca pagar, e usar o link.
  if (order.status !== 'paid') return { erro: 'A oferta libera assim que o seu PIX for confirmado.' };
  if (!tokenConfere(token, upsellToken(order))) return { erro: 'Link da oferta inválido.' };
  const restante = restanteMs(order);
  if (restante <= 0) return { erro: 'Esta oferta expirou.' };
  return { order, restanteMs: restante };
}

// Link completo da oferta, do jeito que vai no botão da tela de obrigado.
export const upsellHref = (order) =>
  `/oferta/${encodeURIComponent(order.id)}?t=${upsellToken(order)}`;

// Catálogo da oferta: os produtos elegíveis, já com o preço da promoção no
// lugar do preço de catálogo. O preço mostrado sai DAQUI, do mesmo lugar que o
// backend usa pra cobrar — não tem como a tela prometer um valor e a cobrança
// vir outro.
export async function produtosDaOferta() {
  const { products } = await loadCatalog();
  return products.filter((p) => (p.type || TIPO_PRECO_UNICO) === UPSELL.tipo);
}

// Preço da oferta para uma variante — a única fonte de verdade da cobrança.
// Devolve null para item que não faz parte da promoção, e é isso que impede
// alguém de mandar o id de um Juliet e levá-lo por este preço.
export async function precoDaOferta(variantId) {
  const elegiveis = await produtosDaOferta();
  for (const p of elegiveis) {
    for (const v of p.variants || []) {
      if (String(v.id) === String(variantId)) {
        return { variant: v, product: p, precoCents: UPSELL.precoCents };
      }
    }
  }
  return null;
}

export default { UPSELL, upsellToken, upsellHref, abrirOferta, produtosDaOferta, precoDaOferta, restanteMs };
