import { getOrder, markPaid, setShopifyOrderId, setTrackingCode } from '../db.js';
import { confirmShopifyPaid } from './orders.js';
import { sendPurchase } from '../facebook/capi.js';
import { sendOrder as sendUtmifyOrder } from '../utmify/client.js';
import { notificarPedidoPago } from './push.js';
import { criarRastreio } from '../rastreio/client.js';

import { emSegundoPlano } from '../segundoPlano.js';

// Processa a confirmação de pagamento de forma IDEMPOTENTE.
// Usado pelo webhook do PayShark, pela rota de simulação em dev e pelo /admin.
// Retorna { ok, already } — already=true quando já estava pago (não reprocessa).
export async function markOrderPaid(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, reason: 'not_found' };

  const firstTime = await markPaid(orderId); // UPDATE ... WHERE status != 'paid'
  if (!firstTime) return { ok: true, already: true };

  const paid = await getOrder(orderId); // agora status='paid', paidAt setado

  // Shopify: pending -> paid (ou cria já pago no fallback). Não deixa quebrar o fluxo.
  try {
    const shopifyId = await confirmShopifyPaid(paid);
    if (shopifyId && !paid.shopifyOrderId) {
      await setShopifyOrderId(orderId, shopifyId);
      paid.shopifyOrderId = shopifyId;
    }
  } catch (e) {
    console.error('[payment] Shopify paid falhou (pedido segue pago localmente):', e.message);
  }

  // Os quatro avisos abaixo (Pixel, UTMify, push, e-mail) seguem disparados SEM
  // `await`: quem espera a resposta é o gateway, e ele não tem que pagar o tempo
  // de um SMTP lento. Mas cada um passa pelo `emSegundoPlano`, e isso é
  // obrigatório na Vercel.
  //
  // Por que não bastava o `emSegundoPlano` do webhook: ele embrulha a chamada a
  // markOrderPaid, e essa promessa resolve quando ESTA função retorna — o
  // `waitUntil` dá o trabalho por encerrado aí, sem saber das quatro promessas
  // que ficaram soltas. Na Vercel a instância pode ser congelada nessa janela, e
  // o aviso morre no meio: o pedido fica pago no banco e a venda nunca chega na
  // UTMify nem no Pixel. No Render isso nunca aparecia, porque lá o processo
  // seguia vivo depois da resposta.
  //
  // É uma corrida, então falhava de forma intermitente — o pior tipo de falha
  // para diagnosticar: sem erro e sem log, só a venda faltando no painel.

  // Facebook Purchase server-side (event_id = orderId, dedup com o browser).
  emSegundoPlano(
    sendPurchase(paid).catch((e) => console.error('[payment] CAPI falhou:', e.message)),
    'payment CAPI');

  // UTMify: venda aprovada, com a campanha que veio guardada no pedido.
  // Só aqui dentro do markPaid idempotente, para não lançar a mesma venda
  // duas vezes se o gateway repetir o webhook.
  emSegundoPlano(
    sendUtmifyOrder(paid, 'paid').catch((e) => console.error('[payment] UTMify falhou:', e.message)),
    'payment UTMify');

  // Notificação no celular do dono. Dentro do markPaid idempotente, então o
  // gateway pode repetir o webhook à vontade que o celular só apita uma vez.
  // Sem await: o gateway espera a resposta do webhook, e não é ele quem deve
  // pagar o tempo de falar com o servidor de push.
  emSegundoPlano(
    notificarPedidoPago(paid).catch((e) => console.error('[payment] push falhou:', e.message)),
    'payment push');

  // Rastreio próprio (RotaSync): cria a encomenda lá e guarda o código no
  // pedido, que é o que o /admin passa a mostrar sozinho.
  //
  // Aqui dentro do markPaid idempotente, como os outros avisos — e com a
  // idempotência dobrada: a `Idempotency-Key` do cliente é derivada do id do
  // pedido, então nem um webhook repetido nem um deploy no meio abrem duas
  // encomendas (conferido contra a API: o 2º envio volta `duplicate: true`
  // com o MESMO código).
  //
  // Grava com setTrackingCode, não com setTracking: este último carimba
  // `shipped_at`, e no momento do pagamento o pacote ainda não saiu — o
  // /admin mostraria todo pedido pago como "Enviado em <data do pagamento>".
  // Quem marca o envio continua sendo o despacho de verdade.
  //
  // Falha aqui não derruba nada: o pagamento já entrou e o pedido fica sem
  // código, com o motivo no log, para lançar pelo /admin.
  emSegundoPlano((async () => {
    const r = await criarRastreio(paid);
    if (!r.ok) {
      return console.error(`[payment] rastreio NÃO criado (pedido=${paid.id}): ${r.motivo}`);
    }
    await setTrackingCode(paid.id, r.codigo, r.url);
    console.log(`[payment] rastreio ${r.duplicado ? 'já existia' : 'criado'} pedido=${paid.id} codigo=${r.codigo}`);
  })().catch((e) => console.error('[payment] rastreio falhou:', e.message)), 'payment rastreio');

  // O e-mail de confirmação NÃO sai daqui desde 06/10/2026, a pedido do dono:
  // o pagamento não dispara mais nada para o cliente. O envio virou decisão de
  // quem opera, no /admin → E-mail (prévia, teste e histórico seguem lá).
  //
  // O disparo foi tirado deste ponto, e não só desligado na configuração, de
  // propósito: a chave `email_pedido_pago` pode estar salva como ligada no
  // banco de produção, e aí inverter só o padrão não pararia o envio. Daqui
  // não sai, independentemente do que esteja gravado.

  return { ok: true, already: false };
}

export default { markOrderPaid };
