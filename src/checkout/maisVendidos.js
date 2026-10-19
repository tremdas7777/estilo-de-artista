// Vitrine "Mais Vendidos" — agora sai do ranking de vendas, não de uma lista
// escrita à mão.
//
// Até 29/09/2026 os nove pares da vitrine eram fixos em collections.js: quem
// vendia muito não subia e quem não vendia nada não saía. O painel
// /admin/ranking já calculava o ranking de verdade a partir dos pedidos pagos,
// mas as duas listas viviam separadas e só o lojista, olhando as duas, podia
// aproximá-las. Este módulo liga uma na outra.
//
// A regra é: o ranking manda; a RESERVA completa o que faltar.
// Com a loja sem venda nenhuma a vitrine é exatamente a que já era — nada de
// "Mais Vendidos" com dois produtos no primeiro dia. Conforme as vendas
// entram, os campeões de verdade empurram a reserva para fora, um a um.
import { topProdutosVendidos, hojeBR } from '../db.js';
import { emSegundoPlano } from '../segundoPlano.js';
import { TIPO_PRECO_UNICO } from './importCsv.js';

export const TITULO = 'Mais Vendidos';
export const SUBTITULO = 'Os pares que mais saem. Escolha o seu antes que acabe.';

// ---------------------------------------------------------------- AJUSTES
// Os quatro números que decidem o comportamento da vitrine. Mudar aqui muda a
// home e a página /colecao/mais-vendidos juntas.

// Quantos pares a vitrine mostra. Nove é o que ela já mostrava.
export const VAGAS = 9;

// Janela do ranking, em dias civis de São Paulo. 90 dias dá uma vitrine
// estável: uma semana fraca de um modelo não o derruba. Baixar para 30 faz a
// home responder mais rápido a uma tendência, ao custo de balançar mais.
export const JANELA_DIAS = 90;

// Piso para entrar na vitrine. Com 1, a primeira venda avulsa de um par
// qualquer já o coloca na frente da loja inteira — e no começo, quando há
// pouca venda, seria quase sempre um acidente liderando a home.
export const MIN_PARES = 2;

// A vitrine fala em "pares" e abre a home junto da promoção de 2 pares, então
// conta só calçado. Para deixar camisa, chinelo e calça disputarem as mesmas
// vagas, troque por `null` — o filtro some e o ranking passa a ser do catálogo
// inteiro (é o mesmo parâmetro do seletor de categoria do /admin/ranking).
export const CATEGORIA = TIPO_PRECO_UNICO;

// ---------------------------------------------------------------- RESERVA
// Os nove pares que a vitrine mostrava antes de ela virar automática. Hoje
// servem de complemento: entram do primeiro ao último, preenchendo as vagas
// que o ranking não tiver ocupado.
//
// Vieram da coleção "mais-vendidos" da PRÓPRIA Drip de Rua, lida do
// products.json público dela em 13/09/2026 — era a única medida de venda que
// existia para este catálogo, já que a loja nasceu sem venda nenhuma.
//
// O CONJUNTO é o da Drip; a ORDEM é nossa. Lá eles vêm em pares (dois Puma,
// dois Tesla, dois Puma, três Hocks) e, em fileira, dois iguais seguidos leem
// como "só tem isso". Tesla Coil e Hocks Bold na frente (pedido do dono,
// 14/09/2026: são o foco da loja); os Puma ficam para o fim.
//
// Handle que sumir do catálogo é ignorado sozinho.
export const RESERVA = [
  'tesla-coil-pro-preto-refletivo',            // Tesla Coil Pro Preto Refletivo
  'hocks-bold-ciel-uv',                        // Hocks Bold Ciel UV
  'tesla-coil-pro-white-blue',                 // Tesla Coil Pro White Blue
  'hocks-bold-petitpoa',                       // Hocks Bold (petitpoa)
  'puma-caven-2-0-ferrari-1',                  // Puma Caven 2.0 Ferrari
  'hocks-bold-sombras',                        // Hocks Bold Sombras
  'puma-ca-pro-amg-motorsport-branco-verde',   // Puma CA Pro AMG MotorSport Branco/Verde
  'puma-caven-1-ferrari-preto',                // Puma Caven 1 Ferrari Preto
  'puma-ca-pro-amg-mercedes',                  // Puma CA Pro AMG Mercedes
];

// Meia-noite de São Paulo do primeiro dia da janela, em epoch ms — que é como
// `paid_at` está gravado. Mesma conta do filtro de período do /admin/ranking:
// "90 dias" é hoje mais os 89 anteriores, não uma janela de 2160 horas que
// termina no meio de ontem.
function inicioDaJanela(dias) {
  if (!dias) return null;
  const d = new Date(`${hojeBR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return Date.parse(`${d.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

// A home é a página mais visitada da loja e lê esta lista a cada acesso. A
// consulta é barata, mas não precisa rodar por visitante: um minuto de memória
// é invisível para o lojista (a venda aparece na vitrine no minuto seguinte) e
// tira o banco do caminho crítico da primeira tela.
const VALIDADE_MS = 60_000;
let cache = null;

// Zera a memória — o /admin chama depois de reimportar o catálogo, senão a
// vitrine passaria até um minuto apontando para handles que não existem mais.
export function esquecerMaisVendidos() { cache = null; }

// Monta a lista final: ranking primeiro, reserva completando. Nunca devolve
// lista vazia enquanto a RESERVA tiver handle válido, e nunca repete o mesmo
// par duas vezes.
function montar(doRanking) {
  const handles = [];
  for (const h of [...doRanking, ...RESERVA]) {
    if (handles.length >= VAGAS) break;
    if (!handles.includes(h)) handles.push(h);
  }
  return handles;
}

// Recalcula e guarda. Nunca lança: quem depende disto é a home.
//
// Por que existe separado da função de leitura: o ranking agora vem do Postgres
// e a consulta é assíncrona, mas quem lê a vitrine é um getter dentro de
// `collections.js`, consumido no meio da montagem SÍNCRONA das páginas.
// Tornar a leitura assíncrona obrigaria a reescrever as views inteiras — a
// mesma razão pela qual `getSetting` continua síncrona no db.js. Então a
// leitura entrega o que está em memória e a atualização acontece por fora.
let atualizando = null;
function atualizar() {
  if (atualizando) return atualizando;
  atualizando = (async () => {
    try {
      // Pede mais do que cabe: o piso de MIN_PARES e os produtos que saíram do
      // catálogo cortam linhas, e sem folga a vitrine encolheria à toa.
      const linhas = await topProdutosVendidos({
        desde: inicioDaJanela(JANELA_DIAS), tipo: CATEGORIA, limit: VAGAS * 3,
      });
      // `noCatalogo` é o produto que ainda existe na loja. O que saiu do CSV
      // continua no histórico do ranking — mas não dá pra vender de novo, e a
      // vitrine é para comprar.
      const doRanking = linhas
        .filter((r) => r.noCatalogo && r.handle && r.pares >= MIN_PARES)
        .map((r) => r.handle);
      cache = { handles: montar(doRanking), ate: Date.now() + VALIDADE_MS };
    } catch (e) {
      // Vitrine com a reserva é um problema pequeno; home fora do ar é um
      // problema grande. Se o banco tropeçar, cai na reserva e segue — com
      // validade curta, para a próxima visita tentar de novo em vez de ficar
      // um minuto inteiro presa na reserva por um tropeço de rede.
      console.error('[mais-vendidos] ranking indisponível, usando a reserva:', e.message);
      cache = { handles: montar([]), ate: Date.now() + 10_000 };
    } finally {
      atualizando = null;
    }
  })();
  return atualizando;
}

// Os handles da vitrine. Síncrona de propósito (ver o comentário de `atualizar`).
//
// Com a memória vazia ou vencida, dispara a atualização e entrega o que tem
// agora: a lista anterior, ou a RESERVA na primeiríssima visita de uma
// instância nova. É o mesmo acordo que o cache de um minuto já fazia — a venda
// aparece na vitrine na visita seguinte, não nesta.
export function handlesMaisVendidos() {
  if (!cache || Date.now() >= cache.ate) emSegundoPlano(atualizar(), 'mais vendidos');
  return cache ? cache.handles : montar([]);
}

// Aquece a lista sem ninguém esperando. O app.js chama uma vez por instância,
// junto do abastecimento do catálogo, para a primeira visita já pegar o ranking
// de verdade em vez da reserva.
export const aquecerMaisVendidos = () => atualizar();

export default {
  handlesMaisVendidos, esquecerMaisVendidos, aquecerMaisVendidos, RESERVA, TITULO, SUBTITULO,
};
