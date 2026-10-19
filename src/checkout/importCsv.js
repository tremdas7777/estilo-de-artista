// Leitura do export de produtos da Shopify (CSV) -> formato do catálogo local.
// Fica aqui, e não no script, porque o servidor também precisa: num disco novo
// (primeiro deploy, disco recriado) o catálogo nasce vazio e a loja subiria sem
// nenhum produto. Ver seedCatalogo() em src/checkout/seed.js.
import fs from 'node:fs';

// CSV da Shopify tem aspas e quebras de linha dentro de Body (HTML).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// id de variante estável entre importações (o export não traz o id da Shopify).
const slug = (s) => String(s || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Único `Type` governado pelo preço de venda vigente (CATALOGO_PRECO_CENTS).
// A variável existe porque o export da Shopify traz o preço velho DO PAR; ela
// nunca valeu para outra categoria, e desde que a loja passou a vender óculos
// Juliet a diferença importa: sem isto o preço deles seria achatado para o
// valor do tênis no primeiro boot. Produto sem `Type` continua governado —
// é o comportamento de sempre, e todo o catálogo de tênis cai aqui.
export const TIPO_PRECO_UNICO = 'Tênis';

// Lê o CSV e devolve { products, stats } — sem tocar no banco.
export function lerCatalogoCsv(file, { precoCents = null } = {}) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows[0].map((h) => h.trim());
  const col = (name) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`coluna ausente no CSV: ${name}`);
    return i;
  };
  // Colunas que nem todo export traz — ausentes viram -1 e caem no padrão.
  const colOpt = (name) => head.indexOf(name);

  const C = {
    handle: col('Handle'), title: col('Title'), body: col('Body (HTML)'),
    vendor: col('Vendor'), tags: col('Tags'), published: col('Published'),
    opt1: col('Option1 Value'), sku: col('Variant SKU'), qty: col('Variant Inventory Qty'),
    price: col('Variant Price'), compare: col('Variant Compare At Price'),
    img: col('Image Src'), imgPos: col('Image Position'), status: col('Status'),
    tracker: colOpt('Variant Inventory Tracker'), policy: colOpt('Variant Inventory Policy'),
    type: colOpt('Type'),
  };

  const byHandle = new Map();
  let skippedNoPrice = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const handle = (row[C.handle] || '').trim();
    if (!handle) continue;

    if (!byHandle.has(handle)) {
      byHandle.set(handle, {
        id: handle, handle, title: '', bodyHtml: '', vendor: '',
        type: TIPO_PRECO_UNICO,
        tags: [], image: '', images: [], status: 'active', variants: [],
        seenVariant: new Set(),
      });
    }
    const p = byHandle.get(handle);

    // Linhas seguintes do mesmo produto só trazem variante/imagem — não sobrescreve com vazio.
    if (row[C.title]) p.title = row[C.title].trim();
    if (row[C.body]) p.bodyHtml = row[C.body];
    if (row[C.vendor]) p.vendor = row[C.vendor].trim();
    if (C.type >= 0 && row[C.type]) p.type = row[C.type].trim();
    if (row[C.status]) p.status = row[C.status].trim().toLowerCase();
    if (row[C.tags] && !p.tags.length) {
      p.tags = row[C.tags].split(',').map((t) => t.trim()).filter(Boolean);
    }
    const src = (row[C.img] || '').trim();
    if (src && !p.images.includes(src)) {
      const pos = parseInt(row[C.imgPos] || '0', 10) || p.images.length + 1;
      p.images.push(src);
      if (pos === 1 || !p.image) p.image = src;
    }

    const option = (row[C.opt1] || '').trim();
    const price = parseFloat(row[C.price] || '');
    if (option && Number.isFinite(price)) {
      const vid = `${handle}::${slug(option)}`;
      if (!p.seenVariant.has(vid)) {
        p.seenVariant.add(vid);
        const compare = parseFloat(row[C.compare] || '');
        const qty = parseInt(row[C.qty] || '', 10);
        // Estoque: na Shopify, "Inventory Tracker" vazio = estoque NÃO controlado,
        // e a variante vende sempre — a coluna Qty vem 0 e não significa esgotado.
        // Fecha a numeração só quando há rastreamento e a política é recusar sem
        // saldo. Sem isso, um export sem controle de estoque zera a loja inteira.
        const tracker = C.tracker >= 0 ? (row[C.tracker] || '').trim() : '';
        const policy = C.policy >= 0 ? (row[C.policy] || '').trim().toLowerCase() : '';
        const controlaEstoque = !!tracker && policy !== 'continue';

        // O preço de venda vigente só manda no Type que ele governa; fora dele
        // (óculos, e o que vier depois) vale o preço escrito no CSV.
        const forcaPreco = precoCents && p.type === TIPO_PRECO_UNICO ? precoCents : null;
        const finalCents = forcaPreco ?? Math.round(price * 100);
        // Com preço forçado, o preço do CSV vira o "de" (riscado) se for maior.
        const csvCents = Math.round(price * 100);
        const compareFromCsv = Number.isFinite(compare) && compare > price ? Math.round(compare * 100) : null;
        p.variants.push({
          id: vid,
          option,
          sku: (row[C.sku] || '').trim(),
          priceCents: finalCents,
          compareCents: forcaPreco && csvCents > finalCents ? csvCents : compareFromCsv,
          available: controlaEstoque && Number.isFinite(qty) ? qty > 0 : true,
        });
      }
    } else if (option) skippedNoPrice++;
  }

  const all = [...byHandle.values()];
  const products = all
    .filter((p) => p.title && p.variants.length && p.status !== 'draft' && p.status !== 'archived')
    .map(({ seenVariant, ...p }) => p);

  const tags = new Set();
  products.forEach((p) => p.tags.forEach((t) => tags.add(t)));

  return {
    products,
    stats: {
      linhas: rows.length - 1,
      noArquivo: all.length,
      validos: products.length,
      descartados: all.length - products.length,
      variantes: products.reduce((s, p) => s + p.variants.length, 0),
      tags: tags.size,
      semImagem: products.filter((p) => !p.image).length,
      semPreco: skippedNoPrice,
    },
  };
}

export default { lerCatalogoCsv, parseCsv };
