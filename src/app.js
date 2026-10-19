import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config, { warnMissing } from './config.js';
import { proxyConfiavel } from './cloudflare.js';

import storeRoutes from './routes/store.js';
import oauthRoutes from './routes/oauth.js';
import checkoutApi from './routes/checkoutApi.js';
import centralApi from './routes/centralApi.js';
import paysharkWebhook from './routes/paysharkWebhook.js';
import pixWebhook from './routes/pixWebhook.js';
import solutionWebhook from './routes/solutionWebhook.js';
import umbrellaWebhook from './routes/umbrellaWebhook.js';
import coreonWebhook from './routes/coreonWebhook.js';
import adminRoutes from './routes/admin.js';
import { seedCatalogo, seedCatalogoJson } from './checkout/seed.js';
import { aquecerMaisVendidos } from './checkout/maisVendidos.js';
import { pronto, atualizarSettings, faxinaSePreciso } from './db.js';
import { aguardarBanco } from './pg.js';
import { emSegundoPlano } from './segundoPlano.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');

// -------------------------------------------------- banco pronto por request
// Antes o banco era SQLite no disco e subia junto com o processo. Agora é
// Postgres na rede: esta ponte garante, a cada requisição, que a conexão está
// aberta, o esquema criado e as settings frescas — e faz a resposta esperar as
// gravações drenarem antes de a instância congelar (na Vercel isso acontece
// assim que a resposta sai).
//
// `pronto()` guarda o estado: depois da primeira vez é só um retorno imediato.
// Se o banco estava fora do ar na subida, a próxima requisição tenta de novo,
// em vez de a instância ficar quebrada para sempre.
let semeado = false;
app.use(async (req, res, next) => {
  // A resposta só é considerada terminada quando as consultas em voo drenarem.
  // waitUntil (dentro de emSegundoPlano) é o que impede a Vercel de congelar a
  // instância com uma gravação de pedido pela metade.
  res.on('finish', () => { emSegundoPlano(aguardarBanco(), 'drenar banco'); });

  try {
    await pronto();
  } catch (e) {
    console.error('[app] banco indisponível:', e.message);
    // Webhook responde 200 mesmo assim: o gateway reenvia, e derrubar aqui só
    // trocaria "pendente" por "reenvio". As outras rotas dizem a verdade — 503.
    if (req.path.startsWith('/webhooks')) return res.status(200).json({ received: true, deferred: true });
    return res.status(503).type('text/plain').send('Serviço reiniciando, tente de novo em instantes.');
  }

  // Abastece o catálogo uma vez (aqui, não no boot: na Vercel não há um "boot"
  // único). Sem await — a primeira visita não espera o catálogo entrar.
  //
  // Banco novo sobe sem catálogo. Com CATALOGO_JSON_URL o abastecimento vem do
  // products.json da loja Shopify (caso de quem usa só o checkout); sem ela, do
  // CSV versionado. Não trava a requisição se a rede falhar.
  if (!semeado) {
    semeado = true;
    emSegundoPlano(
      seedCatalogoJson()
        .catch((e) => console.error('[seed] json:', e.message))
        .finally(() => seedCatalogo()),
      'seed do catálogo',
    );
    emSegundoPlano(faxinaSePreciso(), 'faxina');
    // Aquece a vitrine "Mais Vendidos": ela é lida de forma síncrona pelas
    // páginas, então sem isto a primeira visita de cada instância mostraria a
    // lista de reserva em vez do ranking de verdade.
    emSegundoPlano(aquecerMaisVendidos(), 'aquecer mais vendidos');
  }

  // Frescor das settings (personalização, gateway ativo, contato…). Quem grava
  // ou administra precisa ver o estado do banco AGORA; a vitrine tolera alguns
  // segundos de atraso e evita uma ida ao banco por página.
  const precisaFresco = req.method !== 'GET'
    || req.path.startsWith('/admin')
    || req.path.startsWith('/webhooks')
    || req.path.startsWith('/api/central');
  try {
    await atualizarSettings({ maxIdadeMs: precisaFresco ? 0 : 5000 });
  } catch (e) {
    // Settings velhas não derrubam a loja: segue com o que há em memória.
    console.error('[app] settings não atualizadas:', e.message);
  }
  next();
});

// Cabeçalhos de segurança, em toda resposta.
//
// Sem CSP nesta loja, de propósito: a lista de domínios liberados teria de
// bater exatamente com os pixels e fontes que ELA carrega, e CSP apertada
// demais bloqueia em SILÊNCIO — a loja segue vendendo e o rastreio de
// campanha morre sem ninguém notar. O XSS já está fechado na origem, no
// jsonSeguro do pages.js; isto aqui é reforço, não a defesa principal.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // O link da oferta e o da recuperação levam token na URL: sem isto, um
  // clique em link externo mandaria a URL inteira no Referer.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
// 1, e não `true`. Com `true` o Express confia em QUALQUER proxy e passa a
// tirar o req.ip do começo do x-forwarded-for — cabeçalho que quem chama
// escreve à vontade. Na prática o IP virava campo livre, e o freio de força
// bruta do /admin não freava nada: bastava mandar um valor diferente a cada
// tentativa. Quem está na frente: Cloudflare -> Render/Vercel -> este
// processo. A regra e o porquê de não ser contagem de saltos estão em
// cloudflare.js.
app.set('trust proxy', proxyConfiavel);
// `verify` guarda o corpo CRU: a assinatura HMAC do postback da Coreon é
// calculada sobre os bytes exatos recebidos — reserializar o JSON muda
// espaçamento e ordem de chaves e a conferência falharia sempre.
app.use(express.json({ limit: '256kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
// Logo, banners e tabela de medidas quase não mudam: 7 dias de cache evita
// rebaixar a mesma imagem a cada página visitada. Trocou a arte? mude o nome
// do arquivo (ou acrescente ?v=2 no src) para o navegador buscar de novo.
app.use('/assets', express.static(join(__dirname, '..', 'assets'), {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=604800'),
}));
// A personalização carrega as duas logos dentro do próprio formulário (data
// URI), então o corpo passa dos 32 KB dos outros posts. Vem ANTES do parser
// geral de propósito: o primeiro que roda é o que vale, e afrouxar o limite
// global deixaria qualquer rota aceitar 1 MB sem precisar.
app.use('/admin/personalizar', express.urlencoded({ extended: false, limit: '1.5mb' }));
// Form submit do /admin (POST marcar pago) — corpo urlencoded.
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// `commit` responde "o deploy pegou?" sem precisar entrar no painel. Aceita as
// duas plataformas: RENDER_GIT_COMMIT e VERCEL_GIT_COMMIT_SHA. Existe porque
// conferir deploy por outra rota engana: /admin/* manda QUALQUER caminho pro
// login (o guard é um router.use, roda antes do roteamento), então o 302 dali
// não prova que a rota nova subiu.
app.get('/health', (_req, res) => res.json({
  ok: true,
  uptime: process.uptime(),
  commit: (process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || undefined,
  branch: process.env.RENDER_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || undefined,
}));

// Página e JSON não levavam header de cache nenhum, e sem ele o navegador
// aplica cache por heurística: a loja mudava e o cliente continuava vendo a
// versão velha até limpar o cache na mão. `no-cache` não proíbe guardar, só
// obriga a revalidar — o ETag continua devolvendo 304 quando nada mudou.
// Vem depois do /assets de propósito: as imagens mantêm os 7 dias delas.
app.use((req, res, next) => {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-cache');
  next();
});

// Páginas
app.use('/', storeRoutes);
// OAuth Shopify (/install, /auth/callback)
app.use('/', oauthRoutes);
// API da Central de Lojas (painel externo que agrega as lojas). Vem ANTES do
// /api geral para a requisição da Central não atravessar nada do checkout.
// Sem CENTRAL_TOKEN no ambiente é como se não existisse — ver centralApi.js.
app.use('/api/central', centralApi);
// API JSON do checkout
app.use('/api', checkoutApi);
// Webhooks dos gateways (cada um no seu endpoint)
app.use('/', paysharkWebhook);
app.use('/', pixWebhook);
app.use('/', solutionWebhook);
app.use('/', umbrellaWebhook);
app.use('/', coreonWebhook);
// Painel administrativo (protegido por senha)
app.use('/admin', adminRoutes);

// Rede de segurança do processo. Neste Express (v4) um erro dentro de rota
// `async` NÃO chega no tratador de erro abaixo: vira unhandled rejection e o
// Node derruba o processo inteiro. O mesmo processo serve a loja, o checkout
// e os webhooks de pagamento — uma tela do /admin que quebrasse levava junto
// a capacidade de VENDER. Registrar e seguir de pé é a troca certa aqui.
process.on('unhandledRejection', (err) => console.error('[erro não tratado]', err));
process.on('uncaughtException', (err) => console.error('[exceção não tratada]', err));

app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, _req, res, _next) => {
  console.error('[erro]', err);
  res.status(500).json({ error: 'internal' });
});

warnMissing();

export default app;
