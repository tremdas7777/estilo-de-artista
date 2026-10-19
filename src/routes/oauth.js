import { Router } from 'express';
import crypto from 'node:crypto';
import config from '../config.js';
import { saveToken } from '../db.js';

const router = Router();

// nonces em memória (1 instância no Render Starter). nonce -> expiração.
const nonces = new Map();
function newNonce() {
  const n = crypto.randomBytes(16).toString('hex');
  nonces.set(n, Date.now() + 10 * 60 * 1000);
  return n;
}
function consumeNonce(n) {
  const exp = nonces.get(n);
  nonces.delete(n);
  return exp && exp > Date.now();
}

function validShop(shop) {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// Verifica o HMAC do callback (SHA-256 do querystring sem 'hmac', com o client secret).
function verifyHmac(query) {
  const { hmac, signature, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');
  const digest = crypto
    .createHmac('sha256', config.shopify.clientSecret)
    .update(message)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(String(hmac), 'utf8'));
  } catch {
    return false;
  }
}

// Início da instalação: /install?shop=nation-47.myshopify.com
router.get(['/install', '/auth'], (req, res) => {
  const shop = String(req.query.shop || config.shopify.shop);
  if (!validShop(shop)) return res.status(400).send('shop inválido (use xxx.myshopify.com)');
  if (!config.shopify.clientId) return res.status(500).send('SHOPIFY_CLIENT_ID não configurado');

  const nonce = newNonce();
  const redirectUri = `${config.appUrl}/auth/callback`;
  const url =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(config.shopify.clientId)}` +
    `&scope=${encodeURIComponent(config.shopify.scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;
  res.redirect(url);
});

// Callback: troca code por access_token.
router.get('/auth/callback', async (req, res) => {
  const { shop, hmac, code, state } = req.query;
  if (!validShop(String(shop))) return res.status(400).send('shop inválido');
  if (!consumeNonce(String(state))) return res.status(403).send('state inválido/expirado');
  if (!hmac || !verifyHmac(req.query)) return res.status(403).send('HMAC inválido');

  try {
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.shopify.clientId,
        client_secret: config.shopify.clientSecret,
        code,
      }),
    });
    if (!r.ok) throw new Error(`token exchange ${r.status}: ${await r.text()}`);
    const data = await r.json();
    await saveToken(String(shop), data.access_token, data.scope);
    console.log('[oauth] app instalado em', shop);
    res.send('App instalado com sucesso. Pode fechar esta aba e voltar ao checkout.');
  } catch (e) {
    console.error('[oauth] falha:', e.message);
    res.status(500).send('Falha ao instalar o app. Veja os logs.');
  }
});

export default router;
