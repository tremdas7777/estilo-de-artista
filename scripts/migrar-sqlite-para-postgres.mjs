// Copia os dados do banco SQLite antigo (o do Render) para o Postgres novo
// (Supabase). Roda UMA vez, na virada — depois disso a fonte é o Postgres.
//
//   1. Baixe o checkout.sqlite do disco do Render (Shell: o arquivo fica em
//      $DATA_DIR/checkout.sqlite) para a sua máquina.
//   2. Aponte o Postgres de destino em DATABASE_URL (a mesma string da Supabase
//      que vai na Vercel).
//   3. Rode:
//        node scripts/migrar-sqlite-para-postgres.mjs caminho/do/checkout.sqlite
//      Acrescente --so-catalogo para copiar SÓ produtos/variantes (o catálogo
//      já vem do CSV, então normalmente você quer é migrar os PEDIDOS: nesse
//      caso NÃO use essa flag).
//
// É idempotente por tabela: usa upsert por chave, então rodar de novo não
// duplica. NÃO apaga nada do destino — só insere/atualiza.
//
// better-sqlite3 é dependência de DESENVOLVIMENTO (não vai pro deploy da
// Vercel), então este script só roda onde você fez `npm install` completo.
import Database from 'better-sqlite3';
import { query, transacao, fechar } from '../src/pg.js';
import { criarEsquema } from '../src/db.js';

const arquivo = process.argv[2];
const soCatalogo = process.argv.includes('--so-catalogo');
if (!arquivo) {
  console.error('uso: node scripts/migrar-sqlite-para-postgres.mjs <checkout.sqlite> [--so-catalogo]');
  process.exit(1);
}
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error('defina DATABASE_URL (a string da Supabase) antes de rodar');
  process.exit(1);
}

const sq = new Database(arquivo, { readonly: true });

// Tabelas que existem no SQLite da AvaliaJá. A ordem não importa (não há FK),
// mas products vem antes de variants por clareza.
const TABELAS = soCatalogo
  ? ['products', 'variants']
  : ['orders', 'shopify_tokens', 'settings', 'upsell_views', 'products', 'variants',
    'emails', 'push_subs', 'admin_access', 'ip_geo'];

// Colunas com aspas no Postgres (palavra reservada / maiúscula preservada).
const CITADAS = new Set(['option', 'position']);
const col = (c) => (CITADAS.has(c) ? `"${c}"` : c);

// A chave de conflito de cada tabela (para o upsert). BIGSERIAL (emails,
// admin_access) recria o id no destino, então nessas a gente NÃO manda a coluna
// id e deixa o Postgres gerar — senão a sequência fica atrás dos ids copiados e
// o próximo insert de produção colide.
const CHAVE = {
  orders: 'id', shopify_tokens: 'shop', settings: 'key', upsell_views: 'order_id',
  products: 'id', variants: 'id', push_subs: 'endpoint', ip_geo: 'ip',
};
const SERIAL = new Set(['emails', 'admin_access']);

function existeTabela(nome) {
  return !!sq.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
}

async function migrarTabela(tabela) {
  if (!existeTabela(tabela)) { console.log(`- ${tabela}: não existe no SQLite, pulando`); return; }
  const linhas = sq.prepare(`SELECT * FROM ${tabela}`).all();
  if (!linhas.length) { console.log(`- ${tabela}: 0 linhas`); return; }

  let colunas = Object.keys(linhas[0]);
  if (SERIAL.has(tabela)) colunas = colunas.filter((c) => c !== 'id');

  const chave = CHAVE[tabela];
  const setClause = colunas.filter((c) => c !== chave).map((c) => `${col(c)}=EXCLUDED.${col(c)}`).join(', ');
  const conflito = chave
    ? `ON CONFLICT (${col(chave)}) DO ${setClause ? `UPDATE SET ${setClause}` : 'NOTHING'}`
    : ''; // serial: sem chave natural, só insere

  let n = 0;
  const LOTE = 500;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const pedaco = linhas.slice(i, i + LOTE);
    await transacao(async (t) => {
      for (const linha of pedaco) {
        const valores = colunas.map((c) => linha[c]);
        const ph = colunas.map((_, j) => `$${j + 1}`).join(', ');
        await t.query(
          `INSERT INTO ${tabela} (${colunas.map(col).join(', ')}) VALUES (${ph}) ${conflito}`,
          valores,
        );
        n++;
      }
    });
    process.stdout.write(`\r- ${tabela}: ${n}/${linhas.length}`);
  }
  console.log(`\r- ${tabela}: ${n} linhas copiadas        `);
}

console.log(`Migrando ${arquivo} -> Postgres${soCatalogo ? ' (só catálogo)' : ''}\n`);
await criarEsquema(); // garante as tabelas no destino
for (const t of TABELAS) await migrarTabela(t);

// Conferência: o que entrou de pedido, para comparar com o painel antigo antes
// de desligar o Render. Sem isto a migração termina dizendo "pronto" mesmo se
// metade dos pedidos tiver ficado para trás.
const r = await query(`SELECT
  (SELECT COUNT(*) FROM orders)                            AS pedidos,
  (SELECT COUNT(*) FROM orders WHERE status = 'paid')      AS pagos,
  (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE status = 'paid') AS centavos,
  (SELECT COUNT(*) FROM products)                          AS produtos,
  (SELECT COUNT(*) FROM variants)                          AS variantes`);
const c = r.rows[0];
console.log(`\nNo Postgres agora: ${c.pedidos} pedidos (${c.pagos} pagos, R$ ${(c.centavos / 100).toFixed(2)}), ${c.produtos} produtos, ${c.variantes} variantes.`);

// As sequências das tabelas BIGSERIAL não avançam sozinhas com INSERT que
// especifica id; como aqui deixamos o id ser gerado, elas já estão certas.
// Mas se um dia você copiar id à mão, é aqui que se acerta:
//   SELECT setval(pg_get_serial_sequence('emails','id'), (SELECT MAX(id) FROM emails));

sq.close();
await fechar();
console.log('\nPronto. Confira alguns pedidos no painel antes de desligar o Render.');
