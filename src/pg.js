import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Conexão com o Postgres (Supabase). Este arquivo só sabe ABRIR a conexão e
// rodar SQL; o que cada consulta significa mora em db.js.
//
// Por que saiu o SQLite: na Vercel não existe disco. Cada requisição pode cair
// numa instância diferente, e o que uma gravou em arquivo a outra não enxerga
// — o webhook do gateway chegaria numa instância que nunca viu o pedido, e o
// dinheiro entraria sem o pedido ficar pago. Banco fora do processo é a única
// forma de todas as instâncias concordarem.
//
// Duas formas de rodar:
//   DATABASE_URL definida -> Postgres de verdade (Supabase, produção).
//   sem DATABASE_URL      -> Postgres embutido (PGlite) numa pasta local. Só
//                            para desenvolver e testar sem tocar em produção;
//                            na Vercel isso é recusado, porque lá a pasta some.

const __dirname = dirname(fileURLToPath(import.meta.url));

// A integração Supabase da Vercel cria POSTGRES_URL sozinha; DATABASE_URL é o
// nome que se põe à mão. Aceita os dois para nenhum dos caminhos exigir
// renomear variável.
const URL_BANCO = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const NA_VERCEL = Boolean(process.env.VERCEL);

// Schema desta loja dentro do banco. Existe porque o projeto da Supabase é
// COMPARTILHADO com outra loja, e os nomes de tabela desta base de código são
// genéricos (`orders`, `products`, `settings`): duas lojas no mesmo schema
// escreveriam pedido na mesma tabela, e depois de os pedidos se intercalarem
// não haveria como separar.
//
// `public` não entra no caminho de propósito. Com ele como reserva, uma tabela
// que faltasse aqui seria encontrada no schema da OUTRA loja — e a falha seria
// silenciosa, do pior tipo: a loja funcionando e gravando no lugar errado.
// `extensions` entra porque é onde a Supabase instala função de extensão.
const SCHEMA = (process.env.DB_SCHEMA || 'public').trim();

const limpar = (params) => (params || []).map((v) => (v === undefined ? null : v));

let driver; // { query, exec, transacao, nome }

async function abrirPg() {
  const { default: pg } = await import('pg');
  // COUNT(*) e SUM() voltam como bigint/numeric, que o driver entrega como
  // TEXTO para não perder precisão. Aqui tudo é centavo e epoch em ms — cabe
  // folgado em Number —, e texto quebraria toda conta do painel ("12" + 1).
  pg.types.setTypeParser(20, (v) => Number(v));
  pg.types.setTypeParser(1700, (v) => Number(v));

  // `sslmode` sai da URL porque, presente, ele manda mais que a opção `ssl`
  // abaixo — e as versões novas do driver tratam `require` como verificação
  // completa de cadeia, que o pooler da Supabase não passa sem o CA dela.
  const u = new URL(URL_BANCO);
  u.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);

  const pool = new pg.Pool({
    connectionString: u.toString(),
    // Vai no pacote de ABERTURA da conexão, então vale para toda conexão que o
    // pool criar. Foi medido no pooler em modo transação da Supabase: sobrevive
    // (um `SET` solto não sobreviveria, porque cada consulta pode cair numa
    // conexão diferente).
    ...(SCHEMA === 'public' ? {} : { options: `-c search_path=${SCHEMA},extensions` }),
    ssl: local ? false : { rejectUnauthorized: false },
    // Poucas conexões por instância: quem multiplica é a Vercel, abrindo
    // instâncias. O pooler da Supabase junta tudo do outro lado.
    max: Number(process.env.PG_POOL_MAX) || 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // Erro em conexão OCIOSA (o pooler derrubou) chega por aqui. Sem ouvinte,
  // vira exceção não tratada e derruba o processo.
  pool.on('error', (e) => console.error('[pg] conexão ociosa caiu:', e.message));

  // Na Vercel a instância é congelada entre requisições; isto fecha as
  // conexões ociosas antes do congelamento, em vez de deixá-las morrer do
  // outro lado e estourar na requisição seguinte.
  if (NA_VERCEL) {
    try {
      const { attachDatabasePool } = await import('@vercel/functions');
      if (typeof attachDatabasePool === 'function') attachDatabasePool(pool);
    } catch { /* versão sem o helper: o pool se vira com o idleTimeout */ }
  }

  const cliente = (c) => ({
    query: async (sql, params) => {
      const r = await c.query(sql, limpar(params));
      return { rows: r.rows || [], rowCount: r.rowCount || 0 };
    },
    // Sem parâmetros o driver usa o protocolo simples, que aceita vários
    // comandos separados por ponto e vírgula — é o que o esquema precisa.
    exec: async (sql) => { await c.query(sql); },
  });

  // Confere que o schema pedido está REALMENTE valendo, antes de qualquer
  // gravação. Se o parâmetro de abertura não pegar (mudança no pooler, string
  // de conexão trocada, schema apagado), a loja escreveria no `public` — que
  // aqui é o schema de outra loja. Melhor não subir do que gravar no lugar
  // errado: quem chama tenta de novo na requisição seguinte.
  if (SCHEMA !== 'public') {
    const r = await pool.query('SELECT current_schema() AS s');
    const atual = r.rows[0]?.s;
    if (atual !== SCHEMA) {
      await pool.end();
      throw new Error(`DB_SCHEMA=${SCHEMA} não está valendo (o banco respondeu "${atual}"). Recusando gravar para não misturar com outra loja.`);
    }
  }

  return {
    nome: `postgres ${u.hostname}${SCHEMA === 'public' ? '' : ` schema ${SCHEMA}`}`,
    ...cliente(pool),
    async transacao(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(cliente(c));
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    fechar: () => pool.end(),
  };
}

async function abrirPglite() {
  if (NA_VERCEL) {
    throw new Error('DATABASE_URL não configurada. Na Vercel o banco precisa ser a Supabase — cadastre a variável no projeto.');
  }
  const { PGlite, types } = await import('@electric-sql/pglite');
  const pasta = process.env.PGLITE_DIR
    || join(process.env.DATA_DIR || join(__dirname, '..', 'data'), 'pg');
  // O PGlite cria a pasta dele, mas NÃO cria as de cima: apontar para
  // `data/pg` numa máquina sem `data/` falhava com ENOENT, e a mensagem não
  // deixava claro que faltava só um diretório.
  (await import('node:fs')).default.mkdirSync(pasta, { recursive: true });
  const db = new PGlite(pasta, {
    // Mesma regra do driver de produção: bigint e numeric como Number.
    parsers: {
      [types.INT8]: (v) => Number(v),
      [types.NUMERIC]: (v) => Number(v),
    },
  });
  await db.waitReady;

  const cliente = (c) => ({
    query: async (sql, params) => {
      const r = await c.query(sql, limpar(params));
      return { rows: r.rows || [], rowCount: r.affectedRows ?? (r.rows || []).length };
    },
    exec: async (sql) => { await c.exec(sql); },
  });

  return {
    nome: `pglite ${pasta}`,
    ...cliente(db),
    transacao: (fn) => db.transaction((tx) => fn(cliente(tx))),
    fechar: () => db.close(),
  };
}

let abrindo = null;
async function conexao() {
  if (driver) return driver;
  if (!abrindo) {
    abrindo = (URL_BANCO ? abrirPg() : abrirPglite())
      .then((d) => { driver = d; console.log(`[db] banco: ${d.nome}`); return d; })
      // Falhou? Esquece a tentativa, para a próxima requisição tentar de novo
      // em vez de repetir para sempre o erro guardado.
      .catch((e) => { abrindo = null; throw e; });
  }
  return abrindo;
}

// ------------------------------------------------------- consultas em voo
// Toda consulta em andamento fica registrada aqui. Serve para UMA coisa: a
// resposta HTTP esperar as gravações terminarem antes de sair (ver
// `aguardarBanco`, usado no app.js).
//
// Com SQLite isso não existia porque gravar era síncrono — quando o código
// chegava no res.send, o dado já estava no disco. Agora gravar leva alguns
// milissegundos, e na Vercel a instância pode ser congelada assim que a
// resposta sai: uma gravação disparada sem `await` ficaria pela metade.
const emVoo = new Set();

export function rastrear(promessa) {
  emVoo.add(promessa);
  // then nos dois ramos (e não finally) para não criar uma promessa rejeitada
  // sem dono: quem trata o erro é quem chamou a consulta.
  const tirar = () => emVoo.delete(promessa);
  promessa.then(tirar, tirar);
  return promessa;
}

export async function aguardarBanco() {
  // Laço, e não uma espera só: uma gravação pode disparar outra ao terminar
  // (ler o pedido e então atualizar), e a segunda só aparece depois.
  let voltas = 0;
  while (emVoo.size && voltas < 50) {
    await Promise.allSettled([...emVoo]);
    await new Promise((ok) => setImmediate(ok));
    voltas += 1;
  }
}

export const temConsultaEmVoo = () => emVoo.size > 0;

export function query(sql, params) {
  return rastrear((async () => (await conexao()).query(sql, params))());
}

export function exec(sql) {
  return rastrear((async () => (await conexao()).exec(sql))());
}

export function transacao(fn) {
  return rastrear((async () => (await conexao()).transacao(fn))());
}

export async function fechar() {
  await aguardarBanco();
  if (driver?.fechar) await driver.fechar();
  driver = null;
  abrindo = null;
}

export const usandoPostgresReal = Boolean(URL_BANCO);

export default { query, exec, transacao, fechar, rastrear, aguardarBanco };
