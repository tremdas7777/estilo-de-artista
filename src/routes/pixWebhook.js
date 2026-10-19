import { Router } from 'express';
import { getOrderByPostbackToken, getOrderByTransactionId } from '../db.js';
import { markOrderPaid } from '../checkout/payment.js';
import { getTransaction } from '../pixgate/client.js';
import { emSegundoPlano } from '../segundoPlano.js';

const router = Router();

// POST /webhooks/pixgate?token=<postbackToken>
// Responde 200 IMEDIATO (evita retries do gateway) e processa depois.
//
// O `emSegundoPlano` é obrigatório na Vercel: sem ele a instância pode ser
// congelada no instante em que a resposta sai, e o processamento morre no meio
// — o gateway recebe o 200 e o pedido nunca fica pago. Ver segundoPlano.js.
// Payload PixGate: { event:"transaction.paid", status:"PAID", transaction_id, amount(reais) }
router.post('/webhooks/pixgate', (req, res) => {
  res.status(200).json({ received: true });

  emSegundoPlano((async () => {
    try {
      const token = String(req.query.token || '');
      const body = req.body || {};

      // (a) acha o pedido: token na query e, se ele não vier, o id da transação.
      //
      // O fallback existe porque em 03/10/2026 duas vendas pagas ficaram
      // PENDENTES: o postback da PixGate chegou sem o `?token=`, e o webhook
      // (que só sabia procurar por ele) descartava o pagamento em silêncio —
      // sem e-mail, sem Facebook, sem UTMify, porque os quatro só acontecem
      // dentro do markOrderPaid. Umbrella e Coreon já tinham este plano B.
      //
      // O par token+id continua sendo a defesa: o transaction_id é gerado pela
      // PixGate e guardado por nós na criação da cobrança, então só ela e a
      // loja o conhecem — o fallback só troca QUAL dos dois localiza o pedido,
      // e as conferências de id e de valor abaixo seguem valendo.
      // Mesmas variações de nome do resto do arquivo: este id é o que localiza
      // o pedido quando o `?token=` não vem (foi o que deixou duas vendas
      // pendentes em 03/10), e também a conferência (b). Lido só como
      // `transaction_id`/`id`, um postback aninhado em `data` não casaria com
      // pedido nenhum e a venda sumiria de novo pelo mesmo caminho.
      const dados = body.data && typeof body.data === 'object' ? body.data : {};
      const incomingId = body.transaction_id ?? body.id
        ?? body.transactionId ?? body.idTransacao
        ?? dados.transaction_id ?? dados.id ?? dados.transactionId;
      let order = await getOrderByPostbackToken(token);
      if (!order && incomingId) {
        order = await getOrderByTransactionId(incomingId);
        if (order) console.warn(`[webhook pixgate] postback sem token válido — casado pelo id da transação pedido=${order.id}`);
      }
      if (!order) {
        return console.warn(`[webhook pixgate] sem pedido correspondente (token=${token ? 'presente' : 'ausente'} id=${incomingId || '?'}) payload=${JSON.stringify(body).slice(0, 500)}`);
      }

      // (b) transaction_id tem que casar com o vinculado
      if (order.transactionId && incomingId &&
          String(incomingId) !== String(order.transactionId)) {
        return console.warn(`[webhook pixgate] transaction_id divergente pedido=${order.id}`);
      }

      // (c) só confirma no evento/status de pago.
      //
      // A conferência era `event !== 'transaction.paid' || status !== 'PAID'`:
      // exigia os DOIS campos, com essa grafia exata. Qualquer variação caía
      // fora e o pagamento era descartado em silêncio (responde 200, o gateway
      // não reenvia, o pedido fica pendente sem erro no log de ninguém) —
      // bastava a PixGate mandar `paid` minúsculo, `PAGO`, omitir o `event` ou
      // aninhar em `data` para a venda sumir. A API dela fala português na
      // criação da cobrança (`nome`, `valor`, `descricao`), então o formato
      // inglês do postback nunca foi mais que uma suposição.
      //
      // A lógica foi INVERTIDA: em vez de uma lista do que é "pago" (que tem de
      // adivinhar a grafia e, errando, descarta venda boa em silêncio), descarta
      // só o que a doc da PixGate define como NÃO-pagamento — recusa, estorno,
      // chargeback, disputa e a cobrança ainda pendente. O resto segue para a
      // consulta em (d), que é quem decide de verdade.
      //
      // Essa inversão é o que impede o problema de voltar: um `event` novo ou
      // escrito de outra forma não trava mais a venda, porque quem confirma é a
      // própria PixGate respondendo `paid: true` — não a nossa lista de nomes.
      // Valores da doc: event = transaction.paid | transaction.refused |
      // transaction.chargeback; status = PAID | CANCELLED | DISPUTED | REVERSED.
      const campo = (v) => String(v ?? '').trim().toLowerCase();
      const event = campo(body.event ?? body.evento ?? dados.event ?? dados.evento);
      const status = campo(body.status ?? body.situacao ?? dados.status ?? dados.situacao);

      const NAO_PAGO = [
        'transaction.refused', 'transaction.chargeback', 'transaction.reversed',
        'cancelled', 'canceled', 'cancelado', 'refused', 'recusado', 'refunded',
        'reversed', 'revertido', 'estornado', 'disputed', 'disputa',
        'chargeback', 'pending', 'pendente', 'waiting', 'aguardando', 'expired', 'expirado',
      ];
      if (NAO_PAGO.includes(event) || NAO_PAGO.includes(status)) {
        return console.log(`[webhook pixgate] ignorado (não é pagamento) event=${event || '?'} status=${status || '?'} pedido=${order.id}`);
      }

      // (d) o valor pago não pode ser MENOR que o esperado (tol. 1 centavo):
      // pagar menos é o que interessa a quem frauda. A conta já esteve
      // invertida, recusando só quem pagava a MAIS — um postback de R$ 0,01 num
      // pedido de R$ 179 era aceito. A loja irmã (AvaliaJá) tinha o mesmo erro.
      //
      // O valor NÃO sai mais do corpo do postback, e esta é a correção que fazia
      // todo pedido ficar pendente: o `amount` da PixGate é o valor LÍQUIDO, já
      // descontada a taxa dela ("valor líquido creditado após taxas", na doc
      // oficial). Comparado com o total do pedido, ele é sempre menor — R$ 179
      // com 4,99% chega como 170,07 —, então esta conferência reprovava TODA
      // venda legítima e o cliente pagava para o pedido seguir pendente. O campo
      // tem o mesmo nome do da Coreon e significado diferente: lá é bruto, e o
      // webhook dela até avisa em comentário que conferir pelo líquido
      // reprovaria tudo. Os dois foram tratados igual.
      //
      // Agora o valor vem de `GET /api/stats/:id`, consulta autenticada feita
      // por ESTE servidor, que devolve o `value` da cobrança (bruto) e o
      // booleano `paid`. É mais seguro que antes, não menos: o número deixa de
      // vir do corpo que o atacante controla e passa a vir da PixGate.
      //
      // Se a consulta falhar (API fora, timeout), o pedido NÃO é confirmado às
      // cegas nem descartado: fica pendente para marcar no /admin, e o motivo
      // vai no log. Confirmar sem conferir valor seria aceitar R$ 0,01.
      // O id da consulta: o do postback ou, se ele não vier (pedido achado pelo
      // `?token=`), o que guardamos na criação da cobrança. Sem nenhum dos dois
      // não há o que conferir, e confirmar sem conferir é o que abre a brecha.
      const idConsulta = incomingId || order.transactionId;
      if (!idConsulta) {
        return console.warn(`[webhook pixgate] sem id de transação para conferir pedido=${order.id} — não confirmado, marque no /admin se o pagamento existir`);
      }

      let conferido;
      try {
        conferido = await getTransaction(idConsulta);
      } catch (e) {
        return console.error(`[webhook pixgate] NÃO CONFIRMADO pedido=${order.id}: falha ao consultar a transação na PixGate (${e.message}). Marque no /admin se o pagamento existir.`);
      }

      // A consulta é a fonte da verdade: ela diz se está pago de fato, e não
      // quem mandou o POST. Um postback forjado com status PAID morre aqui.
      if (!conferido.paid) {
        return console.warn(`[webhook pixgate] a PixGate não confirma o pagamento pedido=${order.id} status=${conferido.status || '?'} — descartado`);
      }
      if (conferido.valueCents == null) {
        return console.warn(`[webhook pixgate] consulta sem valor pedido=${order.id} — não confirmado, marque no /admin se o pagamento existir`);
      }
      if (conferido.valueCents < order.totalCents - 1) {
        return console.warn(`[webhook pixgate] valor suspeito pedido=${order.id} cobrado=${conferido.valueCents} esperado=${order.totalCents}`);
      }

      const r = await markOrderPaid(order.id);
      console.log(`[webhook pixgate] pedido=${order.id} ${r.already ? 'já estava pago' : 'marcado como PAGO'}`);
    } catch (e) {
      console.error('[webhook pixgate] erro ao processar:', e.message);
    }
  })(), 'webhook pixgate');
});

export default router;
