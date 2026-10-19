import express, { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import config from '../config.js';
import * as db from '../db.js';
import * as gw from '../gateways.js';

// payment.js e emailEnvio.js entram por import DINÂMICO, não estático. O
// namespace import protege contra export faltando; contra ARQUIVO faltando não
// protege nada — e `emailEnvio.js` só existe na Nation. Um import estático
// dele derrubaria a Zona 3, a Lumeni e A Fonte inteiras no boot, e por um
// e-mail. Assim a regra do módulo continua valendo: função ausente vira
// capacidade `false` e 501 na rota, nunca crash.
let markOrderPaid = null;
try { ({ markOrderPaid } = await import('../checkout/payment.js')); } catch { markOrderPaid = null; }
let enviarAvisoEnvio = null;
try { ({ enviarAvisoEnvio } = await import('../checkout/emailEnvio.js')); } catch { enviarAvisoEnvio = null; }

// API de leitura e escrita para a Central de Lojas — o painel único que
// enxerga (e agora opera) todas as lojas de uma vez. Regras deste arquivo:
//
// - Ele é COLADO byte a byte em todas as lojas (Nation/Knife Lab, Zona 3,
//   Lumeni, A Fonte). Diferença entre lojas se resolve AQUI DENTRO, em tempo
//   de execução (capacidades()) — nunca editando o arquivo numa cópia só,
//   senão ele diverge como o admin.js divergiu entre as lojas. Mudança nasce
//   na Nation e é recolada INTEIRA nas outras; o campo `modulo` do /ping é
//   como a Central denuncia cópia desatualizada.
//
// - Cada chave de `capacidades()` corresponde a uma rota DESTE arquivo, e a
//   rota responde 501 quando a capacidade falta. Não anunciar capacidade sem
//   rota: a Central decide botões pelo /ping, e flag sem endpoint vira botão
//   que cai no 404 global — indistinguível de módulo não colado.
//
// - Sem CENTRAL_TOKEN no ambiente, tudo aqui responde 404 igual a rota
//   inexistente: colar o arquivo numa loja não muda nada até configurar o
//   token daquela loja no Render. Token com MENOS de 32 caracteres conta como
//   ausente (com aviso no log): esta API entrega CPF e endereço de cliente, e
//   nada mais no código impediria alguém de configurar "1234" aqui.
//
// - A autenticação é própria (Bearer + env var) de propósito: não usa
//   ADMIN_PASSWORD (trocar a senha do painel não pode derrubar a Central) e
//   não passa pelo guard do /admin (o Basic de lá morre quando o 2FA liga).
//
// - Nada que sai daqui carrega segredo: pedido vai SEM postback_token (ele
//   autentica o webhook do gateway), e /gateway diz se cada gateway TEM
//   chave, nunca a chave. Se um dia entrar leitura de settings, é por lista
//   fechada de chaves — email_config, 2fa_* e push_vapid guardam segredos.
//
// - Rotas de ESCRITA (POST) respondem 403 até existir CENTRAL_ESCRITA=1 no
//   ambiente DAQUELA loja. Recolar este arquivo em cinco lojas não pode,
//   sozinho, dar a ninguém o poder de trocar gateway ou marcar pedido pago; e
//   como o interruptor é por loja, dá para ligar na de menor movimento
//   primeiro. Leitura continua valendo só com o CENTRAL_TOKEN.
//
// - Escrita reusa o caminho do /admin (setActiveGateway, markOrderPaid,
//   setTracking), nunca UPDATE próprio. Marcar pago não é escrever 'paid' numa
//   coluna: é disparar Shopify, CAPI, UTMify, push e o e-mail do cliente, de
//   forma idempotente. Reimplementar aqui criaria uma segunda verdade sobre o
//   que "pago" significa nesta loja.
const MODULO_VERSAO = '1.1.0';

const router = Router();

// ---- autenticação -----------------------------------------------------

const TOKEN_MIN = 32;
let avisouTokenCurto = false;

// Freio de força bruta, mesmo espírito do freio do /admin (que existe porque
// o painel FOI atacado — e esta loja tem adversário ativo). Em memória por
// processo, como lá: reinício zera a contagem e tudo bem, o ataque continua
// caro. O req.ip é confiável por causa do trust proxy do server.js.
const FALHAS_MAX = 10;
const JANELA_MS = 5 * 60 * 1000;
const falhas = new Map(); // ip -> [timestamps de 401]

function bloqueado(ip) {
  const agora = Date.now();
  // Faxina global antes de crescer sem limite: um scanner de IPs rotativos
  // encheria o Map para sempre — cada entrada some quando a janela passa.
  if (falhas.size > 500) {
    for (const [k, v] of falhas) if (!v.some((t) => agora - t < JANELA_MS)) falhas.delete(k);
  }
  const recentes = (falhas.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  falhas.set(ip, recentes);
  return recentes.length >= FALHAS_MAX;
}

// Hash antes de comparar: timingSafeEqual exige buffers do mesmo tamanho, e
// comparar comprimento antes vazaria pelo tempo o tamanho do token.
const digest = (s) => createHash('sha256').update(String(s)).digest();

router.use((req, res, next) => {
  // Lido a cada request, não no boot: no Render tanto faz (env é fixada por
  // deploy), mas localmente dá pra testar com e sem token sem mexer em nada.
  const esperado = process.env.CENTRAL_TOKEN || '';
  if (!esperado || esperado.length < TOKEN_MIN) {
    if (esperado && !avisouTokenCurto) {
      avisouTokenCurto = true;
      console.warn(`[central] CENTRAL_TOKEN tem menos de ${TOKEN_MIN} caracteres — módulo DESATIVADO até virar um token aleatório longo (ex.: openssl rand -hex 32)`);
    }
    return res.status(404).json({ error: 'not found' });
  }
  if (bloqueado(req.ip)) return res.status(429).json({ error: 'too many attempts' });
  const recebido = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!recebido || !timingSafeEqual(digest(recebido), digest(esperado))) {
    (falhas.get(req.ip) || falhas.set(req.ip, []).get(req.ip)).push(Date.now());
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Corpo JSON das rotas de escrita, depois da autenticação de propósito: quem
// não passou do Bearer não tem por que ter o corpo dele analisado. Se o app da
// loja já monta um express.json global, este aqui não faz nada (o parser vê o
// corpo já lido e sai fora) — está aqui para o módulo não depender do que cada
// server.js resolveu montar.
router.use(express.json({ limit: '8kb' }));

// ---- interruptor de escrita -------------------------------------------

// As rotas de leitura sobem com o deploy; as de ESCRITA ficam mudas (403) até
// alguém ligar CENTRAL_ESCRITA=1 no ambiente DAQUELA loja. É o mesmo
// raciocínio do CENTRAL_TOKEN: recolar este arquivo em cinco lojas não pode,
// sozinho, dar a ninguém o poder de trocar gateway ou marcar pedido pago. E
// como o interruptor é por loja, dá para ligar primeiro na de menor
// movimento, conferir, e só então nas que vendem.
const escritaLigada = () => process.env.CENTRAL_ESCRITA === '1';

const exigeEscrita = (_req, res, next) => (escritaLigada() ? next()
  : res.status(403).json({ error: 'escrita desligada nesta loja', motivo: 'CENTRAL_ESCRITA' }));

// Express 4 não entrega erro de rota async ao tratador do app: vira unhandled
// rejection e a Central fica pendurada sem resposta nenhuma. Melhor devolver o
// erro do que devolver silêncio.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error('[central] falha em', req.method, req.originalUrl, e);
  if (!res.headersSent) res.status(500).json({ error: 'falhou', detalhe: e.message });
});

// Quem pediu a escrita, para o log DESTA loja. A Central tem diário; a loja
// não tinha nada — e quando alguém for conferir por que o gateway mudou às
// 3h da manhã, o rastro precisa existir dos dois lados. É texto vindo de
// fora: entra limpo e curto, ou vira 'central'.
const quem = (req) => String(req.body?.operador || '').trim().slice(0, 40)
  .replace(/[^\p{L}\p{N} ._@-]/gu, '') || 'central';

// ---- capacidades ------------------------------------------------------

// O que ESTA cópia sabe fazer. A Central decide por aqui quais números e
// botões mostrar para a loja — o db.js diverge entre as cópias, e função
// ausente vira `false` aqui e 501 na rota, nunca um crash.
const tem = (fn) => typeof db[fn] === 'function';

// A Zona 3 tem listOrders SEM o parâmetro `dia`: a chave extra morre no
// destructuring e a consulta volta os pedidos mais recentes de qualquer data
// — dado ERRADO em silêncio, que é pior que erro. `typeof` não enxerga
// assinatura, então a sonda é comportamental: pedir 1 pedido de um dia
// impossível. Cópia que filtra devolve []; cópia que ignora a chave devolve o
// pedido mais recente. Banco vazio deixa a sonda inconclusiva — e inofensiva
// (não há o que responder errado) — então não grava o cache nesse caso.
let sabeFiltrarDia = null;
function aceitaDia() {
  if (!tem('listOrders')) return false;
  if (sabeFiltrarDia !== null) return sabeFiltrarDia;
  if (db.listOrders({ limit: 1 }).length === 0) return true;
  sabeFiltrarDia = db.listOrders({ limit: 1, dia: '0001-01-01' }).length === 0;
  return sabeFiltrarDia;
}

function capacidades() {
  return {
    resumo: tem('orderStats'),
    pedidos: tem('listOrders'),
    pedidosPorDia: aceitaDia(),
    detalhePedido: tem('getOrder'),
    faturamento: tem('revenueByDay'),
    gateway: true,
    // Escrita: dizem o que ESTA cópia sabe fazer, não se a escrita está
    // ligada — isso é o campo `escrita` do /ping. Separado de propósito: a
    // Central precisa distinguir "esta loja não sabe" (esconde o botão) de
    // "escrita desligada aqui" (mostra o botão apagado, com o motivo).
    trocarGateway: typeof gw.setActiveGateway === 'function',
    marcarPago: typeof markOrderPaid === 'function',
    rastreio: tem('setTracking') && tem('getOrder'),
    avisarEnvio: typeof enviarAvisoEnvio === 'function',
  };
}
const exige = (fn) => (_req, res, next) =>
  (tem(fn) ? next() : res.status(501).json({ error: `esta loja não tem ${fn}` }));

// Dia de hoje em São Paulo, calculado AQUI e não pelo db.hojeBR: a Zona 3 não
// exporta hojeBR e o /resumo inteiro quebraria por causa de um campo.
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ---- formato dos pedidos ----------------------------------------------

// Pedido como a Central enxerga na LISTA: o suficiente para o feed de vendas.
function pedidoResumo(o) {
  if (!o) return null;
  const c = o.customer || {};
  return {
    id: o.id,
    status: o.status,
    totalCents: o.totalCents,
    cliente: c.name || '',
    email: c.email || '',
    itens: (o.items || []).reduce((n, i) => n + (Number(i.qty) || 1), 0),
    upsellDe: o.upsellDe || '',
    recuperadoDe: o.recuperadoDe || '',
    trackingCode: o.trackingCode || '',
    createdAt: o.createdAt,
    paidAt: o.paidAt,
  };
}

// No DETALHE vai quase tudo (a equipe precisa de endereço e CPF para tratar
// envio, como no /admin da loja). Fora: postbackToken (segredo do webhook),
// fb/visitSid (rastreamento interno) e pixCode (ninguém paga pela Central).
function pedidoDetalhe(o) {
  if (!o) return null;
  const { postbackToken, fb, visitSid, pixCode, ...resto } = o;
  return resto;
}

// ---- rotas ------------------------------------------------------------

router.get('/ping', (_req, res) => {
  res.json({
    ok: true,
    loja: config.lojaNome || process.env.LOJA_NOME || '',
    modulo: MODULO_VERSAO,
    commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || undefined,
    uptime: Math.round(process.uptime()),
    capacidades: capacidades(),
    // Fora de `capacidades` porque não é uma rota, é o estado do interruptor
    // desta loja. A Central usa os dois juntos para decidir entre esconder o
    // botão e mostrá-lo apagado com o motivo.
    escrita: escritaLigada(),
  });
});

// Um card da Central em uma chamada: totais, o dia de hoje e o gateway ativo.
router.get('/resumo', exige('orderStats'), (_req, res) => {
  const ativo = gw.activeGatewayId();
  res.json({
    loja: config.lojaNome || process.env.LOJA_NOME || '',
    hoje: hojeSP(),
    stats: db.orderStats(),
    gateway: {
      id: ativo,
      nome: gw.GATEWAYS[ativo]?.name || ativo,
      temChave: !!gw.GATEWAYS[ativo]?.hasKey(),
    },
  });
});

// Teto baixo de propósito: o processo único desta loja também serve o
// checkout e os webhooks — a Central pagina, não aspira o banco.
const LIMITE_MAX = 200;

router.get('/pedidos', exige('listOrders'), (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), LIMITE_MAX);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = ['paid', 'pending'].includes(req.query.status) ? req.query.status : null;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || '')) ? req.query.dia : null;
  // Melhor recusar do que responder errado: numa cópia cujo listOrders não
  // filtra por dia, aceitar ?dia devolveria pedidos de qualquer data com cara
  // de "pedidos do dia".
  if (dia && !aceitaDia()) {
    return res.status(501).json({ error: 'esta loja não filtra pedidos por dia' });
  }
  res.json({
    // Contrato herdado do db.listOrders, explícito porque a UI do /admin
    // explica isso com rótulos e uma API não tem onde explicar: com `dia`,
    // sem status (ou status=paid) vêm SÓ os pagos, pelo dia do PAGAMENTO;
    // status=pending vem só os pendentes, pelo dia de CRIAÇÃO do PIX.
    recorte: dia ? (status === 'pending' ? 'pending' : 'paid') : (status || 'todos'),
    pedidos: db.listOrders({ limit, offset, status, dia }).map(pedidoResumo),
  });
});

router.get('/pedidos/:id', exige('getOrder'), (req, res) => {
  const pedido = db.getOrder(String(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'pedido não encontrado' });
  res.json({ pedido: pedidoDetalhe(pedido) });
});

router.get('/faturamento', exige('revenueByDay'), (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 366);
  res.json({ dias: db.revenueByDay({ limit }) });
});

router.get('/gateway', (_req, res) => {
  res.json({
    ativo: gw.activeGatewayId(),
    gateways: Object.values(gw.GATEWAYS).map((g) => ({
      id: g.id,
      nome: g.name,
      temChave: !!g.hasKey(),
    })),
  });
});

// ---- escrita ----------------------------------------------------------
//
// Tudo aqui reusa o caminho de código do /admin (setActiveGateway,
// markOrderPaid, setTracking) em vez de fazer UPDATE próprio. Marcar pago não
// é escrever 'paid' numa coluna: é disparar Shopify, CAPI, UTMify, push e o
// e-mail do cliente. Reimplementar isso aqui criaria uma segunda verdade sobre
// o que "pago" significa nesta loja.

router.post('/gateway', exigeEscrita, rota((req, res) => {
  if (typeof gw.setActiveGateway !== 'function') {
    return res.status(501).json({ error: 'esta loja não troca gateway' });
  }
  const id = String(req.body?.gateway || '').trim();
  const alvo = gw.GATEWAYS[id];
  if (!alvo) {
    return res.status(400).json({ error: 'gateway desconhecido', gateways: Object.keys(gw.GATEWAYS) });
  }
  const anterior = gw.activeGatewayId();
  // Gateway sem chave aceita a troca e QUEBRA o checkout: cada PIX passa a
  // falhar na hora de cobrar e ninguém percebe até as vendas pararem. Aqui
  // isso é 409. O /admin deixa passar porque quem está lá vê o resto da tela;
  // a Central manda de longe, às vezes do celular, sobre a loja errada.
  if (!alvo.hasKey?.() && req.body?.forcar !== true) {
    return res.status(409).json({
      error: 'gateway sem chave configurada nesta loja',
      motivo: 'sem_chave',
      id,
      dica: 'mande forcar:true para trocar assim mesmo',
    });
  }
  try {
    gw.setActiveGateway(id);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  console.log(`[central] gateway ativo: ${anterior} -> ${id} (por ${quem(req)})`);
  res.json({ ok: true, anterior, ativo: id, nome: alvo.name || id, temChave: !!alvo.hasKey?.() });
}));

router.post('/pedidos/:id/pago', exigeEscrita, rota(async (req, res) => {
  if (typeof markOrderPaid !== 'function') {
    return res.status(501).json({ error: 'esta loja não marca pago' });
  }
  const id = String(req.params.id);
  // markOrderPaid é idempotente: repetir devolve already=true e NÃO reprocessa
  // Shopify, pixel, e-mail nem push. É por isso que ele é o caminho certo —
  // um UPDATE aqui mandaria a mesma venda duas vezes pro relatório de anúncio.
  const r = await markOrderPaid(id);
  if (!r?.ok) return res.status(404).json({ error: 'pedido não encontrado' });
  console.log(`[central] pedido ${id} marcado pago (por ${quem(req)})${r.already ? ' — já estava' : ''}`);
  res.json({
    ok: true,
    jaEstava: !!r.already,
    pedido: tem('getOrder') ? pedidoResumo(db.getOrder(id)) : null,
  });
}));

router.post('/pedidos/:id/rastreio', exigeEscrita, rota(async (req, res) => {
  if (!tem('setTracking') || !tem('getOrder')) {
    return res.status(501).json({ error: 'esta loja não tem rastreio' });
  }
  const id = String(req.params.id);
  const antes = db.getOrder(id);
  if (!antes) return res.status(404).json({ error: 'pedido não encontrado' });

  const apagar = req.body?.apagar === true;
  const codigo = String(req.body?.codigo || '').trim().slice(0, 64);
  // Código vazio APAGA o rastreio no db.setTracking. Vindo da Central isso
  // precisa ser pedido de propósito: um campo que chegou vazio por engano não
  // pode desfazer o envio de um pedido que já saiu.
  if (!apagar && codigo.length < 3) {
    return res.status(400).json({
      error: 'código de rastreio muito curto',
      dica: 'mande apagar:true para remover o código',
    });
  }
  const anterior = String(antes.trackingCode || '').trim();
  const novo = apagar ? '' : codigo;
  const mudou = novo !== anterior;
  db.setTracking(id, novo);
  console.log(`[central] rastreio do pedido ${id}: ${anterior || '(vazio)'} -> ${novo || '(vazio)'} (por ${quem(req)})`);

  // Aviso de envio: só quando o código MUDA, e só onde o e-mail existe (hoje,
  // só a Nation). A regra é a mesma do /admin e vale repetir: cliente que
  // recebe dois "seu pedido foi enviado" acha que foram duas encomendas.
  let aviso = null;
  if (req.body?.avisar === true) {
    if (typeof enviarAvisoEnvio !== 'function') aviso = { enviado: false, motivo: 'loja_sem_aviso_de_envio' };
    else if (!novo || !mudou) aviso = { enviado: false, motivo: 'codigo_nao_mudou' };
    else {
      // Relê o pedido: o e-mail sai com o código já salvo e com o shippedAt
      // que o setTracking acabou de carimbar.
      const r = await enviarAvisoEnvio(db.getOrder(id));
      aviso = { enviado: !!r?.ok, motivo: r?.ok ? undefined : (r?.motivo || 'falhou') };
      console.log(`[central] aviso de envio (pedido=${id}): ${aviso.enviado ? 'enviado' : aviso.motivo}`);
    }
  }
  res.json({ ok: true, codigo: novo, mudou, aviso });
}));

export default router;
