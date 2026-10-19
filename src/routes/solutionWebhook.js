import { Router } from 'express';
import { getOrderByPostbackToken } from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { getTransaction } from '../solution/client.js';
import { emSegundoPlano } from '../segundoPlano.js';

const router = Router();

// POST /webhooks/solution?token=<postbackToken>
// Payload Solution: { event:"TRANSACTION_PAID", id, idtransaction, status,
//   transaction:{ id, amount } }
//
// O postback da Solution NÃO TEM ASSINATURA. As defesas são duas:
//  1. o `?token=` da URL, 24 bytes aleatórios por pedido, que só a Solution
//     recebe (vai no postbackUrl da cobrança);
//  2. a CONSULTA à API dela (GET /v1/transaction.php) com a nossa chave: o
//     pedido só vira pago se a própria Solution disser que a transação que NÓS
//     criamos está `paid`. O corpo do postback vira só um aviso de "vai olhar".
//
// A resposta 200 sai depois da consulta (a doc pede 200 em até 5s; a consulta
// tem teto de 3,5s) e antes do markOrderPaid, que fala com Shopify/CAPI.
//
// O `emSegundoPlano` é obrigatório na Vercel: o 200 sai no meio do bloco (o
// `ok()` da linha da consulta), e daí em diante a instância pode ser congelada
// — a Solution recebe o 200 e o markOrderPaid morre sem marcar o pedido. Aqui
// o `waitUntil` é registrado ANTES de a resposta sair. Ver segundoPlano.js.
router.post('/webhooks/solution', (req, res) => {
  const ok = () => { if (!res.headersSent) res.status(200).json({ received: true }); };

  emSegundoPlano((async () => {
    try {
      const token = String(req.query.token || '');
      const body = req.body || {};
      const tx = body.transaction || {};

      // (a) token tem que casar com um pedido
      const order = await getOrderByPostbackToken(token);
      if (!order) {
        ok();
        return console.warn('[webhook solution] token sem pedido correspondente');
      }

      // (b) só interessa o evento/status de pago (o mesmo endereço recebe
      // pendente, estorno, disputa e saque)
      const event = String(body.event || '');
      const status = String(body.status || tx.status || '').toLowerCase();
      const avisoDePago = event === 'TRANSACTION_PAID' || ['paid', 'approved'].includes(status);
      if (!avisoDePago) {
        ok();
        return console.log(`[webhook solution] ignorado event=${event || '?'} status=${status || '?'} pedido=${order.id}`);
      }

      // (c) confirma na API, pela transação vinculada ao pedido na criação
      const real = await getTransaction(order.transactionId);
      ok();

      if (real.ok) {
        if (real.status !== 'paid') {
          return console.warn(`[webhook solution] postback diz pago, mas a API diz "${real.status}" — descartado pedido=${order.id}`);
        }
        if (Number.isFinite(real.amountCents) && real.amountCents < order.totalCents - 1) {
          return console.warn(`[webhook solution] valor abaixo do esperado pedido=${order.id} recebido=${real.amountCents} esperado=${order.totalCents}`);
        }
      } else {
        // Consulta fora do ar ou em formato inesperado: cai nas conferências do
        // corpo, que eram as únicas até 29/09/2026. Ainda exige o token secreto —
        // é melhor do que deixar cliente que pagou com o pedido pendente.
        console.warn(`[webhook solution] consulta à API falhou (${real.motivo}) — conferindo pelo corpo pedido=${order.id}`);

        // id da transação: a doc chama de `id` o número interno e de
        // `transaction.id` o txId; basta um dos dois casar com o vinculado.
        const ids = [tx.id, body.id, body.idtransaction].filter((v) => v != null).map(String);
        if (order.transactionId && ids.length && !ids.includes(String(order.transactionId))) {
          return console.warn(`[webhook solution] id divergente pedido=${order.id}`);
        }

        // valor: a doc diz que no postback vem "em reais", sem exemplo completo.
        // Testa as duas leituras e só rejeita se AMBAS ficarem abaixo do pedido.
        const raw = Number(tx.amount ?? body.amount);
        if (Number.isFinite(raw) && raw > 0) {
          const maior = Math.max(Math.round(raw * 100), Math.round(raw));
          if (maior < order.totalCents - 1) {
            return console.warn(`[webhook solution] valor abaixo do esperado pedido=${order.id} recebido=${raw} esperado=${order.totalCents}`);
          }
        }
      }

      // (d) idempotência garantida dentro de markOrderPaid
      const r = await markOrderPaid(order.id);
      console.log(`[webhook solution] pedido=${order.id} ${r.already ? 'já estava pago' : 'marcado como PAGO'}${real.ok ? ' (confirmado na API)' : ''}`);
    } catch (e) {
      ok();
      console.error('[webhook solution] erro ao processar:', e.message);
    }
  })(), 'webhook solution');
});

export default router;
