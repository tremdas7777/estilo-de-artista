import dotenv from 'dotenv';
dotenv.config();

const {
  PORT,
  APP_URL,
  RENDER_EXTERNAL_URL,
  CURRENCY,
  PROMO_ELIGIBLE_PRICE_CENTS,
  PROMO_MIN_QTY,
  PROMO_NUM,
  PROMO_DEN,
  PROMO_LABEL,
  PROMO_HANDLES,
  PAYSHARK_BASE_URL,
  PAYSHARK_API_KEY,
  PIXGATE_BASE_URL,
  PIXGATE_API_KEY,
  SOLUTION_BASE_URL,
  SOLUTION_API_KEY,
  UMBRELLA_BASE_URL,
  UMBRELLA_API_KEY,
  COREON_BASE_URL,
  COREON_API_KEY,
  COREON_API_SECRET,
  COREON_WEBHOOK_SECRET,
  COREON_DOMAIN,
  DEFAULT_GATEWAY,
  SHOPIFY_SHOP,
  SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_ADMIN_TOKEN,
  FB_PIXEL_ID,
  FB_CAPI_TOKEN,
  FB_TEST_EVENT_CODE,
  UTMIFY_PIXEL_ID,
  UTMIFY_API_TOKEN,
  RASTREIO_BASE_URL,
  RASTREIO_API_KEY,
  DEV_TOOLS,
  ADMIN_USER,
  ADMIN_PASSWORD,
} = process.env;

// Em produção o Render injeta RENDER_EXTERNAL_URL e a Vercel injeta VERCEL_URL
// (sem o https:// na frente, e apontando para a publicação, não para o domínio
// próprio). APP_URL sobrescreve as duas e é o que se usa com domínio próprio —
// na Vercel ela é obrigatória em produção, porque VERCEL_URL muda a cada
// publicação e um link de pedido com esse endereço morre no deploy seguinte.
const urlDaVercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const appUrl = (APP_URL || RENDER_EXTERNAL_URL || urlDaVercel || `http://localhost:${PORT || 3000}`).replace(/\/$/, '');

const config = {
  port: Number(PORT) || 3000,
  appUrl,
  currency: CURRENCY || 'BRL',

  // Nome da loja desta instalação. Sai na descrição da cobrança que o cliente
  // vê no app do banco e no extrato, então precisa acompanhar a loja — uma
  // segunda loja rodando este código com o nome da PRIMEIRA no PIX assustaria o
  // comprador e viraria contestação. Mesmo LOJA_NOME usado nas páginas.
  lojaNome: process.env.LOJA_NOME || 'Estilo de Artista',

  promo: {
    eligiblePriceCents: Number(PROMO_ELIGIBLE_PRICE_CENTS) || 9900,
    minQty: Number(PROMO_MIN_QTY) || 2,
    num: Number(PROMO_NUM) || 4900,
    den: Number(PROMO_DEN) || 19800,
    label: PROMO_LABEL || 'PROMO 2 PARES',
    // Restringe a promo a certos produtos, POR CIMA do filtro de preço.
    // Lista de pedaços de handle separados por vírgula; o item entra se o
    // handle dele contiver qualquer um deles. VAZIA = sem restrição, que é o
    // comportamento de sempre (aqui: todo par no preço elegível entra).
    //
    // Existe porque "preço" sozinho não separa produto na loja em que vários
    // itens diferentes custam o mesmo — na Knife Lab os kits de time e as
    // facas avulsas custam ambos R$ 149,90, e só os kits estão na promoção.
    // É pedaço de handle, e não lista fechada, para time novo cadastrado
    // depois já entrar sem precisar de deploy.
    handles: String(PROMO_HANDLES || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // "código" do desconto enviado à Shopify pra o total bater com o PIX
    code: 'PROMO2PARES',
  },

  shipping: {
    // 3 opções fixas, sempre disponíveis (frete grátis para sempre).
    options: [
      { id: 'gratis', name: 'Frete Grátis', cents: 0, eta: '7 dias úteis' },
      { id: 'padrao', name: 'Frete Padrão', cents: 1740, eta: '3 a 5 dias úteis' },
      { id: 'expresso', name: 'Frete Expresso', cents: 2790, eta: '1 a 2 dias úteis' },
    ],
  },

  payshark: {
    baseUrl: (PAYSHARK_BASE_URL || 'https://api.gatewaypayshark.com.br/v1').replace(/\/$/, ''),
    apiKey: PAYSHARK_API_KEY || '',
  },

  pixgate: {
    baseUrl: (PIXGATE_BASE_URL || 'https://app.pixgateip.com').replace(/\/$/, ''),
    apiKey: PIXGATE_API_KEY || '',
  },

  solution: {
    baseUrl: (SOLUTION_BASE_URL || 'https://api.solutionpayments.com.br').replace(/\/$/, ''),
    apiKey: SOLUTION_API_KEY || '',
  },

  umbrella: {
    baseUrl: (UMBRELLA_BASE_URL || 'https://api-gateway.umbrellapag.com/api').replace(/\/$/, ''),
    apiKey: UMBRELLA_API_KEY || '',
  },

  // Coreon Pay. Diferente dos outros: além da chave pública (X-Api-Key) exige
  // o secret (X-Api-Secret) em toda chamada, e o webhook é cadastrado no
  // painel deles — não vai URL de postback por cobrança. O webhookSecret é o
  // que valida a assinatura HMAC do postback (no painel vem com `whsec_`).
  coreon: {
    baseUrl: (COREON_BASE_URL || 'https://app.coreonpay.com').replace(/\/$/, ''),
    apiKey: COREON_API_KEY || '',
    apiSecret: COREON_API_SECRET || '',
    webhookSecret: COREON_WEBHOOK_SECRET || '',
    // Campo obrigatório no payload da cobrança. Sai do domínio do próprio app
    // pra segunda loja rodando este código não mandar o domínio da primeira.
    domain: COREON_DOMAIN || appUrl.replace(/^https?:\/\//, '').split('/')[0],
  },

  // Gateway padrão quando ainda não há escolha salva no banco (o /admin sobrescreve).
  gatewayDefault: DEFAULT_GATEWAY || 'umbrella',

  shopify: {
    shop: SHOPIFY_SHOP || '',
    apiVersion: SHOPIFY_API_VERSION || '2025-01',
    scopes: SHOPIFY_SCOPES || 'read_products,write_orders,read_orders',
    clientId: SHOPIFY_CLIENT_ID || '',
    clientSecret: SHOPIFY_CLIENT_SECRET || '',
    // Token estático (opcional). Se ausente, usamos o token obtido via OAuth (SQLite).
    adminToken: SHOPIFY_ADMIN_TOKEN || '',
  },

  facebook: {
    pixelId: FB_PIXEL_ID || '',
    capiToken: FB_CAPI_TOKEN || '',
    testEventCode: FB_TEST_EVENT_CODE || '',
    apiVersion: 'v21.0',
  },

  // UTMify: atribuição de campanha. O pixelId é público (fica no HTML);
  // o apiToken é SEGREDO — é ele que lança as vendas no painel deles.
  utmify: {
    pixelId: UTMIFY_PIXEL_ID || '',
    apiToken: UTMIFY_API_TOKEN || '',
    apiUrl: 'https://api.utmify.com.br/api-credentials/orders',
  },

  // Rastreio próprio (RotaSync): é ele que tem as etapas REAIS da encomenda.
  // A chave da loja começa com rk_ e vai em "Authorization: Bearer <chave>"
  // (conferido contra a API em 06/10/2026). Sem chave, nada de rastreio é
  // chamado — quem integrar tem que tratar isso como desligado, não como erro.
  rastreio: {
    baseUrl: (RASTREIO_BASE_URL || 'https://rotasync.online').replace(/\/$/, ''),
    apiKey: RASTREIO_API_KEY || '',
  },

  devTools: DEV_TOOLS === '1',

  admin: {
    user: ADMIN_USER || 'admin',
    // Sem senha => /admin fica DESATIVADO (não expõe dados de cliente).
    password: ADMIN_PASSWORD || '',
  },
};

// Avisos (não quebram o boot — permitem subir e configurar depois)
export function warnMissing() {
  const miss = [];
  // Só cobra a chave do gateway padrão — os outros são opções inativas no /admin.
  const gw = config.gatewayDefault;
  if (!config[gw]?.apiKey) miss.push(`${gw.toUpperCase()}_API_KEY`);
  if (!config.shopify.shop) miss.push('SHOPIFY_SHOP');
  if (!config.shopify.adminToken && !(config.shopify.clientId && config.shopify.clientSecret))
    miss.push('SHOPIFY_ADMIN_TOKEN ou (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)');
  if (!config.facebook.capiToken) miss.push('FB_CAPI_TOKEN (Purchase server-side desativado)');
  if (miss.length) console.warn('[config] variáveis ausentes:', miss.join(', '));
}

export default config;
