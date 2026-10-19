import { query, exec, transacao, rastrear } from './pg.js';

// Camada de banco, agora sobre Postgres (Supabase). A conexão mora em pg.js.
//
// O que mudou em relação ao SQLite, para quem for mexer aqui:
//
// - Quase tudo virou ASSÍNCRONO. Toda função que fala com o banco devolve
//   promessa e quem chama precisa de `await`. Esquecer o await numa LEITURA é
//   bug na hora (o valor vira um objeto Promise); numa GRAVAÇÃO o dado ainda
//   chega — a resposta HTTP espera as gravações em voo (pg.js) —, mas o código
//   seguinte roda antes de ela terminar.
//
// - As duas exceções são `getSetting` e `setSetting`, que continuam síncronas
//   de propósito. As páginas são montadas de forma síncrona e leem
//   personalização, contato e gateway ativo no meio da montagem; torná-las
//   assíncronas exigiria reescrever as views inteiras. As settings ficam numa
//   cópia em memória, conferida com o banco a cada requisição
//   (`atualizarSettings`, chamado pelo app.js).
//
// - Datas continuam epoch em milissegundos (BIGINT) e os JSONs continuam em
//   colunas TEXT, como eram. Foi escolha: assim a migração dos dados do SQLite
//   é cópia linha a linha, sem conversão que possa perder pedido.

const all = async (sql, params) => (await query(sql, params)).rows;
const get = async (sql, params) => (await query(sql, params)).rows[0];
const run = async (sql, params) => (await query(sql, params)).rowCount;

// `@nome` no SQL vira `$1, $2...` na ordem em que aparece. Existe para as
// consultas grandes do painel, onde contar posição na mão é pedir para errar.
function nomeados(sql, obj) {
  const valores = [];
  const indice = new Map();
  const texto = sql.replace(/@([a-zA-Z_]\w*)/g, (_m, nome) => {
    if (!indice.has(nome)) {
      valores.push(obj[nome]);
      indice.set(nome, valores.length);
    }
    return `$${indice.get(nome)}`;
  });
  return [texto, valores];
}

// ------------------------------------------------------------------ ESQUEMA
// Subiu de número? O próximo boot roda o DDL de novo (ele é todo IF NOT
// EXISTS). Coluna nova entra como ALTER TABLE ... ADD COLUMN IF NOT EXISTS no
// fim do bloco, e este número sobe junto.
const ESQUEMA_VERSAO = '2';

// As colunas que no SQLite entravam por ALTER TABLE depois do CREATE já nascem
// aqui dentro: banco novo não tem histórico para remendar.
const DDL = `
  CREATE TABLE IF NOT EXISTS orders (
    id                TEXT PRIMARY KEY,
    postback_token    TEXT UNIQUE NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',
    currency          TEXT NOT NULL DEFAULT 'BRL',
    subtotal_cents    INTEGER NOT NULL,
    discount_cents    INTEGER NOT NULL DEFAULT 0,
    shipping_cents    INTEGER NOT NULL DEFAULT 0,
    total_cents       INTEGER NOT NULL,
    customer_json     TEXT NOT NULL,
    items_json        TEXT NOT NULL,
    shipping_json     TEXT,
    fb_json           TEXT,
    pix_code          TEXT,
    transaction_id    TEXT,
    shopify_order_id  TEXT,
    created_at        BIGINT NOT NULL,
    paid_at           BIGINT,
    -- codigo da transportadora e data do primeiro envio
    tracking_code     TEXT,
    shipped_at        BIGINT,
    -- UTM de campanha (nao confundir com tracking_code)
    tracking_json     TEXT,
    -- id do pedido PAGO que abriu a oferta pos-compra
    upsell_de         TEXT,
    -- instante em que o e-mail de recuperacao saiu para este pedido
    recuperacao_em    BIGINT,
    -- id do pedido abandonado que esta venda recuperou
    recuperado_de     TEXT
  );

  -- O ranking de mais vendidos abre os itens de TODO pedido pago do periodo.
  -- Sem este indice o recorte "ultimos 30 dias" varre a tabela inteira, e ela
  -- so cresce.
  CREATE INDEX IF NOT EXISTS idx_orders_pago   ON orders(status, paid_at);
  CREATE INDEX IF NOT EXISTS idx_orders_criado ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_tx     ON orders(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_orders_upsell ON orders(upsell_de) WHERE upsell_de IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_orders_recup  ON orders(recuperado_de) WHERE recuperado_de IS NOT NULL;

  CREATE TABLE IF NOT EXISTS shopify_tokens (
    shop         TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    scope        TEXT,
    installed_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  );

  -- Quem ABRIU a oferta pos-compra. Uma linha por pedido de origem, nao por
  -- visita: o que interessa e quantas pessoas entraram, e a mesma pessoa
  -- recarregando a pagina nao e gente nova. A coluna aberturas guarda o total
  -- mesmo assim, que e o que separa "olhou e saiu" de "voltou varias vezes".
  CREATE TABLE IF NOT EXISTS upsell_views (
    order_id   TEXT PRIMARY KEY,
    first_at   BIGINT NOT NULL,
    last_at    BIGINT NOT NULL,
    aberturas  INTEGER NOT NULL DEFAULT 1
  );

  -- Catalogo proprio: a loja deixa de depender da Admin API da Shopify.
  -- Alimentado pelo import do CSV (scripts/import-catalogo.mjs).
  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,   -- handle (estavel entre importacoes)
    title       TEXT NOT NULL,
    handle      TEXT NOT NULL,
    body_html   TEXT,
    vendor      TEXT,
    -- Type do CSV. O preco de venda vigente usa isto para saber em quem mandar.
    type        TEXT,
    tags_json   TEXT NOT NULL DEFAULT '[]',
    image       TEXT,
    images_json TEXT NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'active',
    "position"  INTEGER NOT NULL DEFAULT 0,
    updated_at  BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS variants (
    id            TEXT PRIMARY KEY,  -- handle::opcao
    product_id    TEXT NOT NULL,
    "option"      TEXT,
    sku           TEXT,
    price_cents   INTEGER NOT NULL,
    compare_cents INTEGER,
    available     INTEGER NOT NULL DEFAULT 1,
    "position"    INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_products_status  ON products(status, "position");

  -- E-mails disparados pelo /admin. Guarda inclusive os que falharam: sem isto,
  -- um envio que morre no SMTP some sem deixar rastro e a gente fica achando
  -- que o cliente recebeu.
  CREATE TABLE IF NOT EXISTS emails (
    id         BIGSERIAL PRIMARY KEY,
    para       TEXT NOT NULL,
    assunto    TEXT NOT NULL,
    corpo      TEXT NOT NULL,
    status     TEXT NOT NULL,   -- 'enviado' | 'erro'
    erro       TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_emails_data ON emails(created_at DESC);

  -- Celulares que pediram pra receber notificacao de pedido (Web Push).
  -- O endpoint E a identidade do aparelho: o navegador devolve o mesmo quando
  -- o app e reaberto, e por isso ele e a chave primaria — reinstalar nao
  -- duplica a linha. p256dh/auth sao as chaves de criptografia da mensagem:
  -- sem elas o servidor de push recusa a entrega.
  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint   TEXT PRIMARY KEY,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    apelido    TEXT,             -- "iPhone (Safari)", pra reconhecer na lista
    created_at BIGINT NOT NULL,
    last_ok    BIGINT,           -- ultimo envio aceito
    last_erro  TEXT              -- ultimo motivo de recusa (diagnostico)
  );

  -- Diario de acesso ao painel: uma linha por tentativa de login.
  -- Responde "quem mexeu no meu painel e de onde". Nao guarda a senha
  -- tentada (nunca), so se o resultado foi 'ok', 'senha' (senha errada),
  -- '2fa' (senha certa, codigo errado) ou 'bloqueio' (barrado pelo freio).
  CREATE TABLE IF NOT EXISTS admin_access (
    id          BIGSERIAL PRIMARY KEY,
    ip          TEXT,
    resultado   TEXT NOT NULL,
    usuario     TEXT,
    user_agent  TEXT,
    created_at  BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_acesso_data ON admin_access(created_at);

  -- Cidade e operadora de um IP, guardadas depois de consultadas UMA vez.
  -- O cache nao e por desempenho: e para o mesmo IP nao ser mandado ao
  -- servico externo a cada abertura da tela.
  CREATE TABLE IF NOT EXISTS ip_geo (
    ip            TEXT PRIMARY KEY,
    cidade        TEXT,
    regiao        TEXT,
    pais          TEXT,
    operadora     TEXT,
    consultado_em BIGINT NOT NULL
  );

  -- Na Supabase toda tabela fica exposta pela API REST dela se ficar sem
  -- politica. Esta loja fala com o banco SO pela conexao direta (a chave de
  -- servico nem existe aqui), entao ligar RLS sem criar politica nenhuma
  -- fecha a porta da API e nao muda nada para nos.
  ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shopify_tokens ENABLE ROW LEVEL SECURITY;
  ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE upsell_views   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE variants       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE emails         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE push_subs      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE admin_access   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ip_geo         ENABLE ROW LEVEL SECURITY;

  -- URL de acompanhamento do rastreio proprio (RotaSync). Guardada porque o
  -- link usa um token opaco (/r/<token>), que NAO da para montar a partir do
  -- codigo: perder esta coluna e perder o link do cliente.
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
`;

export async function criarEsquema() {
  await transacao(async (t) => {
    // Duas instâncias subindo juntas num banco vazio rodariam o mesmo CREATE
    // ao mesmo tempo, e o Postgres responde a isso com erro de chave duplicada
    // no catálogo interno. A trava faz a segunda esperar a primeira terminar.
    await t.query('SELECT pg_advisory_xact_lock(4747001)');
    await t.exec(DDL);
    const agora = Date.now();
    await t.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('esquema_versao', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [ESQUEMA_VERSAO, agora],
    );
    // Marco zero da oferta pós-compra: gravado uma única vez. É o corte do
    // funil — pedido pago ANTES disto nunca viu o botão, e contá-lo afundaria
    // a taxa de entrada com gente que não teve chance.
    //
    // Não dá pra deduzir isso da primeira visita registrada: o pedido é pago
    // antes de a pessoa abrir a oferta, então um corte na primeira visita
    // excluiria justamente o pedido que a gerou.
    await t.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('upsell_inicio', $1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [String(agora), agora],
    );
  });
}

// ----------------------------------------------------------------- SETTINGS
// Cópia em memória de toda a tabela settings. É pequena (algumas dezenas de
// linhas; a maior é a logo em data URI) e é lida o tempo todo.
const settings = new Map(); // key -> { value, updatedAt }
let settingsEm = 0;

const tabelaNaoExiste = (e) => e?.code === '42P01' || /does not exist|não existe/i.test(String(e?.message || ''));

async function carregarTudo() {
  const linhas = await all('SELECT key, value, updated_at FROM settings');
  settings.clear();
  for (const l of linhas) settings.set(l.key, { value: l.value, updatedAt: Number(l.updated_at) });
  settingsEm = Date.now();
}

async function iniciar() {
  try {
    await carregarTudo();
  } catch (e) {
    if (!tabelaNaoExiste(e)) throw e;
    settings.clear();
  }
  if (settings.get('esquema_versao')?.value !== ESQUEMA_VERSAO) {
    await criarEsquema();
    await carregarTudo();
    console.log(`[db] esquema criado/atualizado (versão ${ESQUEMA_VERSAO})`);
  }
}

let iniciando = null;
let iniciado = false;

// Garante banco aberto, esquema criado e settings carregadas. O app.js chama a
// cada requisição: se o banco estava fora do ar na subida, a próxima
// requisição tenta de novo em vez de a instância ficar quebrada para sempre.
export function pronto() {
  if (iniciado) return Promise.resolve();
  if (!iniciando) {
    iniciando = iniciar()
      .then(() => { iniciado = true; })
      .finally(() => { iniciando = null; });
  }
  return iniciando;
}

// Confere com o banco o que mudou desde a última olhada. Busca só chave e
// data de TODAS as linhas (barato) e o valor apenas das que mudaram — a logo
// não trafega a cada requisição.
//
// `maxIdadeMs` é quanto de atraso se aceita. O painel e qualquer POST pedem 0
// (quem acabou de salvar tem que ver o que salvou, e o PIX tem que sair pelo
// gateway que o dono escolheu agora); página de vitrine aceita alguns segundos.
let atualizando = null;
export function atualizarSettings({ maxIdadeMs = 0 } = {}) {
  if (Date.now() - settingsEm <= maxIdadeMs) return Promise.resolve();
  if (atualizando) return atualizando;
  atualizando = (async () => {
    const inicio = Date.now();
    const linhas = await all('SELECT key, updated_at FROM settings');
    const vivas = new Set();
    const mudaram = [];
    for (const l of linhas) {
      vivas.add(l.key);
      const tenho = settings.get(l.key);
      // Só troca se o banco tem coisa MAIS NOVA. Uma gravação desta própria
      // instância que ainda está a caminho do banco tem data maior que a
      // linha antiga, e não pode ser desfeita por esta leitura.
      if (!tenho || Number(l.updated_at) > tenho.updatedAt) mudaram.push(l.key);
    }
    if (mudaram.length) {
      const novas = await all('SELECT key, value, updated_at FROM settings WHERE key = ANY($1)', [mudaram]);
      for (const l of novas) {
        const tenho = settings.get(l.key);
        if (!tenho || Number(l.updated_at) > tenho.updatedAt) {
          settings.set(l.key, { value: l.value, updatedAt: Number(l.updated_at) });
        }
      }
    }
    // Chave que sumiu do banco some daqui — menos a que esta instância gravou
    // depois de a leitura começar, que ainda não tinha chegado lá.
    for (const [k, v] of settings) if (!vivas.has(k) && v.updatedAt < inicio) settings.delete(k);
    settingsEm = Date.now();
  })().finally(() => { atualizando = null; });
  return atualizando;
}

export function getSetting(key, fallback = null) {
  const r = settings.get(key);
  return r ? r.value : fallback;
}

// Gravações de settings saem em FILA, uma de cada vez. Duas gravações seguidas
// da mesma chave poderiam viajar por conexões diferentes e chegar trocadas —
// e o valor antigo ficaria por cima do novo.
let filaSettings = Promise.resolve();

// Devolve a promessa da gravação. Quem precisa ter certeza de que gravou antes
// de seguir usa `await`; quem não usa continua seguro, porque a resposta HTTP
// espera as gravações em voo antes de sair.
export function setSetting(key, value) {
  const valor = String(value);
  const anterior = settings.get(key);
  // Sempre maior que a data anterior da MESMA chave: é por ela que as outras
  // instâncias percebem a mudança, e dois valores no mesmo milissegundo
  // pareceriam um só.
  const updatedAt = Math.max(Date.now(), (anterior?.updatedAt || 0) + 1);
  settings.set(key, { value: valor, updatedAt });
  const SQL = `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
  const gravacao = filaSettings.then(async () => {
    try {
      return await run(SQL, [key, valor, updatedAt]);
    } catch (e) {
      if (!tabelaNaoExiste(e)) throw e;
      // Um script (ou teste) que importe este módulo direto, sem passar pelo
      // app.js, grava antes de o esquema existir. Cria e tenta de novo: a
      // alternativa é perder a gravação EM SILÊNCIO — o valor fica na cópia em
      // memória, quem leu no mesmo processo vê o valor novo, e a próxima
      // instância não vê nada.
      await criarEsquema();
      return run(SQL, [key, valor, updatedAt]);
    }
  });
  filaSettings = gravacao.catch((e) => console.error(`[db] falha gravando setting ${key}:`, e.message));
  return rastrear(gravacao);
}

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (v) => (v == null ? null : JSON.parse(v));

function rowToOrder(r) {
  if (!r) return null;
  return {
    id: r.id,
    postbackToken: r.postback_token,
    status: r.status,
    currency: r.currency,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents,
    shippingCents: r.shipping_cents,
    totalCents: r.total_cents,
    customer: P(r.customer_json),
    items: P(r.items_json),
    shipping: P(r.shipping_json),
    fb: P(r.fb_json),
    tracking: P(r.tracking_json),
    pixCode: r.pix_code,
    transactionId: r.transaction_id,
    shopifyOrderId: r.shopify_order_id,
    trackingCode: r.tracking_code || '',
    trackingUrl: r.tracking_url || '',
    // id do pedido pago que abriu a oferta; vazio em pedido normal
    upsellDe: r.upsell_de || '',
    // id do pedido abandonado que esta venda recuperou; vazio em pedido normal
    recuperadoDe: r.recuperado_de || '',
    // instante em que o e-mail de recuperação saiu para ESTE pedido; null
    // enquanto ele nunca entrou num disparo
    recuperacaoEm: r.recuperacao_em || null,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    shippedAt: r.shipped_at,
  };
}

export async function createOrder(o) {
  await run(
    `INSERT INTO orders
       (id, postback_token, status, currency, subtotal_cents, discount_cents,
        shipping_cents, total_cents, customer_json, items_json, shipping_json,
        fb_json, tracking_json, transaction_id, created_at, upsell_de, recuperado_de)
     VALUES
       ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      o.id,
      o.postbackToken,
      o.currency,
      o.subtotalCents,
      o.discountCents,
      o.shippingCents,
      o.totalCents,
      J(o.customer),
      J(o.items),
      J(o.shipping),
      J(o.fb),
      J(o.tracking),
      o.transactionId ?? null,
      Date.now(),
      // id do pedido pago que abriu a oferta; null em pedido normal
      o.upsellDe ?? null,
      // id do pedido abandonado que esta venda recuperou; null em pedido normal
      o.recuperadoDe ?? null,
    ],
  );
  return getOrder(o.id);
}

export async function getOrder(id) {
  return rowToOrder(await get('SELECT * FROM orders WHERE id = $1', [String(id ?? '')]));
}

// --- admin: listagem + métricas ---
//
// Fuso do relatório por dia. As datas são epoch em ms (UTC); sem deslocar,
// tudo entre 21h e meia-noite cairia no dia seguinte e a data mostrada na
// lista (que usa America/Sao_Paulo) discordaria do total. O Brasil não tem
// horário de verão desde 2019, então o -3 fixo vale o ano inteiro — se o
// horário de verão voltar, é ESTA linha que muda.
//
// O AT TIME ZONE 'UTC' tira a conta do fuso da SESSÃO do banco: sem ele o
// to_char usaria o fuso configurado no servidor, e o dia mudaria de lugar se
// alguém mexesse nessa configuração na Supabase.
const DIA = (col) => `to_char((to_timestamp(${col} / 1000.0) AT TIME ZONE 'UTC') - interval '3 hours', 'YYYY-MM-DD')`;

// PAGO conta pelo dia do PAGAMENTO (é quando o dinheiro entrou) e PENDENTE
// pelo dia em que o PIX foi gerado — pendente não tem data de pagamento, e
// esperar uma que nunca vem sumiria com ele do relatório. As duas colunas do
// painel são rotuladas para essa diferença ficar explícita.
const DIA_PAGO = DIA('paid_at');
const DIA_CRIADO = DIA('created_at');

// Dia de hoje em São Paulo no formato YYYY-MM-DD ('en-CA' já devolve ISO).
export function hojeBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Normaliza o recorte de datas num par [início, fim] (YYYY-MM-DD).
// `dia` é o atalho de um dia só e continua valendo: a tabela de dias do painel
// e links antigos ainda apontam para ele. Datas invertidas são trocadas em vez
// de devolverem lista vazia — quem escolhe no calendário erra a ordem às vezes,
// e uma tela vazia parece "não vendeu nada" quando o problema é a ordem.
function periodo({ dia = null, de = null, ate = null } = {}) {
  const ini = de || dia || ate;
  const fim = ate || dia || de;
  if (!ini || !fim) return null;
  return ini <= fim ? [ini, fim] : [fim, ini];
}

// `de`/`ate` (YYYY-MM-DD) recortam um período; `dia` recorta um dia só.
// Com status 'pending' o corte é pela criação; nos demais casos, pelo pagamento
// (e só pedido pago entra).
export async function listOrders({ limit = 100, offset = 0, status = null, dia = null, de = null, ate = null } = {}) {
  const per = periodo({ dia, de, ate });
  if (per) {
    const [cond, ordem] = status === 'pending'
      ? [`status = 'pending' AND ${DIA_CRIADO} BETWEEN $1 AND $2`, 'created_at DESC']
      : [`status = 'paid' AND ${DIA_PAGO} BETWEEN $1 AND $2`, 'paid_at DESC'];
    return (await all(
      `SELECT * FROM orders WHERE ${cond} ORDER BY ${ordem} LIMIT $3 OFFSET $4`,
      [per[0], per[1], limit, offset],
    )).map(rowToOrder);
  }
  const rows = status
    ? await all('SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [status, limit, offset])
    : await all('SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
  return rows.map(rowToOrder);
}

// Um dia por linha, mais recente primeiro, com pago E pendente lado a lado.
//
// A lista de dias é a UNIÃO dos dois lados: dia que só teve PIX abandonado não
// tem linha de faturamento, mas precisa aparecer — é justamente o dia que o
// lojista quer investigar. Por isso o FULL JOIN em vez de um GROUP BY só.
export async function revenueByDay({ limit = 60 } = {}) {
  return all(
    `WITH pagos AS (
       SELECT ${DIA_PAGO} AS dia, COUNT(*) AS pagas, COALESCE(SUM(total_cents),0) AS receita
         FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY 1
     ),
     pend AS (
       SELECT ${DIA_CRIADO} AS dia, COUNT(*) AS pendentes, COALESCE(SUM(total_cents),0) AS valor
         FROM orders WHERE status = 'pending' GROUP BY 1
     )
     SELECT COALESCE(p.dia, q.dia)   AS dia,
            COALESCE(p.pagas, 0)     AS pagas,
            COALESCE(p.receita, 0)   AS "revenueCents",
            COALESCE(q.pendentes, 0) AS pendentes,
            COALESCE(q.valor, 0)     AS "pendingCents"
       FROM pagos p FULL OUTER JOIN pend q ON q.dia = p.dia
      ORDER BY 1 DESC
      LIMIT $1`,
    [limit],
  );
}

// Totais de um PERÍODO (YYYY-MM-DD, inclusivo nas duas pontas). Devolve zeros
// em período vazio, nunca undefined. Mesma regra do resto do painel: pago conta
// pelo dia do pagamento, pendente pelo dia em que o PIX foi gerado.
export async function statsForPeriodo(de, ate = de) {
  const per = periodo({ de, ate });
  if (!per) return { pagas: 0, revenueCents: 0, pendentes: 0, pendingCents: 0 };
  const r = await get(
    `SELECT
       COUNT(*) FILTER (WHERE status='paid' AND ${DIA_PAGO} BETWEEN $1 AND $2)                           AS pagas,
       COALESCE(SUM(total_cents) FILTER (WHERE status='paid' AND ${DIA_PAGO} BETWEEN $1 AND $2), 0)      AS "revenueCents",
       COUNT(*) FILTER (WHERE status='pending' AND ${DIA_CRIADO} BETWEEN $1 AND $2)                      AS pendentes,
       COALESCE(SUM(total_cents) FILTER (WHERE status='pending' AND ${DIA_CRIADO} BETWEEN $1 AND $2), 0) AS "pendingCents"
     FROM orders`,
    [per[0], per[1]],
  );
  return {
    pagas: r?.pagas || 0,
    revenueCents: r?.revenueCents || 0,
    pendentes: r?.pendentes || 0,
    pendingCents: r?.pendingCents || 0,
  };
}

// Atalho de um dia só, mantido porque é como o painel sempre chamou.
export function statsForDay(dia) {
  return statsForPeriodo(dia, dia);
}

export async function orderStats() {
  const [r, hoje] = await Promise.all([
    get(
      `SELECT
         COUNT(*)                                                        AS total,
         COUNT(*) FILTER (WHERE status = 'paid')                         AS paid,
         COUNT(*) FILTER (WHERE status = 'pending')                      AS pending,
         COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'), 0)    AS "revenueCents",
         COALESCE(SUM(total_cents) FILTER (WHERE status = 'pending'), 0) AS "pendingCents",
         COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= $1)       AS "last24hPaid"
       FROM orders`,
      [Date.now() - 864e5],
    ),
    statsForDay(hojeBR()),
  ]);
  return {
    total: r.total,
    paid: r.paid,
    pending: r.pending,
    revenueCents: r.revenueCents,
    pendingCents: r.pendingCents,
    last24hPaid: r.last24hPaid,
    // "Hoje" é o dia civil em SP, não as últimas 24h — é o número que o lojista
    // compara com o dia de ontem.
    hojeRevenueCents: hoje.revenueCents,
    hojePedidos: hoje.pagas,
    hojePendentes: hoje.pendentes,
    hojePendingCents: hoje.pendingCents,
  };
}

// --- ranking de mais vendidos ------------------------------------------
//
// Itens de um pedido como linhas. O CASE protege de items_json que não seja
// lista: jsonb_array_elements ESTOURA nesse caso, e um pedido torto derrubaria
// o relatório inteiro.
const ITENS = (alias) => `jsonb_array_elements(
  CASE WHEN jsonb_typeof(${alias}.items_json::jsonb) = 'array' THEN ${alias}.items_json::jsonb ELSE '[]'::jsonb END
) AS j(value)`;

// Número guardado dentro do JSON. Vem como texto do ->>; o NULLIF cobre campo
// vazio, que não converte.
const NUM = (campo) => `NULLIF(j.value->>'${campo}', '')::numeric`;

// Base das três consultas do ranking: um item de pedido por linha, já reduzido
// ao que interessa. Só pedido PAGO entra — PIX gerado e abandonado não é venda,
// e contá-lo colocaria no topo justamente o que as pessoas desistem de comprar.
//
// A chave do agrupamento é o PRODUTO, não a variante: duas peças do mesmo
// modelo em tamanhos diferentes são duas vendas do mesmo produto. `productId` é o
// handle no catálogo próprio, mas pedido antigo não gravava esse campo — nesses
// o handle é o pedaço do variantId antes do "::" (o id é "handle::opção").
const CTE_VENDIDOS = `
  itens AS (
    SELECT o.id AS pedido, o.paid_at AS pago_em,
           COALESCE(j.value->>'variantId', '')  AS vid,
           NULLIF(j.value->>'productId', '')    AS pid_gravado,
           j.value->>'title'                    AS titulo,
           j.value->>'image'                    AS imagem,
           -- qty é a QUANTIDADE do item: sem somá-la, "3 iguais" contaria como
           -- uma venda só. O GREATEST protege de item antigo gravado sem o campo.
           GREATEST(COALESCE(${NUM('qty')}, 1), 1)::integer AS qtd,
           COALESCE(${NUM('priceCents')}, 0)::integer       AS preco
      FROM orders o, ${ITENS('o')}
     WHERE o.status = 'paid'
       AND (@desde::bigint IS NULL OR (o.paid_at IS NOT NULL AND o.paid_at >= @desde::bigint))
  ),
  vendidos AS (
    SELECT pedido, pago_em, titulo, imagem, qtd, preco,
           COALESCE(pid_gravado,
             CASE WHEN strpos(vid, '::') > 0 THEN substr(vid, 1, strpos(vid, '::') - 1) ELSE vid END
           ) AS pid,
           CASE WHEN strpos(vid, '::') > 0 THEN substr(vid, strpos(vid, '::') + 2) ELSE '' END AS numeracao
      FROM itens
  )`;

// Recorte por categoria, sempre aplicado sobre o LEFT JOIN com `products`.
// Produto sem `type` é anterior à coluna — ele entra junto com o Type pedido, a
// mesma regra que o ajuste de preço usa. Produto que saiu do catálogo fica de
// fora do recorte: sem linha em `products` não há como saber a categoria dele.
const FILTRO_TIPO = `(@tipo::text IS NULL OR (p.id IS NOT NULL AND (p.type IS NULL OR p.type = '' OR p.type = @tipo::text)))`;

// Os produtos que mais saíram, do primeiro ao último.
//
// Título e foto saem do catálogo quando o produto ainda existe, e do pedido
// quando não existe mais — assim um produto retirado do CSV continua aparecendo
// no histórico com a cara que tinha, em vez de virar uma linha sem nome.
export async function topProdutosVendidos({ desde = null, tipo = null, limit = 10 } = {}) {
  const [sql, params] = nomeados(`
    WITH ${CTE_VENDIDOS}
    SELECT v.pid                    AS id,
           MAX(p.handle)            AS handle,
           MAX(p.title)             AS "tituloCatalogo",
           MAX(p.image)             AS "imagemCatalogo",
           MAX(p.type)              AS tipo,
           SUM(v.qtd)               AS pares,
           COUNT(DISTINCT v.pedido) AS pedidos,
           SUM(v.qtd * v.preco)     AS "receitaCents",
           MAX(v.pago_em)           AS "ultimaVenda",
           -- título e foto da ÚLTIMA venda: é a versão mais recente do nome e
           -- da foto daquele produto.
           (array_agg(v.titulo ORDER BY v.pago_em DESC NULLS LAST))[1] AS "tituloPedido",
           (array_agg(v.imagem ORDER BY v.pago_em DESC NULLS LAST))[1] AS "imagemPedido"
      FROM vendidos v LEFT JOIN products p ON p.id = v.pid
     WHERE ${FILTRO_TIPO}
     GROUP BY v.pid
     ORDER BY pares DESC, "receitaCents" DESC, "ultimaVenda" DESC NULLS LAST
     LIMIT @limit::integer
  `, { desde, tipo, limit });
  return (await all(sql, params)).map((r) => ({
    id: r.id,
    handle: r.handle || '',
    title: r.tituloCatalogo || r.tituloPedido || r.id,
    image: r.imagemCatalogo || r.imagemPedido || '',
    tipo: r.tipo || '',
    noCatalogo: !!r.handle,
    pares: r.pares || 0,
    pedidos: r.pedidos || 0,
    receitaCents: r.receitaCents || 0,
    ultimaVenda: r.ultimaVenda || null,
  }));
}

// A opção que mais saiu de cada produto — é o que diz o que repor.
//
// Consulta à parte porque é outro nível de agrupamento (produto × opção):
// juntar com a de cima daria uma linha por opção e o mesmo produto apareceria
// várias vezes no ranking.
export async function numeracaoMaisVendida({ desde = null, tipo = null } = {}) {
  const [sql, params] = nomeados(`
    WITH ${CTE_VENDIDOS}
    SELECT v.pid AS id, v.numeracao AS numeracao, SUM(v.qtd) AS pares
      FROM vendidos v LEFT JOIN products p ON p.id = v.pid
     WHERE ${FILTRO_TIPO} AND v.numeracao <> ''
     GROUP BY v.pid, v.numeracao
     ORDER BY pares DESC, v.numeracao
  `, { desde, tipo });
  // ORDER BY pares DESC + primeiro a chegar vence: o topo de cada produto.
  const topo = new Map();
  for (const l of await all(sql, params)) {
    if (!topo.has(l.id)) topo.set(l.id, { numeracao: l.numeracao, pares: l.pares });
  }
  return topo;
}

// Totais do mesmo recorte, para os cartões do topo da tela. Não dá pra somar as
// linhas do ranking: elas são só as N primeiras.
export async function resumoVendasProdutos({ desde = null, tipo = null } = {}) {
  const [sql, params] = nomeados(`
    WITH ${CTE_VENDIDOS}
    SELECT COALESCE(SUM(v.qtd),0)           AS pares,
           COUNT(DISTINCT v.pid)            AS produtos,
           COUNT(DISTINCT v.pedido)         AS pedidos,
           COALESCE(SUM(v.qtd * v.preco),0) AS "receitaCents"
      FROM vendidos v LEFT JOIN products p ON p.id = v.pid
     WHERE ${FILTRO_TIPO}
  `, { desde, tipo });
  const r = await get(sql, params);
  return {
    pares: r?.pares || 0,
    produtos: r?.produtos || 0,
    pedidos: r?.pedidos || 0,
    receitaCents: r?.receitaCents || 0,
  };
}

// As categorias que existem no catálogo, da maior pra menor. É o que monta os
// filtros da tela — assim uma categoria nova no CSV aparece sozinha, sem
// precisar mexer no painel.
export async function tiposDoCatalogo() {
  return all(`SELECT type AS tipo, COUNT(*) AS produtos FROM products
     WHERE status = 'active' AND type IS NOT NULL AND type <> ''
     GROUP BY type ORDER BY produtos DESC, type`);
}

// --- oferta pós-compra (upsell) ---

// Uma abertura da página. UPSERT: a primeira cria a linha, as seguintes só
// atualizam o relógio e o contador — assim `COUNT(*)` da tabela é gente, não
// recarregamento.
export async function registrarUpsellView(orderId) {
  if (!orderId) return;
  await run(
    `INSERT INTO upsell_views (order_id, first_at, last_at, aberturas) VALUES ($1, $2, $2, 1)
     ON CONFLICT (order_id) DO UPDATE SET last_at = EXCLUDED.last_at, aberturas = upsell_views.aberturas + 1`,
    [String(orderId), Date.now()],
  );
}

// Funil da oferta, do pedido pago até a segunda venda.
//
// A base ("liberadas") conta só pedidos pagos que NÃO nasceram da oferta: um
// pedido de upsell não gera outra oferta, então incluí-lo afundaria a taxa de
// entrada com gente que nunca viu o botão.
export async function upsellStats() {
  const desde = Number(getSetting('upsell_inicio')) || 0;
  const [o, v, pares] = await Promise.all([
    get(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'paid' AND upsell_de IS NULL AND paid_at >= $1)            AS liberadas,
         COUNT(*) FILTER (WHERE upsell_de IS NOT NULL)                                              AS geraram,
         COUNT(*) FILTER (WHERE upsell_de IS NOT NULL AND status = 'paid')                          AS compraram,
         COALESCE(SUM(total_cents) FILTER (WHERE upsell_de IS NOT NULL AND status = 'paid'), 0)     AS "receitaCents",
         COALESCE(SUM(total_cents) FILTER (WHERE upsell_de IS NOT NULL AND status = 'pending'), 0)  AS "pendenteCents"
       FROM orders`,
      [desde],
    ),
    get('SELECT COUNT(*) AS entraram, COALESCE(SUM(aberturas),0) AS aberturas FROM upsell_views'),
    // Soma a QUANTIDADE, não as linhas: contar linha diria que "3 iguais" é 1
    // item e o painel mostraria um terço do que vendeu.
    get(`SELECT COALESCE(SUM(${NUM('qty')}),0) AS s
      FROM orders o, ${ITENS('o')}
      WHERE o.upsell_de IS NOT NULL AND o.status = 'paid'`),
  ]);
  return {
    // desde quando o funil conta — ver o comentário do 'upsell_inicio' lá em cima
    desde,
    liberadas: o.liberadas,
    entraram: v.entraram,
    aberturas: v.aberturas,
    geraram: o.geraram,
    compraram: o.compraram,
    receitaCents: o.receitaCents,
    pendenteCents: o.pendenteCents,
    paresVendidos: pares.s,
  };
}

// Pedidos nascidos da oferta, com o pedido de origem ao lado.
export async function listUpsellOrders({ limit = 50, offset = 0 } = {}) {
  return (await all(`SELECT * FROM orders WHERE upsell_de IS NOT NULL
    ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).map(rowToOrder);
}

// Os que abriram a oferta, com o que aconteceu depois de cada um.
export async function listUpsellViews({ limit = 50, offset = 0 } = {}) {
  return (await all(`
    SELECT v.order_id, v.first_at, v.last_at, v.aberturas,
           o.customer_json,
           (SELECT COUNT(*) FROM orders u WHERE u.upsell_de = v.order_id) AS gerou,
           (SELECT COUNT(*) FROM orders u WHERE u.upsell_de = v.order_id AND u.status = 'paid') AS pagou,
           (SELECT COALESCE(SUM(u.total_cents),0) FROM orders u
              WHERE u.upsell_de = v.order_id AND u.status = 'paid') AS gastou_cents
    FROM upsell_views v LEFT JOIN orders o ON o.id = v.order_id
    ORDER BY v.first_at DESC LIMIT $1 OFFSET $2`, [limit, offset]))
    .map((r) => ({
      orderId: r.order_id, firstAt: r.first_at, lastAt: r.last_at, aberturas: r.aberturas,
      customer: P(r.customer_json) || {},
      gerou: r.gerou, pagou: r.pagou, gastouCents: r.gastou_cents,
    }));
}

export const contarUpsellViews = async () => (await get('SELECT COUNT(*) AS c FROM upsell_views')).c;

// --- recuperação de PIX abandonado ---

// Carimba o disparo do e-mail. É ISTO que destrava o link (sem carimbo não há
// oferta) e é daqui que a janela conta.
//
// As duas condições do WHERE são travas, e estão na mesma instrução de
// propósito — decidir e carimbar viram um passo só, sem janela entre a leitura
// e a escrita:
//
//   status = 'pending'   se o pagamento cair entre a montagem da lista e o
//                        envio, o carimbo não pega. Sem isso a loja mandaria
//                        "seu pedido está esperando" pra quem acabou de pagar.
//
//   created_at >= corte  idade máxima do abandono. Fica AQUI, e não em
//                        `abrirRecuperacao`, porque a checagem na abertura
//                        mataria no dia 31 um link carimbado no dia 29 — no
//                        meio das 48h que o e-mail prometeu. Carimbado é
//                        carimbado; quem é velho demais nunca entra na lista.
export async function marcarRecuperacaoEnviada(orderId, { quando = Date.now(), corte = 0 } = {}) {
  if (!orderId) return false;
  return (await run(
    `UPDATE orders SET recuperacao_em = $2
      WHERE id = $1 AND status = 'pending' AND created_at >= $3`,
    [String(orderId), quando, corte],
  )) > 0;
}

// Já existe venda PAGA nascida deste pedido abandonado?
//
// Reabrir a página antes de pagar é normal — perdeu o QR, trocou de celular.
// O que a oferta não pode virar é preço permanente: um link, uma compra.
export async function temRecuperacaoPaga(orderId) {
  if (!orderId) return false;
  return Boolean(await get(
    "SELECT 1 AS tem FROM orders WHERE recuperado_de = $1 AND status = 'paid' LIMIT 1",
    [String(orderId)],
  ));
}

// Os abandonados que ainda podem entrar num disparo.
//
// `recuperacao_em IS NULL` é a trava de não mandar duas vezes: pedido que já
// recebeu o e-mail sai da lista pra sempre. Sem isso, dois disparos no mesmo
// período mandariam a mesma oferta duas vezes pra mesma pessoa — que é como se
// perde uma lista, e não como se recupera uma venda.
//
// Do mais recente pro mais antigo porque quem desistiu ontem converte muito
// mais que quem desistiu no mês passado: se o lote precisar ser cortado pelo
// limite diário do provedor, o corte cai no fim da lista, que é onde dói menos.
// `recuperado_de IS NULL` corta a cobra que morde o próprio rabo: pedido que
// JÁ nasceu de uma recuperação e não foi pago viraria candidato a uma nova
// recuperação, que geraria outro pedido, que viraria candidato de novo. Além
// do laço, a oferta não teria o que oferecer — ele já está no preço da oferta.
//
// Mesma ideia do funil do upsell, que também não conta pedido de upsell como
// base pra gerar outra oferta.
export async function pedidosAbandonados({ corte = 0, ate = Infinity, limit = 500 } = {}) {
  return (await all(`SELECT * FROM orders
     WHERE status = 'pending' AND recuperacao_em IS NULL AND recuperado_de IS NULL
       AND created_at >= $1 AND created_at <= $2
     ORDER BY created_at DESC LIMIT $3`,
  [corte, Number.isFinite(ate) ? ate : Date.now(), limit]))
    .map(rowToOrder);
}

// E-mail do cliente, tirado do JSON, já normalizado para comparar.
const EMAIL_DO_PEDIDO = "lower(trim(customer_json::jsonb->>'email'))";

// Os e-mails que JÁ receberam uma oferta de recuperação desde `desde`.
//
// Existe porque "não mandar duas vezes" é sobre a PESSOA, não sobre o pedido.
// Quem abandona duas vezes tem dois pedidos: barrar só o pedido já carimbado
// faz o segundo aparecer como candidato novo no disparo seguinte, e a mesma
// pessoa recebe a mesma oferta duas vezes. Foi exatamente o que aconteceu.
//
// Com janela em vez de "pra sempre": quem abandonou em março, recebeu a oferta
// e não comprou pode voltar a abandonar em junho — e aí é abandono novo, que
// merece oferta nova. O que não pode é duas no mesmo mês.
export async function emailsJaRecuperados(desde = 0) {
  return new Set(
    (await all(`SELECT DISTINCT ${EMAIL_DO_PEDIDO} AS e
       FROM orders WHERE recuperacao_em IS NOT NULL AND recuperacao_em >= $1`, [desde]))
      .map((r) => r.e)
      .filter(Boolean),
  );
}

// Funil da recuperação: disparados -> geraram PIX novo -> pagaram.
//
// Não tem tabela de visitas como o upsell porque aqui os três números saem dos
// próprios pedidos: quem recebeu tem carimbo, quem voltou tem pedido com
// `recuperado_de`. Uma tabela a mais só serviria pra medir quem abriu e não
// comprou, e isso o carimbo menos o resto já entrega.
export async function recuperacaoStats() {
  const r = await get(`
    SELECT
      COUNT(*) FILTER (WHERE recuperacao_em IS NOT NULL)                                              AS disparados,
      -- O que estava em jogo: soma dos pedidos abandonados que receberam e-mail
      -- e continuam sem pagar.
      COALESCE(SUM(total_cents) FILTER (WHERE recuperacao_em IS NOT NULL AND status = 'pending'), 0)  AS "abandonadoCents",
      COUNT(*) FILTER (WHERE recuperado_de IS NOT NULL)                                              AS geraram,
      COUNT(*) FILTER (WHERE recuperado_de IS NOT NULL AND status = 'paid')                          AS compraram,
      -- Gente, não pedidos. Hoje os dois números batem — temRecuperacaoPaga
      -- impede a segunda compra pelo mesmo link — mas quem abandonou em meses
      -- diferentes pode ser recuperado duas vezes, e aí "5 vendas" e "5 pessoas"
      -- deixam de ser a mesma coisa. Quem paga a conta do e-mail é a pessoa.
      COUNT(DISTINCT ${EMAIL_DO_PEDIDO}) FILTER (WHERE recuperado_de IS NOT NULL AND status = 'paid') AS pessoas,
      COALESCE(SUM(total_cents) FILTER (WHERE recuperado_de IS NOT NULL AND status = 'paid'), 0)      AS "receitaCents",
      COALESCE(SUM(total_cents) FILTER (WHERE recuperado_de IS NOT NULL AND status = 'pending'), 0)   AS "pendenteCents"
    FROM orders`);
  return {
    disparados: r.disparados,
    abandonadoCents: r.abandonadoCents,
    geraram: r.geraram,
    compraram: r.compraram,
    pessoas: r.pessoas,
    receitaCents: r.receitaCents,
    pendenteCents: r.pendenteCents,
  };
}

// Pedidos nascidos da recuperação, com o abandonado de origem ao lado.
export async function listRecuperacaoOrders({ limit = 50, offset = 0 } = {}) {
  return (await all(`SELECT * FROM orders WHERE recuperado_de IS NOT NULL
    ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).map(rowToOrder);
}

export async function getOrderByPostbackToken(token) {
  if (!token) return null;
  return rowToOrder(await get('SELECT * FROM orders WHERE postback_token = $1', [String(token)]));
}

// Plano B do webhook: alguns gateways descartam a query string do postback,
// então o token some. O id da transação vem no corpo e também identifica o pedido.
export async function getOrderByTransactionId(transactionId) {
  if (!transactionId) return null;
  return rowToOrder(await get(
    'SELECT * FROM orders WHERE transaction_id = $1 ORDER BY created_at DESC LIMIT 1',
    [String(transactionId)],
  ));
}

export async function setPix(id, pixCode, transactionId) {
  await run('UPDATE orders SET pix_code = $1, transaction_id = $2 WHERE id = $3',
    [pixCode ?? null, transactionId == null ? null : String(transactionId), id]);
}

export async function setShopifyOrderId(id, shopifyOrderId) {
  await run('UPDATE orders SET shopify_order_id = $1 WHERE id = $2', [String(shopifyOrderId), id]);
}

// Retorna true se ESTA chamada foi a que marcou como pago (idempotência).
//
// O `status != 'paid'` dentro do UPDATE é o que sustenta isso com várias
// instâncias: se o gateway mandar o mesmo postback duas vezes e cada um cair
// numa instância, o banco deixa passar só um — o outro altera zero linhas.
export async function markPaid(id) {
  return (await run(
    "UPDATE orders SET status = 'paid', paid_at = $1 WHERE id = $2 AND status != 'paid'",
    [Date.now(), id],
  )) === 1;
}

// --- envio / rastreio ---

// Grava o código do rastreio SEM carimbar a data de envio. É o que o
// RotaSync usa: a encomenda é criada lá no momento do PAGAMENTO, e aí o
// pacote ainda não saiu — usar o setTracking abaixo marcaria "Enviado em"
// com a data do pagamento e todo pedido pago apareceria como despachado no
// /admin. Quem carimba o envio continua sendo o despacho de verdade
// (setTracking, pelo /admin ou pela Central).
//
// Não apaga nada quando vem vazio, de propósito: o apagar é operação do
// /admin, e um código que falhou de vir da API não pode desfazer o que já
// estava lá.
export async function setTrackingCode(id, code, url = '') {
  const c = String(code || '').trim();
  if (!c) return false;
  return (await run(
    'UPDATE orders SET tracking_code = $1, tracking_url = $2 WHERE id = $3',
    [c, String(url || '').trim() || null, id],
  )) === 1;
}

// A data de envio é do primeiro código lançado: corrigir um código digitado
// errado não pode fazer o pedido "voltar a ser enviado hoje" pro cliente.
export async function setTracking(id, code) {
  const c = String(code || '').trim();
  if (!c) return (await run('UPDATE orders SET tracking_code = NULL, shipped_at = NULL WHERE id = $1', [id])) === 1;
  return (await run(
    'UPDATE orders SET tracking_code = $1, shipped_at = COALESCE(shipped_at, $2) WHERE id = $3',
    [c, Date.now(), id],
  )) === 1;
}

// --- tokens OAuth ---
export async function saveToken(shop, accessToken, scope) {
  await run(`
    INSERT INTO shopify_tokens (shop, access_token, scope, installed_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (shop) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      scope = EXCLUDED.scope,
      installed_at = EXCLUDED.installed_at`,
  [shop, accessToken, scope ?? null, Date.now()]);
}

export async function getToken(shop) {
  const r = await get('SELECT access_token FROM shopify_tokens WHERE shop = $1', [shop]);
  return r ? r.access_token : null;
}

// --- catálogo próprio ---------------------------------------------------
// Mesmo shape que a Shopify devolvia em products.js, pra nada mais precisar mudar.
function rowToProduct(p, variants) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    bodyHtml: p.body_html || '',
    vendor: p.vendor || '',
    // a coluna já existia (é ela que decide o preço forçado por Type); só não
    // chegava ao catálogo em memória. A oferta pós-compra filtra por ela.
    type: p.type || '',
    tags: P(p.tags_json) || [],
    image: p.image || '',
    images: P(p.images_json) || [],
    variants: variants.map((v) => ({
      id: v.id,
      productId: v.product_id,
      productTitle: p.title,
      // o carrinho monta o link de volta pro produto a partir da variante
      handle: p.handle,
      title: v.option ? `${p.title} — ${v.option}` : p.title,
      option: v.option,
      sku: v.sku || '',
      priceCents: v.price_cents,
      compareCents: v.compare_cents || null,
      available: !!v.available,
      image: p.image || '',
    })),
  };
}

export async function listCatalog() {
  const [prods, vars] = await Promise.all([
    all(`SELECT * FROM products WHERE status = 'active' ORDER BY "position", title`),
    all('SELECT * FROM variants ORDER BY product_id, "position"'),
  ]);
  const byProduct = new Map();
  for (const v of vars) {
    if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
    byProduct.get(v.product_id).push(v);
  }
  return prods
    .map((p) => rowToProduct(p, byProduct.get(p.id) || []))
    .filter((p) => p.variants.length);
}

export async function catalogCount() {
  const r = await get(`SELECT
    (SELECT COUNT(*) FROM products WHERE status = 'active') AS products,
    (SELECT COUNT(*) FROM variants)                         AS variants`);
  return { products: r.products, variants: r.variants };
}

// Número que muda toda vez que o catálogo muda. É por ele que as OUTRAS
// instâncias percebem que o catálogo em memória delas ficou velho (ver
// products.js) — sem isso cada uma teria de reler o catálogo inteiro de tempos
// em tempos só para conferir.
const CHAVE_REV = 'catalogo_rev';
export const catalogoRev = () => getSetting(CHAVE_REV, '0');
const novaRevCatalogo = () => setSetting(CHAVE_REV, String(Date.now()));

const pedacos = (lista, n) => {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
};

// Importa em UMA transação: ou entra tudo, ou o catálogo antigo continua de pé.
//
// As linhas viajam em lotes, como JSON, e o próprio banco as desmonta
// (jsonb_to_recordset). Um INSERT por linha seriam milhares de idas e voltas
// pela rede — minutos, contra os poucos segundos de agora.
export async function importCatalog(products, { replace = true } = {}) {
  const now = Date.now();
  const linhasProduto = products.map((p, i) => ({
    id: p.id, title: p.title, handle: p.handle, body_html: p.bodyHtml || '',
    vendor: p.vendor || '', type: p.type || '', tags_json: J(p.tags || []), image: p.image || '',
    images_json: J(p.images || []), status: p.status || 'active',
    position: i, updated_at: now,
  }));
  const linhasVariante = [];
  for (const p of products) {
    p.variants.forEach((v, j) => linhasVariante.push({
      id: v.id, product_id: p.id, option: v.option || '', sku: v.sku || '',
      price_cents: v.priceCents, compare_cents: v.compareCents ?? null,
      available: v.available ? 1 : 0, position: j,
    }));
  }

  await transacao(async (t) => {
    // Mesma trava do esquema, outra chave: duas instâncias subindo juntas com
    // o catálogo vazio importariam ao mesmo tempo.
    await t.query('SELECT pg_advisory_xact_lock(4747002)');
    if (replace) {
      await t.query('DELETE FROM variants');
      await t.query('DELETE FROM products');
    }
    for (const lote of pedacos(linhasProduto, 200)) {
      await t.query(`
        INSERT INTO products (id,title,handle,body_html,vendor,type,tags_json,image,images_json,status,"position",updated_at)
        SELECT id,title,handle,body_html,vendor,type,tags_json,image,images_json,status,"position",updated_at
          FROM jsonb_to_recordset($1::jsonb) AS x(
            id text, title text, handle text, body_html text, vendor text, type text,
            tags_json text, image text, images_json text, status text, "position" integer, updated_at bigint)
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title, handle=EXCLUDED.handle, body_html=EXCLUDED.body_html,
          vendor=EXCLUDED.vendor, type=EXCLUDED.type, tags_json=EXCLUDED.tags_json, image=EXCLUDED.image,
          images_json=EXCLUDED.images_json, status=EXCLUDED.status,
          "position"=EXCLUDED."position", updated_at=EXCLUDED.updated_at`,
      [JSON.stringify(lote)]);
    }
    for (const lote of pedacos(linhasVariante, 1000)) {
      await t.query(`
        INSERT INTO variants (id,product_id,"option",sku,price_cents,compare_cents,available,"position")
        SELECT id,product_id,"option",sku,price_cents,compare_cents,available,"position"
          FROM jsonb_to_recordset($1::jsonb) AS x(
            id text, product_id text, "option" text, sku text, price_cents integer,
            compare_cents integer, available integer, "position" integer)
        ON CONFLICT (id) DO UPDATE SET
          product_id=EXCLUDED.product_id, "option"=EXCLUDED."option", sku=EXCLUDED.sku,
          price_cents=EXCLUDED.price_cents, compare_cents=EXCLUDED.compare_cents,
          available=EXCLUDED.available, "position"=EXCLUDED."position"`,
      [JSON.stringify(lote)]);
    }
  });
  await novaRevCatalogo();
  return { products: products.length, variants: linhasVariante.length };
}

// Alinha ao preço de venda vigente as variantes que ele governa, preservando o
// "de". O export da Shopify vem com o preço antigo; sem isto, um catálogo
// importado num ambiente onde a variável de preço não chegou fica vendendo pelo
// valor errado. Idempotente: quem já está no preço não é tocado.
//
// `tipo` restringe ao Type do CSV — o valor é o do PAR, e sem o filtro este
// UPDATE achataria os outros produtos junto a cada boot, desfazendo o preço
// deles. Produto sem type (banco anterior à coluna) entra.
//
// O "de" que já existe GANHA do preço antigo. Numa loja que já vendia com preço
// forçado, o price_cents antigo é a venda anterior, não o preço cheio: baixar
// de R$ 129 para R$ 99,90 sem esta ordem trocava o "de" R$ 179 do CSV pelos
// R$ 129 — a etiqueta caía de −44% para −23% no catálogo inteiro, e o 179 só
// voltava reimportando o CSV (14/09/2026). O preço antigo só vira "de" quando
// não há um acima do preço novo, que é o primeiro alinhamento de um export.
export async function ajustarPrecos(precoCents, tipo) {
  const preco = Number(precoCents);
  if (!Number.isFinite(preco) || preco <= 0) return 0;
  const n = await run(`
    UPDATE variants
       SET compare_cents = CASE
             WHEN compare_cents > $1 THEN compare_cents
             WHEN price_cents   > $1 THEN price_cents
             ELSE compare_cents
           END,
           price_cents   = $1
     WHERE price_cents <> $1
       AND product_id IN (
         SELECT id FROM products WHERE type IS NULL OR type = '' OR type = $2
       )`,
  [preco, String(tipo || '')]);
  if (n) await novaRevCatalogo();
  return n;
}

// --- diário de acesso ao /admin ---
export async function registrarAcesso({ ip, resultado, usuario, userAgent }) {
  await run(`
    INSERT INTO admin_access (ip, resultado, usuario, user_agent, created_at)
    VALUES ($1, $2, $3, $4, $5)`,
  [
    ip || null,
    String(resultado || ''),
    usuario ? String(usuario).slice(0, 120) : null,
    userAgent ? String(userAgent).slice(0, 200) : null,
    Date.now(),
  ]);
}

export async function listAcessos(limit = 100) {
  return all('SELECT * FROM admin_access ORDER BY created_at DESC LIMIT $1',
    [Math.min(Number(limit) || 100, 500)]);
}

// O diário serve pra flagrar acesso estranho recente, não pra virar arquivo
// histórico ocupando banco pra sempre.
export async function limparAcessosAntigos(dias = 180) {
  return run('DELETE FROM admin_access WHERE created_at < $1', [Date.now() - dias * 86400_000]);
}

// Faxina periódica. Antes rodava no boot do processo (server.js); na Vercel não
// existe um boot único — cada instância nova rodaria de novo, várias vezes por
// dia. A data do último passe fica no banco, então só a primeira instância de
// cada dia paga a conta.
const CHAVE_FAXINA = 'faxina_em';
export async function faxinaSePreciso() {
  const ultima = Number(getSetting(CHAVE_FAXINA)) || 0;
  if (Date.now() - ultima < 86400_000) return 0;
  // Marca ANTES de limpar: duas instâncias subindo juntas não fazem a mesma
  // faxina duas vezes, e falhar na limpeza não prende a próxima tentativa por
  // mais de um dia.
  await setSetting(CHAVE_FAXINA, String(Date.now()));
  return limparAcessosAntigos(180);
}

// --- cidade/operadora dos IPs (preenchido só quando o dono pede) ---
export async function getGeos() {
  const m = new Map();
  for (const r of await all('SELECT * FROM ip_geo')) m.set(r.ip, r);
  return m;
}

export async function saveGeo({ ip, cidade, regiao, pais, operadora }) {
  await run(`
    INSERT INTO ip_geo (ip, cidade, regiao, pais, operadora, consultado_em)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (ip) DO UPDATE SET cidade = EXCLUDED.cidade, regiao = EXCLUDED.regiao,
      pais = EXCLUDED.pais, operadora = EXCLUDED.operadora, consultado_em = EXCLUDED.consultado_em`,
  [String(ip), cidade || null, regiao || null, pais || null, operadora || null, Date.now()]);
}

// IPs distintos que aparecem no diário e ainda não têm cidade/operadora.
// GROUP BY em vez de DISTINCT porque o Postgres exige que a coluna do ORDER BY
// esteja na seleção quando há DISTINCT — e o que ordena aqui é o id, que não
// interessa a quem chama.
export async function ipsSemGeo(limite = 40) {
  return (await all(`
    SELECT a.ip, MAX(a.id) AS ultimo FROM admin_access a
    LEFT JOIN ip_geo g ON g.ip = a.ip
    WHERE a.ip IS NOT NULL AND a.ip <> '' AND g.ip IS NULL
    GROUP BY a.ip
    ORDER BY ultimo DESC LIMIT $1`, [limite])).map((r) => r.ip);
}

// --- histórico de e-mails ---
export async function logEmail({ para, assunto, corpo, status, erro = null }) {
  const r = await get(`
    INSERT INTO emails (para, assunto, corpo, status, erro, created_at)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [
    String(para || ''),
    String(assunto || ''),
    String(corpo || ''),
    status === 'enviado' ? 'enviado' : 'erro',
    erro ? String(erro).slice(0, 500) : null,
    Date.now(),
  ]);
  return r?.id;
}

export async function listEmails(limit = 50) {
  return (await all('SELECT * FROM emails ORDER BY created_at DESC LIMIT $1', [Number(limit) || 50]))
    .map((r) => ({
      id: r.id,
      para: r.para,
      assunto: r.assunto,
      corpo: r.corpo,
      status: r.status,
      erro: r.erro,
      createdAt: r.created_at,
    }));
}

// --- celulares inscritos nas notificações ---
// Reinscrever o MESMO aparelho não cria linha nova (endpoint é a chave) e
// limpa o último erro: se a inscrição tinha caducado e o dono reativou pelo
// painel, a lista precisa voltar a mostrar o aparelho como saudável.
export async function salvarPushSub({ endpoint, p256dh, auth, apelido = null }) {
  await run(`
    INSERT INTO push_subs (endpoint, p256dh, auth, apelido, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, apelido = EXCLUDED.apelido,
      last_erro = NULL`,
  [String(endpoint), String(p256dh), String(auth), apelido ? String(apelido).slice(0, 80) : null, Date.now()]);
}

export async function listPushSubs() {
  return (await all('SELECT * FROM push_subs ORDER BY created_at DESC')).map((r) => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
    apelido: r.apelido,
    createdAt: r.created_at,
    lastOk: r.last_ok,
    lastErro: r.last_erro,
  }));
}

export const removerPushSub = async (endpoint) =>
  (await run('DELETE FROM push_subs WHERE endpoint = $1', [String(endpoint)])) > 0;

export const marcarPushOk = (endpoint) =>
  run('UPDATE push_subs SET last_ok = $1, last_erro = NULL WHERE endpoint = $2', [Date.now(), String(endpoint)]);

export const marcarPushErro = (endpoint, erro) =>
  run('UPDATE push_subs SET last_erro = $1 WHERE endpoint = $2', [String(erro).slice(0, 200), String(endpoint)]);

export const contarPushSubs = async () => (await get('SELECT COUNT(*) AS n FROM push_subs')).n;

export default { query, exec, transacao };
