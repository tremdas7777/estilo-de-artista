import { Router } from 'express';
import { getOrderByPostbackToken, getOrderByTransactionId } from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { emSegundoPlano } from '../segundoPlano.js';

const router = Router();

// POST /webhooks/umbrella?token=<postbackToken>
// Responde 200 IMEDIATO e processa depois (postback não deve esperar Shopify/CAPI).
// Payload Umbrella: { objectId:"<id da transação>",
//   data: { status, endToEndId, paidAt, type:"transaction", refunds:[], rejectionReason, error } }
//
// ATENÇÃO: diferente dos outros gateways, o postback NÃO traz o valor da
// transação — então não dá pra conferir o total aqui. A defesa é o par
// token secreto (24 bytes) + objectId ter que bater com a transação do pedido.
//
// O `emSegundoPlano` é obrigatório na Vercel: sem ele a instância pode ser
// congelada no instante em que a resposta sai, e o processamento morre no meio
// — a Umbrella recebe o 200 e o pedido nunca fica pago. Ver segundoPlano.js.
router.post('/webhooks/umbrella', (req, res) => {
  res.status(200).json({ received: true });

  emSegundoPlano((async () => {
    try {
      const token = String(req.query.token || '');
      const body = req.body || {};
      const d = body.data || {};
      const incomingId = body.objectId ?? d.id;

      // (a) acha o pedido: token na query e, se ele não vier, o id da transação.
      // O par token+id continua sendo a defesa; o fallback só troca qual dos dois
      // localiza o pedido, porque o id é um uuid que só a Umbrella e nós conhecemos.
      let order = await getOrderByPostbackToken(token);
      if (!order) {
        order = await getOrderByTransactionId(incomingId);
        if (order) console.warn(`[webhook umbrella] postback sem token válido — casado pelo id da transação pedido=${order.id}`);
      }
      if (!order) {
        return console.warn(`[webhook umbrella] sem pedido correspondente (token=${token ? 'presente' : 'ausente'} id=${incomingId || '?'}) — banco zerado por deploy? payload=${JSON.stringify(body).slice(0, 500)}`);
      }

      // (b) id da transação tem que casar com o vinculado
      if (order.transactionId && incomingId &&
          String(incomingId) !== String(order.transactionId)) {
        return console.warn(`[webhook umbrella] id divergente pedido=${order.id}`);
      }

      // (c) eventos de reembolso/chargeback usam o mesmo endpoint — só transação
      // interessa. Caixa normalizada: a doc mostra minúsculo, mas não custa.
      const type = String(d.type || 'transaction').toLowerCase();
      if (type !== 'transaction') {
        return console.log(`[webhook umbrella] ignorado type=${type} pedido=${order.id}`);
      }

      // (d) só confirma no status de pago (a API devolve MAIÚSCULO na criação,
      // o exemplo de postback vem minúsculo — normaliza os dois)
      const status = String(d.status || body.status || '').toUpperCase();
      if (!['PAID', 'APPROVED', 'COMPLETED', 'SUCCESS'].includes(status)) {
        return console.log(`[webhook umbrella] ignorado status=${status || '?'} pedido=${order.id} payload=${JSON.stringify(body).slice(0, 500)}`);
      }

      // (e) idempotência garantida dentro de markOrderPaid
      const r = await markOrderPaid(order.id);
      console.log(`[webhook umbrella] pedido=${order.id} ${r.already ? 'já estava pago' : 'marcado como PAGO'}`);
    } catch (e) {
      console.error('[webhook umbrella] erro ao processar:', e.message);
    }
  })(), 'webhook umbrella');
});

export default router;
