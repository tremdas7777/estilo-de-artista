// Abastece o catálogo no boot quando o banco está vazio.
//
// Por que existe: o SQLite fica no disco persistente do Render e NÃO vai no
// git. Num deploy para disco novo (primeira vez, disco recriado, ambiente de
// teste) a loja subiria sem nenhum produto e cairia no fallback da Shopify.
// Com o CSV versionado, qualquer ambiente se abastece sozinho.
//
// seedCatalogo() só roda com o catálogo vazio: nunca sobrescreve um import
// feito à mão. Para regravar por cima do que já está no ar existe
// reimportarCatalogo(), que é explícito e sai do botão do /admin.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { catalogCount, importCatalog, ajustarPrecos } from '../db.js';
import { lerCatalogoCsv, TIPO_PRECO_UNICO } from './importCsv.js';
import { lerCatalogoShopifyJson } from './importShopifyJson.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Preço de venda vigente. CATALOGO_PRECO_CENTS manda; sem ela, cai no preço
// elegível da promoção — é o mesmo valor unitário e já está configurado no
// serviço, o que evita a loja subir com o preço velho do export se a primeira
// variável não tiver sido sincronizada no painel.
function precoDeVenda() {
  for (const v of [process.env.CATALOGO_PRECO_CENTS, process.env.PROMO_ELIGIBLE_PRICE_CENTS]) {
    const n = parseInt(v || '', 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// Caminho do CSV versionado. Uma função só pra que o boot e o /admin nunca
// apontem para arquivos diferentes.
export function caminhoCsv() {
  const rel = process.env.CATALOGO_CSV || 'data-import/products_export.csv';
  return { rel, file: isAbsolute(rel) ? rel : join(raiz, rel) };
}

// Reimporta o CSV POR CIMA de um catálogo que já existe — é o que o boot se
// recusa a fazer. Existe porque produto novo entra pelo CSV versionado, e sem
// isto só dava pra publicá-lo abrindo a Shell do Render.
//
// O DELETE + INSERT do importCatalog roda em UMA transação: se a leitura ou a
// gravação falhar, o catálogo que está no ar continua de pé. Pedidos ficam em
// outras tabelas e não são tocados.
export async function reimportarCatalogo() {
  const { rel, file } = caminhoCsv();
  if (!fs.existsSync(file)) throw new Error(`sem CSV em ${rel}`);

  const precoCents = precoDeVenda();
  const { products, stats } = lerCatalogoCsv(file, { precoCents });

  // Guarda-chuva: um CSV truncado/corrompido não pode esvaziar a loja.
  // Sem isto, importCatalog apagaria o catálogo e não poria nada no lugar.
  if (!products.length) throw new Error('CSV sem produtos válidos — nada foi alterado');

  const antes = await catalogCount();
  const res = await importCatalog(products);
  console.log(`[admin] catálogo reimportado de ${rel}: ${res.products} produtos, ${res.variants} variantes`
    + (precoCents ? ` (preço forçado ${(precoCents / 100).toFixed(2)})` : ''));
  return { ...res, antes, stats, rel, precoCents };
}

// Loja que mantém a vitrine na Shopify e usa daqui só o checkout: o catálogo
// vem do products.json PÚBLICO dela, não do CSV. É o único jeito de os ids de
// variante baterem com o que o carrinho da Shopify envia — o CSV inventa ids
// no formato `handle::opção`. Sem CATALOGO_JSON_URL nada muda.
export async function seedCatalogoJson() {
  const base = process.env.CATALOGO_JSON_URL;
  if (!base) return { pulou: 'sem CATALOGO_JSON_URL' };

  const { products } = await catalogCount();
  if (products > 0) return { pulou: 'catálogo já tem produtos', products };

  try {
    const { products: lista, stats } = await lerCatalogoShopifyJson(base);
    if (!lista.length) return { erro: 'products.json sem produtos válidos' };
    const res = await importCatalog(lista);
    console.log(`[seed] catálogo importado de ${base}: ${res.products} produtos, ${res.variants} variantes`
      + (stats.semImagem ? ` — ${stats.semImagem} sem imagem` : ''));
    return { ...res, stats };
  } catch (e) {
    // Catálogo vazio é ruim, mas derrubar o boot é pior: o /admin continua
    // acessível para reimportar à mão.
    console.error('[seed] falhou lendo products.json:', e.message);
    return { erro: e.message };
  }
}

export async function seedCatalogo() {
  const { rel, file } = caminhoCsv();
  const precoCents = precoDeVenda();

  const { products } = await catalogCount();
  if (products > 0) {
    // Catálogo já existe: só garante que está no preço certo.
    const n = precoCents ? await ajustarPrecos(precoCents, TIPO_PRECO_UNICO) : 0;
    if (n) console.log(`[seed] ${n} variante(s) realinhadas para ${(precoCents / 100).toFixed(2)}`);
    return { pulou: 'catálogo já tem produtos', products, precoAjustado: n };
  }
  if (!fs.existsSync(file)) return { pulou: `sem CSV em ${rel}` };

  try {
    const { products: lista, stats } = lerCatalogoCsv(file, { precoCents });
    if (!lista.length) return { erro: 'CSV sem produtos válidos' };
    const res = await importCatalog(lista);
    console.log(`[seed] catálogo importado de ${rel}: ${res.products} produtos, ${res.variants} variantes`
      + (precoCents ? ` (preço forçado ${(precoCents / 100).toFixed(2)})` : '')
      + (stats.semImagem ? ` — ${stats.semImagem} sem imagem` : ''));
    return res;
  } catch (e) {
    // Catálogo vazio é ruim, mas derrubar o boot é pior: o checkout e os
    // webhooks de pagamento precisam continuar de pé.
    console.error('[seed] falhou (a loja sobe sem catálogo):', e.message);
    return { erro: e.message };
  }
}

export default { seedCatalogo, reimportarCatalogo, caminhoCsv };
