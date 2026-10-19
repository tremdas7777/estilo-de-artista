// Importa o catálogo de um export de produtos da Shopify (CSV) para o banco local.
// Depois disso a loja não precisa mais da Admin API pra listar/precificar produtos.
//
//   node scripts/import-catalogo.mjs caminho/products_export.csv [--preco=99] [--dry]
//
// A leitura do CSV mora em src/checkout/importCsv.js porque o servidor usa a
// mesma rotina no boot (seed) quando o banco está vazio.
// O import roda em transação: se der erro no meio, o catálogo antigo continua.
import { importCatalog, catalogCount } from '../src/db.js';
import { fechar } from '../src/pg.js';
import { lerCatalogoCsv } from '../src/checkout/importCsv.js';

const file = process.argv[2];
const dry = process.argv.includes('--dry');
// --preco=99 força o preço de TODAS as variantes (o CSV está com o preço antigo).
const precoArg = process.argv.find((a) => a.startsWith('--preco='));
const precoCents = precoArg ? Math.round(parseFloat(precoArg.split('=')[1]) * 100) : null;
if (precoArg && !Number.isFinite(precoCents)) {
  console.error('--preco inválido (use --preco=99)');
  process.exit(1);
}
if (!file) {
  console.error('uso: node scripts/import-catalogo.mjs <arquivo.csv> [--preco=99] [--dry]');
  process.exit(1);
}

const { products, stats } = lerCatalogoCsv(file, { precoCents });

console.log('--- leitura do CSV ---');
console.log(`linhas.............. ${stats.linhas}`);
console.log(`produtos no arquivo. ${stats.noArquivo}`);
console.log(`produtos válidos.... ${stats.validos}  (descartados ${stats.descartados}: rascunho/arquivado/sem variante)`);
console.log(`variantes........... ${stats.variantes}`);
console.log(`tags distintas...... ${stats.tags}`);
if (stats.semImagem) console.log(`AVISO: ${stats.semImagem} produto(s) sem imagem`);
if (stats.semPreco) console.log(`AVISO: ${stats.semPreco} variante(s) sem preço, ignoradas`);

if (!products.length) { console.error('nada pra importar — abortando'); process.exit(1); }

if (dry) { console.log('\n--dry: nada foi gravado.'); process.exit(0); }

// `await` nos dois: com o banco em Postgres estas funções devolvem promessa, e
// sem esperar o script terminaria ANTES de a gravação chegar ao banco — dizendo
// que importou, sem ter importado.
const res = await importCatalog(products);
console.log('\n--- gravado no banco ---');
console.log(`produtos ${res.products} · variantes ${res.variants}`);
console.log('conferência:', JSON.stringify(await catalogCount()));
// Fecha a conexão, senão o processo fica pendurado esperando o pool.
await fechar();
