// Catálogo a partir do products.json PÚBLICO da loja Shopify.
//
// Existe para a loja que mantém a vitrine na Shopify e usa daqui só o
// checkout. Nesse arranjo o carrinho manda o id REAL da variante
// (ex.: 48568054415582), e o importador de CSV não serve: ele inventa ids no
// formato `handle::opção`, que nunca bateriam.
//
// Também dispensa credencial: products.json é público, o mesmo que o
// navegador de qualquer visitante lê. Não substitui a Admin API — sem ela o
// pedido não é espelhado na Shopify —, mas resolve preço, título e imagem,
// que é o que o checkout precisa para não confiar no preço vindo do front.
const POR_PAGINA = 250;
const MAX_PAGINAS = 20;

const cents = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

// Aceita "knifelab.store", "https://knifelab.store" ou a URL do json inteira.
export function urlDoCatalogo(base) {
  let u = String(base || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, '');
  return /products\.json$/i.test(u) ? u : `${u}/products.json`;
}

export async function lerCatalogoShopifyJson(base, { fetchImpl = fetch } = {}) {
  const url = urlDoCatalogo(base);
  if (!url) throw new Error('URL da loja vazia');

  const brutos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await fetchImpl(`${url}?limit=${POR_PAGINA}&page=${pagina}`, {
      headers: { 'User-Agent': 'estilodeartista-checkout', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
    const j = await r.json();
    const lote = j?.products || [];
    if (!lote.length) break;
    brutos.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }

  let semPreco = 0;
  const products = brutos.map((p, i) => {
    const imgs = (p.images || []).map((im) => im.src).filter(Boolean);
    const variants = (p.variants || []).map((v, k) => {
      const preco = cents(v.price);
      const de = cents(v.compare_at_price);
      if (!preco) { semPreco++; return null; }
      return {
        // o id REAL da Shopify — é o que o carrinho da loja envia
        id: String(v.id),
        option: v.title && v.title !== 'Default Title' ? v.title : '',
        sku: v.sku || '',
        priceCents: preco,
        compareCents: de && de > preco ? de : null,
        available: v.available !== false,
        position: k + 1,
      };
    }).filter(Boolean);

    return {
      id: String(p.id),
      handle: p.handle,
      title: p.title || '',
      bodyHtml: p.body_html || '',
      vendor: p.vendor || '',
      tags: Array.isArray(p.tags) ? p.tags
        : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      image: imgs[0] || '',
      images: imgs,
      status: 'active',
      position: i + 1,
      variants,
    };
  }).filter((p) => p.title && p.variants.length);

  return {
    products,
    stats: {
      lidos: brutos.length,
      importados: products.length,
      variantes: products.reduce((s, p) => s + p.variants.length, 0),
      semPreco,
      semImagem: products.filter((p) => !p.image).length,
    },
  };
}

export default { lerCatalogoShopifyJson, urlDoCatalogo };
