# Nation 47 — Checkout próprio (loja + PIX)

App Node.js (Express, ESM) que serve uma vitrine e um **checkout próprio com PIX** (gateway selecionável em `/admin` → **Coreon Pay**, UmbrellaPag, Solution Payments, PayShark ou PixGate), replica o pedido na **Shopify** (pendente → pago) e dispara o **Facebook Pixel + Conversions API** com deduplicação.

> ⚠️ **Segredos nunca vão no código nem no git.** Ficam no `.env` (local) e no painel do Render. O `.env.example` é o modelo.

## Rodar local

```bash
cp .env.example .env      # preencha os valores
npm install
npm run dev               # http://localhost:3000
```

- `GET /` — vitrine · `GET /checkout` — checkout · `GET /health` — status
- Com `DEV_TOOLS=1`, dá pra simular pagamento: `POST /api/dev/pay/:orderId`

## Fluxo do pedido
Carrinho (localStorage) → `POST /api/orders` (backend **revalida preços na Shopify**, aplica promo, cria pedido no SQLite) → PixGate `/cashin` (gera PIX) → cria pedido **pendente** na Shopify → front mostra QR + copia-e-cola e faz polling → PixGate confirma via **webhook** → marca pago (Shopify pending→paid) → dispara **Purchase** (CAPI) → front detecta e mostra sucesso.

---

## Setup na Shopify (OAuth)

1. **Cadastre os produtos** (com preço e variantes/numeração) — o checkout puxa tudo de lá.
2. Crie o app no **Dev Dashboard** da Shopify. Anote **Client ID** e **Client secret** → `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`.
3. Escopos: `read_products, write_orders, read_orders`.
4. Em **URLs de redirecionamento (OAuth)**, adicione: `https://SEU-APP.onrender.com/auth/callback`.
5. Depois do deploy, **instale o app** abrindo no navegador:
   `https://SEU-APP.onrender.com/install?shop=nation-47.myshopify.com`
   → autoriza → o token fica salvo no SQLite. Pronto.

> Alternativa: se você conseguir um **Admin API token (`shpat_...`)**, é só pôr em `SHOPIFY_ADMIN_TOKEN` e pular o OAuth.

## Setup PixGate
- `PIXGATE_BASE_URL=https://app.pixgateip.com`
- `PIXGATE_API_KEY=` → sua chave (Integrations → API Key). **Rotacione se ela vazou.**
- Endpoint usado: `POST /api/v1/cashin` (header `Apikey`, valor em reais). Postback: `event=transaction.paid` + `status=PAID`.

## Setup Facebook
- Crie um **pixel** no Events Manager → `FB_PIXEL_ID` (público).
- Gere o **token da Conversions API** → `FB_CAPI_TOKEN` (segredo).
- Opcional: `FB_TEST_EVENT_CODE` pra depurar no "Testar eventos".

## Promoção (1 par R$99 · 2 por R$149)
Fonte da verdade: `src/checkout/promo.js` (parametrizado por env). Taxa `PROMO_NUM/PROMO_DEN = 4900/19800 ≈ 24,7%` sobre os itens de `PROMO_ELIGIBLE_PRICE_CENTS` (R$99) quando há 2+. Escala p/ 4, 6… O front espelha o cálculo só pra exibir.

---

## Deploy no Render
1. Suba este repositório no GitHub.
2. No Render: **New → Blueprint** apontando pro repo (usa o `render.yaml`, plano **Starter** — não use free, ele hiberna e mata o checkout).
3. Preencha as env vars com `sync:false` (segredos) no painel.
4. Push na `main` = deploy automático.
5. `APP_URL` não precisa ser setado (usa `RENDER_EXTERNAL_URL`); sobrescreva só com domínio próprio.

## Ligar os botões de compra à loja
Os botões da landing/tema devem apontar pro checkout com as variantes:
`https://SEU-APP.onrender.com/checkout?items=VARIANT_ID:1`
(Pra achar o VARIANT_ID: `GET /api/catalog`.)

## Teste de ponta a ponta (produção)
1. Abra `/checkout?items=VARIANT_ID:1`, preencha e finalize.
2. Veja o pedido **pendente** no admin da Shopify.
3. Pague o PIX → deve virar **pago**, a tela de sucesso aparece, e o **Purchase** surge no Events Manager.

## Publicar um produto novo

O catálogo vem de `data-import/products_export.csv`, que **vai no git**. O banco não vai.

1. **Fotos** em `assets/produtos/`, 1024×1024 webp — o tema corta em `aspect-ratio:1`.
   Foto de celular tem ~2,4 MB; convertida cai pra ~110 KB e o repositório agradece.
2. **Linhas no CSV**, copiadas de um produto do mesmo modelo. `Image Src` aceita
   caminho relativo (`/assets/produtos/foo.webp`).
3. **Coleção não se escolhe** — é automática por tag (`src/checkout/collections.js`).
   A tag certa já põe o produto lá.
4. `git push` → deploy.
5. **`/admin` → Catálogo → Reimportar catálogo.** Este passo é obrigatório: o boot
   (`seedCatalogo()`) só importa com o catálogo **vazio**, pra nunca desfazer nada
   sozinho. Sem clicar, o produto novo fica no repositório e não na loja.

A reimportação roda em transação e valida antes de gravar: CSV quebrado ou sem
produtos não altera nada, e a loja continua vendendo. Pedidos não são tocados.

## Observações
- Pedidos em **SQLite** (`data/checkout.sqlite`). No Render, ative um **disco persistente** montado em `/opt/render/project/src/data` se quiser que o banco sobreviva a redeploys (senão o pedido pendente na Shopify é o fallback).
- **Nunca** rode em serverless (Vercel/Lambda) sem repensar a persistência.
