import config from '../config.js';
import { getToken } from '../db.js';

// Resolve o token: OAuth (banco) tem prioridade; senão o estático do .env.
// Virou assíncrona junto com o banco — quem chama é `request`, que já era.
async function resolveToken() {
  return (await getToken(config.shopify.shop)) || config.shopify.adminToken || null;
}

function baseUrl() {
  return `https://${config.shopify.shop}/admin/api/${config.shopify.apiVersion}`;
}

async function request(method, path, body) {
  const token = await resolveToken();
  if (!token) throw new Error('Shopify sem token (instale o app via OAuth ou defina SHOPIFY_ADMIN_TOKEN).');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000); // não deixa a chamada pendurar
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }

  if (!res.ok) {
    const err = new Error(`Shopify ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Assíncrona porque o token pode vir do banco (OAuth). `Boolean` de uma
// promessa seria SEMPRE verdadeiro, e a loja acharia que tem token sem ter.
export async function hasToken() {
  return Boolean(await resolveToken());
}

// Produtos ativos (paginado simples até 250; suficiente para catálogo de checkout).
export async function fetchActiveProducts() {
  const data = await request(
    'GET',
    '/products.json?status=active&limit=250&fields=id,title,handle,images,image,variants,status'
  );
  return data?.products || [];
}

export async function fetchVariant(variantId) {
  const data = await request('GET', `/variants/${variantId}.json`);
  return data?.variant || null;
}

export async function fetchProduct(productId) {
  const data = await request(
    'GET',
    `/products/${productId}.json?fields=id,title,handle,image,images,variants`
  );
  return data?.product || null;
}

// Cria pedido. payload = objeto "order" já montado (orders.js cuida do shape).
export async function createOrder(order) {
  const data = await request('POST', '/orders.json', { order });
  return data?.order || null;
}

// Registra transação de pagamento (pending -> paid).
export async function createTransaction(orderId, transaction) {
  const data = await request('POST', `/orders/${orderId}/transactions.json`, { transaction });
  return data?.transaction || null;
}

export default { hasToken, fetchActiveProducts, fetchVariant, fetchProduct, createOrder, createTransaction };
