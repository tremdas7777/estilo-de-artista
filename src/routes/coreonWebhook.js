import { Router } from 'express';
import crypto from 'node:crypto';
import config from '../config.js';
import { getOrder, getOrderByTransactionId } from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { emSegundoPlano } from '../segundoPlano.js';

const router = Router();

// Candidatos de segredo pro HMAC. No painel da Coreon o segredo aparece com o
// prefixo `whsec_`, mas é comum ele ser copiado sem — testamos as duas formas
// pra um copia-e-cola incompleto não derrubar todo pagamento.
function segredos() {
  const s = String(config.coreon.webhookSecret || '').trim();
  if (!s) return [];
  return s.startsWith('whsec_') ? [s, s.slice(6)] : [s, `whsec_${s}`];
}

// Compara em tempo constante (tamanhos diferentes = já não bate).
function iguais(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Assinatura: hash_hmac('sha256', rawBody, webhookSecret) em hex, no header
// X-Coreon-Signature. Alguns painéis mandam no formato "sha256=<hex>".
function assinaturaOk(req) {
  const chaves = segredos();
  if (!chaves.length) return 'sem-segredo';       // check desligado

  const header = String(req.get('x-coreon-signature') || '').trim();
  if (!header) return 'sem-header';               // webhook criado sem segredo

  const recebida = header.replace(/^sha256=/i, '').toLowerCase();
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const bate = chaves.some((k) =>
    iguais(crypto.createHmac('sha256', k).update(raw).digest('hex'), recebida));
  return bate ? 'ok' : 'invalida';
}

// POST /webhooks/coreon
// Responde 200 IMEDIATO e processa depois (postback não deve esperar Shopify/CAPI).
// Payload Coreon: { event:"payment.paid", transaction_id, external_reference,
//   type:"deposit", payment_method, amount, fee_amount, net_amount, status,
//   paid_at, provider, product_name, domain, customer:{ document, email }, ... }
//
// ATENÇÃO: a Coreon não aceita URL de postback por cobrança — o endereço é
// cadastrado no painel dela e chega SEM o `?token=` que os outros gateways
// usam. As defesas aqui são a assinatura HMAC, o `external_reference` (id do
// pedido, 16 bytes aleatórios), o id da transação e a conferência do valor.
//
// O `emSegundoPlano` é obrigatório na Vercel: sem ele a instância pode ser
// congelada no instante em que a resposta sai, e o processamento morre no meio
// — a Coreon recebe o 200 e o pedido nunca fica pago. Ver segundoPlano.js.
router.post('/webhooks/coreon', (req, res) => {
  res.status(200).json({ received: true });

  emSegundoPlano((async () => {
    try {
      const body = req.body || {};
      const ref = String(body.external_reference || '');
      const incomingId = body.transaction_id ?? body.id;

      // (a) assinatura. Segredo configurado + assinatura errada = descarta.
      const sig = assinaturaOk(req);
      if (sig === 'invalida') {
        return console.warn(`[webhook coreon] ASSINATURA INVÁLIDA (ref=${ref || '?'}) — descartado. Confira COREON_WEBHOOK_SECRET com o segredo do painel.`);
      }
      // Segredo configurado e postback SEM assinatura = descarta também.
      //
      // Passar batido aqui era grave: sem assinatura, as defesas que sobram
      // são o external_reference (que É o id do pedido, conhecido do próprio
      // cliente), o id da transação e o valor — e os dois últimos só são
      // conferidos SE vierem no corpo, então bastava omitir os dois. Ou seja:
      // quem tinha um PIX pendente mandava um POST com o próprio número de
      // pedido e levava a compra sem pagar.
      //
      // Se os pedidos pararem de confirmar sozinhos, é porque o webhook
      // cadastrado no painel da Coreon está SEM segredo: ponha lá o mesmo
      // valor de COREON_WEBHOOK_SECRET. O pedido não some — fica pendente no
      // /admin para marcar na mão. Para desligar a conferência, esvazie a var.
      if (sig === 'sem-header') {
        return console.warn(`[webhook coreon] SEM ASSINATURA (ref=${ref || '?'}) — descartado. O webhook no painel da Coreon precisa do mesmo segredo de COREON_WEBHOOK_SECRET.`);
      }
      if (sig === 'sem-segredo') {
        console.warn('[webhook coreon] COREON_WEBHOOK_SECRET não configurado — seguindo só com external_reference + id + valor.');
      }

      // (b) acha o pedido: external_reference é o id do pedido; o id da
      // transação serve de reserva se a Coreon não devolver a referência.
      let order = ref ? await getOrder(ref) : null;
      if (!order && incomingId) {
        order = await getOrderByTransactionId(incomingId);
        if (order) console.warn(`[webhook coreon] sem external_reference — casado pelo id da transação pedido=${order.id}`);
      }
      if (!order) {
        return console.warn(`[webhook coreon] sem pedido correspondente (ref=${ref || '?'} id=${incomingId || '?'}) — banco zerado por deploy? payload=${JSON.stringify(body).slice(0, 500)}`);
      }

      // (c) id da transação tem que casar com o vinculado ao pedido
      if (order.transactionId && incomingId &&
          String(incomingId) !== String(order.transactionId)) {
        return console.warn(`[webhook coreon] id divergente pedido=${order.id}`);
      }

      // (d) saque/chargeback usam o mesmo endpoint — só entrada interessa
      const type = String(body.type || 'deposit').toLowerCase();
      if (type !== 'deposit') {
        return console.log(`[webhook coreon] ignorado type=${type} pedido=${order.id}`);
      }

      // (e) só confirma no evento/status de pago
      const event = String(body.event || '').toLowerCase();
      const status = String(body.status || '').toLowerCase();
      const pago = event === 'payment.paid' || ['paid', 'approved', 'completed'].includes(status);
      if (!pago) {
        return console.log(`[webhook coreon] ignorado event=${event || '?'} status=${status || '?'} pedido=${order.id} payload=${JSON.stringify(body).slice(0, 500)}`);
      }

      // (f) valor não pode ser MENOR que o esperado (tol. 1 centavo).
      // `amount` é o bruto em centavos (fee_amount/net_amount são o líquido —
      // conferir por eles reprovaria todo pedido pela taxa da Coreon).
      const raw = Number(body.amount);
      if (Number.isFinite(raw) && raw > 0 && raw < order.totalCents - 1) {
        return console.warn(`[webhook coreon] valor abaixo do esperado pedido=${order.id} recebido=${raw} esperado=${order.totalCents}`);
      }

      // (g) idempotência garantida dentro de markOrderPaid
      const r = await markOrderPaid(order.id);
      console.log(`[webhook coreon] pedido=${order.id} ${r.already ? 'já estava pago' : 'marcado como PAGO'}`);
    } catch (e) {
      console.error('[webhook coreon] erro ao processar:', e.message);
    }
  })(), 'webhook coreon');
});

export default router;
