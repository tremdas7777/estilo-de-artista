// Recuperação de PIX abandonado: quem gerou o PIX e não pagou recebe um e-mail
// com um link que devolve o pedido dele por um preço menor.
//
// É o espelho da oferta pós-compra (upsell.js) com a condição INVERTIDA: lá o
// preço é o prêmio de ter pago, aqui ele existe justamente porque a pessoa não
// pagou. O que muda em relação ao upsell está anotado onde muda.
import crypto from 'node:crypto';
import {
  getOrder, temRecuperacaoPaga, marcarRecuperacaoEnviada, pedidosAbandonados, emailsJaRecuperados,
} from '../db.js';
import { loadCatalog } from './products.js';
import { emailValido } from './email.js';
import { TIPO_PRECO_UNICO } from './importCsv.js';

const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);

export const RECUPERACAO = {
  ativo: process.env.RECUPERACAO_ATIVA !== '0',
  // Escada de preço: o primeiro par por um valor, cada par seguinte por outro
  // menor. 1 = R$ 79, 2 = R$ 129, 3 = R$ 179, e assim por diante.
  //
  // Dois números em vez de uma tabela ("1 por 79, 2 por 129") porque a tabela
  // precisa de uma linha nova a cada quantidade e não diz o que fazer com 3.
  // A escada não tem teto e o cliente entende sozinho: leve outro por R$ 50.
  primeiroCents: Math.round(num(process.env.RECUPERACAO_PRIMEIRO_CENTS, 7900)),
  adicionalCents: Math.round(num(process.env.RECUPERACAO_ADICIONAL_CENTS, 5000)),
  // Contada A PARTIR DO DISPARO do e-mail, nunca da criação do pedido — ver
  // `abrirRecuperacao`. 48h pega dois fins de tarde, que é quando a pessoa
  // abre e-mail de loja.
  janelaMs: Math.round(num(process.env.RECUPERACAO_JANELA_H, 48) * 3_600_000),
  // Mesmo recorte do upsell: só o Type de preço único entra na escada. Óculos
  // e chinelos custam menos que R$ 79 — entrariam como AUMENTO de preço.
  tipo: process.env.RECUPERACAO_TIPO || TIPO_PRECO_UNICO,
  maxItens: Math.round(num(process.env.RECUPERACAO_MAX_ITENS, 10)),
  // Idade máxima do abandono para ENTRAR num disparo. Nada a ver com a janela
  // acima: aquela é quanto tempo a oferta dura depois de enviada, esta é quão
  // fundo o disparo pesca.
  //
  // Existe porque o carimbo é a única porta da oferta, e sem limite um disparo
  // com o período em branco carimbaria todo pendente que a loja já teve. Isso
  // é e-mail promocional pra quem abandonou meses atrás: queima o domínio em
  // spam, e o endereço guardado — que é o que faz a oferta ser um clique — já
  // tem chance real de estar vencido.
  idadeMaxMs: Math.round(num(process.env.RECUPERACAO_IDADE_MAX_DIAS, 30)) * 86_400_000,
};

// O instante a partir do qual um pedido ainda é novo o bastante pra ser
// recuperado. A tela do disparo usa isto pra abrir já no período certo, em vez
// do "todo o histórico" que o filtro de e-mail assume quando as datas vêm
// vazias.
export const corteDeIdade = () => Date.now() - RECUPERACAO.idadeMaxMs;

// Token do link, derivado do `postbackToken` do pedido pendente.
//
// Os motivos são os mesmos do upsell — derivado em vez de coluna nova, e por
// HMAC porque o link vai parar na caixa de e-mail e no histórico do navegador,
// e de mão única ninguém remonta com ele o token que autentica os webhooks.
//
// O rótulo é `recuperar:`, e não `upsell:`, de propósito: com o mesmo rótulo o
// link de recuperação abriria a oferta pós-compra e vice-versa, e as duas têm
// preço e regra de acesso diferentes.
export function recuperacaoToken(order) {
  return crypto.createHmac('sha256', String(order.postbackToken || ''))
    .update(`recuperar:${order.id}`).digest('hex').slice(0, 24);
}

const tokenConfere = (recebido, esperado) => {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// O relógio corre do DISPARO do e-mail, não do `createdAt`.
//
// Se corresse da criação, um pedido abandonado há 20 dias nasceria expirado e
// o e-mail chegaria com link morto — justamente no caso que o disparo existe
// pra atacar. Contando daqui, todo mundo recebe a mesma janela, e o cronômetro
// da tela passa a ser verdade: o /admin já cobra isso ("oferta com prazo
// inexistente é publicidade enganosa").
export const restanteMs = (order) =>
  Math.max(0, (Number(order.recuperacaoEm) || 0) + RECUPERACAO.janelaMs - Date.now());

// Porta de entrada: devolve `{ order, restanteMs }` ou `{ erro }`. Todo caminho
// que serve a recuperação (página, catálogo e criação do pedido novo) passa por
// aqui — é o único lugar que decide quem compra por este preço.
export async function abrirRecuperacao(orderId, token) {
  if (!RECUPERACAO.ativo) return { erro: 'Oferta indisponível no momento.' };
  const order = await getOrder(String(orderId || ''));
  if (!order) return { erro: 'Pedido não encontrado.' };
  // Invertido em relação ao upsell. Se a pessoa pagou o PIX antigo entre o
  // disparo e o clique, a oferta some: senão a loja venderia a R$ 79 pra quem
  // acabou de depositar R$ 99, e sobrariam dois pedidos iguais pra desfazer.
  if (order.status === 'paid') return { erro: 'Este pedido já foi pago — não precisa fazer nada.' };
  if (!tokenConfere(token, recuperacaoToken(order))) return { erro: 'Link inválido.' };
  // Só pedido que RECEBEU o e-mail tem oferta. Sem esta trava todo pendente do
  // histórico teria link válido pra sempre — e como o token é derivado de dado
  // que já está gravado, ninguém precisaria nem passar pelo disparo.
  if (!order.recuperacaoEm) return { erro: 'Esta oferta não está disponível para este pedido.' };
  if (restanteMs(order) <= 0) return { erro: 'Esta oferta expirou.' };
  // Reabrir a página antes de pagar é normal (perdeu o QR, trocou de celular).
  // O que não pode é comprar duas vezes pelo mesmo link: cada compra é uma
  // caixa a mais pra enviar, e o e-mail promete uma oferta, não um preço novo.
  if (await temRecuperacaoPaga(order.id)) return { erro: 'Você já aproveitou esta oferta.' };
  return { order, restanteMs: restanteMs(order) };
}

// Carimba o pedido como "e-mail de recuperação enviado" e devolve true se o
// carimbo pegou. É o único caminho que o disparo deve usar: ele é quem aplica o
// corte de idade, e o carimbo é o que destrava o link.
//
// Devolver false não é erro — é o pedido tendo sido pago ou sendo velho demais,
// e nos dois casos a resposta certa é não mandar o e-mail.
export function carimbarDisparo(order) {
  const id = typeof order === 'string' ? order : order?.id;
  // Devolve a promessa do banco: quem chama precisa de `await` para saber se o
  // carimbo pegou ANTES de mandar o e-mail.
  return marcarRecuperacaoEnviada(id, { corte: corteDeIdade() });
}

// Link completo, do jeito que vai no botão do e-mail.
export const recuperacaoHref = (order) =>
  `/recuperar/${encodeURIComponent(order.id)}?t=${recuperacaoToken(order)}`;

// ---------------------------------------------------------------- PREÇO
// Quanto custam N pares na escada. FONTE DA VERDADE do total — a tela espelha
// esta conta só pra exibir, e o backend cobra por ela.
export function totalDaEscada(pares) {
  const n = Math.max(0, Math.floor(pares));
  if (!n) return 0;
  return RECUPERACAO.primeiroCents + (n - 1) * RECUPERACAO.adicionalCents;
}

// A escada vira "preço cheio por item + desconto", e não preço diferente em
// cada linha, porque é assim que o resto do checkout já trabalha: os order
// bumps lançam a diferença no desconto pelo mesmo motivo. Cada par aparece por
// R$ 79 e a economia dos pares seguintes vai junta no desconto — o total bate,
// e a nota fiscal não fica com dois preços pro mesmo produto.
export function descontoDaEscada(pares) {
  const n = Math.max(0, Math.floor(pares));
  if (n < 2) return 0;
  return n * RECUPERACAO.primeiroCents - totalDaEscada(n);
}

// Os produtos que entram na escada.
export async function produtosDaRecuperacao() {
  const { products } = await loadCatalog();
  return products.filter((p) => {
    // Peneira 1: a categoria. Óculos e chinelos não entram na escada.
    if ((p.type || TIPO_PRECO_UNICO) !== RECUPERACAO.tipo) return false;
    // Peneira 2: a promoção não pode AUMENTAR preço.
    //
    // Sozinha, a peneira de cima depende do Type estar preenchido — e o
    // fallback `|| TIPO_PRECO_UNICO` trata Type vazio como tênis. Um produto
    // barato cadastrado sem Type entraria na oferta e sairia por R$ 79, que é
    // mais caro do que ele custa. Aqui o preço de catálogo desempata: item que
    // já custa igual ou menos que a oferta simplesmente não é oferta.
    //
    // Esta é a peneira que não depende de ninguém lembrar de preencher campo.
    const menor = Math.min(...(p.variants || []).map((v) => v.priceCents || 0).filter((c) => c > 0));
    return Number.isFinite(menor) && menor > RECUPERACAO.primeiroCents;
  });
}

// Preço de recuperação de uma variante — a única fonte de verdade da cobrança.
// Devolve null pra item fora da promoção, e é isso que impede alguém de mandar
// o id de um Juliet e levá-lo por R$ 79.
export async function precoDaRecuperacao(variantId) {
  const elegiveis = await produtosDaRecuperacao();
  for (const p of elegiveis) {
    for (const v of p.variants || []) {
      if (String(v.id) === String(variantId)) {
        return { variant: v, product: p, precoCents: RECUPERACAO.primeiroCents };
      }
    }
  }
  return null;
}

// --------------------------------------------------------------- MONTAGEM
// Índice variante -> produto entre os elegíveis. Uma passada no catálogo em
// vez de uma busca por item: a montagem roda a cada carregamento da página.
async function indiceElegiveis() {
  const m = new Map();
  for (const p of await produtosDaRecuperacao()) {
    for (const v of p.variants || []) m.set(String(v.id), { v, p });
  }
  return m;
}

// Quantos pares do pedido abandonado entram na escada. O disparo usa isto pra
// não mandar e-mail de promoção pra quem abandonou só um óculos: o preço não
// muda, e a oferta chegaria vazia.
export async function paresElegiveis(order) {
  const idx = await indiceElegiveis();
  return (order.items || []).reduce(
    (n, it) => n + (idx.has(String(it.variantId)) ? (it.qty || 0) : 0), 0);
}

// Quem entra no disparo, já peneirado e sem repetir gente.
//
// Três peneiras que a consulta do banco não sabe fazer:
//  • e-mail válido — pedido sem e-mail não tem como receber a oferta;
//  • pelo menos um par elegível — pedido só de óculos não muda de preço, e a
//    oferta chegaria prometendo um desconto que a página não daria;
//  • uma pessoa, uma oferta — quem abandonou três vezes recebe UMA oferta, a do
//    pedido mais recente. Três e-mails iguais no mesmo dia é denúncia de spam,
//    não três chances de venda.
//
// A terceira peneira começa com quem JÁ recebeu oferta na janela, não com um
// conjunto vazio. Sem isso ela só valia dentro de um disparo: no disparo
// seguinte o segundo pedido da mesma pessoa aparecia como candidato novo,
// porque a trava do banco olha o pedido carimbado e este pedido não era aquele.
//
// O índice do catálogo é montado UMA vez e passado adiante: `paresElegiveis`
// recarregaria o catálogo inteiro a cada pedido da lista.
export async function candidatosParaDisparo({ ate = Infinity, limit = 500 } = {}) {
  const idx = await indiceElegiveis();
  const vistos = await emailsJaRecuperados(corteDeIdade());
  const lista = [];
  for (const o of await pedidosAbandonados({ corte: corteDeIdade(), ate, limit })) {
    const email = String(o.customer?.email || '').trim().toLowerCase();
    if (!emailValido(email) || vistos.has(email)) continue;
    const pares = (o.items || []).reduce(
      (n, it) => n + (idx.has(String(it.variantId)) ? (it.qty || 0) : 0), 0);
    if (!pares) continue;
    vistos.add(email);
    lista.push({ order: o, email, pares, nome: o.customer?.name || '' });
  }
  return lista;
}

// Monta os itens da recuperação: o pedido abandonado + os pares escolhidos na
// tela. FONTE DA VERDADE do que vai ser cobrado — a tela espelha esta conta.
//
// O que NÃO é tênis passa direto, pelo preço que tinha no pedido abandonado.
// Nem pelo preço de catálogo (que pode ter mudado desde então) nem removido em
// silêncio: a pessoa montou aquele carrinho, e a oferta é sobre os pares.
export async function montarItens(original, extras = []) {
  const idx = await indiceElegiveis();
  const items = [];
  const linhaDe = new Map(); // variantId -> item já na lista, pra somar qty

  for (const it of original.items || []) {
    const elegivel = idx.has(String(it.variantId));
    const linha = {
      ...it,
      // Preço cheio da escada em cada par. A economia dos pares seguintes vai
      // no desconto, não aqui — ver `descontoDaEscada`.
      priceCents: elegivel ? RECUPERACAO.primeiroCents : it.priceCents,
      // De/por da tela sai daqui: é o preço que ESTE cliente ia pagar,
      // não o de catálogo.
      deCents: elegivel ? it.priceCents : null,
      recuperado: elegivel,
    };
    items.push(linha);
    if (elegivel) linhaDe.set(String(it.variantId), linha);
  }

  for (const { variantId, qty } of extras) {
    const hit = idx.get(String(variantId));
    // Id fora da lista é recusado em vez de ignorado: ignorar cobraria um
    // pedido diferente do que a tela mostrou.
    if (!hit) return { erro: 'Este par não está na oferta. Escolha outro.' };
    const q = Math.max(1, Math.min(20, parseInt(qty, 10) || 0));
    const ja = linhaDe.get(String(variantId));
    // Mesmo par escolhido de novo vira quantidade, não linha repetida.
    if (ja) { ja.qty += q; continue; }
    const { v, p } = hit;
    const linha = {
      variantId: String(v.id), qty: q, priceCents: RECUPERACAO.primeiroCents,
      title: v.title, image: v.image || p.image || '',
      productId: String(v.productId || p.id), handle: p.handle || '',
      deCents: v.priceCents > RECUPERACAO.primeiroCents ? v.priceCents : null,
      recuperado: true,
    };
    items.push(linha);
    linhaDe.set(String(v.id), linha);
  }

  const pares = items.reduce((n, it) => n + (it.recuperado ? it.qty : 0), 0);
  if (!pares) return { erro: 'Nenhum par desta oferta no pedido.' };
  if (pares > RECUPERACAO.maxItens) {
    return { erro: `Máximo de ${RECUPERACAO.maxItens} pares nesta oferta.` };
  }

  const subtotalCents = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
  const discountCents = descontoDaEscada(pares);
  // Frete: o que a pessoa escolheu no checkout que abandonou. Rebaixar pra
  // grátis à força pareceria vantagem, mas quem pagou expresso quer expresso.
  const shipping = original.shipping || { id: 'gratis', name: 'Frete Grátis', cents: 0, eta: '' };
  const shippingCents = Number(shipping.cents) || 0;

  return {
    items, pares, subtotalCents, discountCents, shipping, shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
  };
}
export default {
  RECUPERACAO, recuperacaoToken, recuperacaoHref, abrirRecuperacao,
  produtosDaRecuperacao, precoDaRecuperacao, restanteMs,
  totalDaEscada, descontoDaEscada, montarItens, paresElegiveis,
  corteDeIdade, carimbarDisparo, candidatosParaDisparo,
};
