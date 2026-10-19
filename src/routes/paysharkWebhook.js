import { Router } from 'express';
import { getOrderByPostbackToken } from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { emSegundoPlano } from '../segundoPlano.js';

const router = Router();

// POST /webhooks/payshark?token=<postbackToken>
// Responde 200 IMEDIATO (evita retries do gateway) e processa depois.
//
// O `emSegundoPlano` é obrigatório na Vercel: sem ele a instância pode ser
// congelada no instante em que a resposta sai, e o processamento morre no meio
// — o gateway recebe o 200 e o pedido nunca fica pago. Ver segundoPlano.js.
// Payload PayShark (PIX): { id:"pay_...", status, externalRef, amount(centavos), ... }
router.post('/webhooks/payshark', (req, res) => {
  res.status(200).json({ received: true });

  emSegundoPlano((async () => {
    try {
      const token = String(req.query.token || '');
      const body = req.body || {};

      // (a) token tem que casar com um pedido
      const order = await getOrderByPostbackToken(token);
      if (!order) return console.warn('[webhook] token sem pedido correspondente');

      // (b) id da transação tem que casar com o vinculado
      if (order.transactionId && body.id &&
          String(body.id) !== String(order.transactionId)) {
        return console.warn(`[webhook] id divergente pedido=${order.id}`);
      }

      // (c) externalRef (quando presente) tem que ser o id do pedido
      if (body.externalRef && String(body.externalRef) !== String(order.id)) {
        return console.warn(`[webhook] externalRef divergente pedido=${order.id}`);
      }

      // (d) só confirma no status de pago
      if (body.status !== 'PAID') {
        return console.log(`[webhook] ignorado status=${body.status} pedido=${order.id}`);
      }

      // (e) valor recebido (em centavos) não pode ser MENOR que o esperado
      // (tol. 1 centavo): pagar menos é o que interessa a quem frauda. A conta
      // estava invertida e só recusava quem pagava a MAIS. A loja irmã
      // (AvaliaJá) já tinha sido corrigida.
      const amountCents = Math.round(Number(body.amount));
      if (Number.isFinite(amountCents) && amountCents < order.totalCents - 1) {
        return console.warn(`[webhook] valor suspeito pedido=${order.id} recebido=${amountCents} esperado=${order.totalCents}`);
      }

      // (f) idempotência garantida dentro de markOrderPaid (UPDATE ... WHERE status != 'paid')
      const r = await markOrderPaid(order.id);
      console.log(`[webhook] pedido=${order.id} ${r.already ? 'já estava pago' : 'marcado como PAGO'}`);
    } catch (e) {
      console.error('[webhook] erro ao processar:', e.message);
    }
  })(), 'webhook payshark');
});

export default router;
