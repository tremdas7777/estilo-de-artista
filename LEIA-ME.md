# Estilo de Artista — loja + checkout

Montada em **13/09/2026**. É a sétima loja da família e usa o **layout da A
Fonte** com **o catálogo da Drip de Rua** — e uma exceção só, decidida pelo
dono em 14/09/2026: os Air Max 95 são os da Nation, no lugar dos da Drip.

**É uma cópia, não uma instância.** O código veio da pasta `AFonte-Checkout`
(que por sua vez é cópia da Nation 47). O app é de uma loja por instalação,
então correção feita aqui não chega nas outras, e vice-versa.

## Como rodar

```
npm start            # porta 3600 (o .env já define)
```

3600 porque a 3000 é a Nation, a 3400 a A Fonte, a 3500 a Nação 13 e a 3990 a
de corrida — todas sobem juntas na máquina.

- **Painel:** `http://localhost:3600/admin`, usuário `admin`, senha em
  `ADMIN_PASSWORD` no `.env` (gerada aleatória, vale só nesta máquina).
- O banco (`data/checkout.sqlite`) nasce vazio e o boot importa
  `data-import/products_export.csv` sozinho — **só com o catálogo vazio**.
  Mexeu no CSV? `/admin` → Catálogo → Reimportar, ou apague o `data/` em
  desenvolvimento.
- `node_modules/` veio copiado da A Fonte: o `better-sqlite3` não compila no
  Node 24 desta máquina. `npm install` do zero aqui provavelmente falha; no
  Render (Node 20) não.

## Catálogo: 1.076 produtos — a Drip, com os Air Max 95 da Nation

É o que a `dripderua.store` publicava em 13/09/2026 (1.077 no `products.json`
público), com uma troca pedida pelo dono em 14/09/2026: os 36 Air Max 95 da
Drip saíram e entraram os 35 da Nation (ver "Air Max 95", abaixo).

| leva | produtos | de onde |
| --- | --- | --- |
| `drip-linhas.csv` | 725 | captura de 27/08/2026, feita para a A Fonte |
| `blusas-linhas.csv` | 21 | coleção blusas, 05/09/2026 |
| `hocks-linhas.csv` | 6 | chinelos Hocks que a Drip vende e a A Fonte já tinha pela Nation com o **mesmo handle** — a captura os pulou; linhas tiradas do CSV da A Fonte |
| `extras-linhas.csv` | 289 | **o resto da Drip**, 13/09/2026 — menos os 36 Air Max 95 |
| `nation-am95-linhas.csv` | 35 | Air Max 95 **da Nation**, 14/09/2026 |

Tudo em `captura-drip/`. Para refazer o CSV: `node gerar-extras.mjs`,
`node gerar-nation-am95.mjs` e depois `node montar-catalogo.mjs` (os três rodam
de dentro de `captura-drip/`). O último **substitui** o
`data-import/products_export.csv` inteiro e confere o resultado com o mesmo
importador do servidor.

**Por que existem os 325 "extras".** A captura de agosto foi por coleção e
pulou de propósito o que repetia a Nation dentro da A Fonte: Nike TN, LV, NB
9060, slides Mind. Numa loja só da Drip, sem eles não haveria Nike nenhum. Eles
saem do `products.json` inteiro, guardado como veio em
`drip-todos-2026-09-13.json`:

| linha | produtos |
| --- | --- |
| Nike Air Max TN (genérico / Plus 3 / Drift / Plus) | 132 / 27 / 7 / 1 |
| LV Trainer / LV Skate | 44 / 22 |
| Nike Air Max 95 | 36 — **fora desde 14/09/2026**, ver "Air Max 95" |
| New Balance 9060 / Numeric | 25 / 5 |
| Camisas de seleção 2026 | 13 |
| Slides Nike Mind | 9 |
| Meias Nike (2), impermeabilizante (1), calça cargo preta (1) | 4 |

Convenções, iguais às da captura de agosto (e comentadas no
`gerar-extras.mjs`):

- **Tênis a 179,00 / 399,00 no CSV**, vendido a 99,00 (preço forçado no
  import, `CATALOGO_PRECO_CENTS`): todo par mostra "DE R$ 179,00" e −45%.
- **Numeração 34–44.** A Drip vende até 45; a tabela de medidas vai até 44.
- **Descrição de calçado = a nossa tabela de medidas.** A da Drip é uma imagem
  com a logo, o FAQ e prints de clientes dela. Camisa fica sem descrição pelo
  mesmo motivo; meia, impermeabilizante e calça mantêm o texto da origem, sem
  imagem.
- **Classificação pelo título**, nunca pelo handle da Drip (que está trocado —
  ver `classificar.mjs`). 325 de 325 classificados.

**Correções à origem** (mapa `CORRIGIDOS` + regras no `gerar-extras.mjs`):
a "Camisa da Argentina (cópia)" é outra peça na foto — virou *Edição Especial
Preta*; o impermeabilizante vinha com o handle de uma meia; "ew Balance" e
"New Ballance" corrigidos; e **36 Air Max 95** tinham handle `-copia` dizendo
um modelo e título dizendo outro — o handle virou o slug do título.

**O que ficou como a Drip cadastrou, e vale saber:** **132 produtos se chamam
só "Nike Air Max Tn"**, 27 "Nike Air Max Tn Plus 3" e ~35 "LV *Trainer"/"LV
Skate" — são cores diferentes com o mesmo nome. A vitrine TN usa `intercalar`
para não abrir com doze cartões idênticos, mas a página da coleção mostra os
nomes repetidos. Resolver é dar nome a cada um olhando a foto (folha de
contato, como na revisão de capas da A Fonte).

### Air Max 95: os da Nation (14/09/2026)

**Pedido do dono.** Os 36 Air Max 95 da Drip tinham foto, mas de catálogo da
Nike: um tênis pequeno no meio do fundo branco — na vitrine, parece que o
produto não tem imagem. Os da Nation são foto real, com o par na mão. A
comparação lado a lado foi feita antes da troca.

**Entraram só os 35 Air Max 95 de verdade.** A Nation põe a tag "Air Max 95"
em 59 produtos, mas **24 deles são Air Max DN / DN8** (outro modelo, o da sola
de bolhas). O dono escolheu deixar os DN de fora — por isso o
`gerar-nation-am95.mjs` filtra pelo TÍTULO e recusa rodar se um DN aparecer.

Por cima do que vem da Nation, as convenções desta loja:

- **numeração 34–44** — a Nation vende até 45; a nossa tabela vai até 44;
- **descrição = a nossa tabela de medidas** — a da Nation leva a marca dela;
- **tags `Nike, Air Max 95`** — a `Air Max` da Nation abriria uma coleção
  automática `/colecao/air-max` que esta loja não tem;
- **"AirMax" vira "Air Max" no título** — sem isso a busca por "air max 95"
  não acha nenhum deles;
- **179,00 / 399,00**, como todo tênis (o import força os R$ 99).

Ficou como a Nation cadastrou: o "NOVO" em metade dos títulos (é como ela
separa a leva nova) e os handles `nike-airmax-95-importado-vietna…`, que vão
para a URL do produto. A Drip nunca vendeu estes pares, então a regra "só a
Drip" do resto do catálogo não vale para eles. Os 36 da Drip seguem
classificados no `gerar-extras.mjs` (regra `fora: true`), para não voltarem
como "não classificados" numa recaptura.

## Preços

**1 par R$ 99,00 · 2 pares R$ 149,00** desde 13/09/2026 (a loja nasceu com os
R$ 129/189 da A Fonte). `CATALOGO_PRECO_CENTS=9900`,
`PROMO_ELIGIBLE_PRICE_CENTS=9900`, `PROMO_NUM/DEN=4900/19800`: 2 × 99 = 198,
menos 49 = **149**; escala sozinho (3 pares R$ 223,50, 4 pares R$ 298,00).
Mudar o preço é mexer nas três coisas juntas — e no banner (abaixo).

Fora dos tênis, cada um no preço do próprio CSV: camisa R$ 99,90, blusa
R$ 69,90, calça R$ 79,90 (a cargo preta R$ 59,90), slides Nike Mind e Hocks
Fair Acqua R$ 99,90, os 6 Hocks antigos R$ 79, meia R$ 19,90,
impermeabilizante R$ 39,90.

> **A promo reconhece o par pelo PREÇO EXATO** (`src/checkout/promo.js`), não
> pelo tipo. Com o par a R$ 99,00, os 10 chinelos que estavam a R$ 99,00
> (convenção da A Fonte) passariam a contar no "2 por R$ 149". Foram para o
> preço da própria Drip, R$ 99,90 — e o `montar-catalogo.mjs` agora **recusa**
> montar o CSV se qualquer produto que não seja tênis custar o mesmo que o par.

**O "R$ 149" está desenhado no banner** — que é arte do dono, não gerada por
código. Mudou o preço? precisa de banner novo dele, senão o topo anuncia um
preço e o carrinho cobra outro. Só o texto alternativo da imagem acompanha
sozinho (`config.promo`).

## Carrinho lateral e o combo do 2º par (28/09/2026)

Adicionar um par não troca mais de página: a sacola **abre pela lateral**, por
cima da loja (`.sac` em `src/views/pages.js`). No computador ela tem ~470px e
cresce até 880px quando a escolha do 2º par abre; no celular ocupa a tela.

Com **um** par elegível dentro, o painel mostra "COMPLETE SEU COMBO" com os
números da promo e o botão **ESCOLHER MEU 2º PAR** — que abre um mini-catálogo
**dentro do próprio painel**, em três etapas: **modelo → cor → numeração**.
Fechado o combo, aparece "COMBO ATIVADO", os dois pares listados, a economia e
o total novo (com uma contagem de ~400ms entre o preço velho e o novo). Cada
par elegível ganha um "Trocar", que reabre o seletor e **substitui** a variante
numa escrita só — nunca existe um instante com três pares na sacola.

**A oferta não morre no 2º par** (pedido do dono, 28/09/2026). A regra é
proporcional, então o 3º, o 4º e o 5º entram com o mesmo desconto: cada par a
mais sai por **R$ 74,50** em vez de R$ 99 (1 par 99 · 2 149 · 3 223,50 · 4 298
· 5 372,50). Fechado o combo, no lugar de "complete" aparece "QUANTO MAIS
PARES, MAIS BARATO", com o preço do próximo par. O número sai de `marginal()`,
que é a diferença real entre o total de agora e o total com mais um par —
muda sozinho se `PROMO_*` mudar.

### Camada de movimento (28/09/2026)

Passada de motion design por cima da lógica, sem tocar nela. **Sem biblioteca e
sem WebGL**: tudo é `transform`/`opacity` + `requestAnimationFrame`, o que cabe
no compositor do navegador e não força reflow.

- **Tokens**, no `:root` da folha do carrinho e espelhados em `MO` no JS:
  `--sac-micro` 170ms (botão, miniatura, ícone), `--sac-comp` 380ms (cartão,
  etapa, colorway), `--sac-hero` 560ms (troca de produto, entrar no combo);
  curvas `--sac-ease-out` (entrada), `--sac-ease-in` (saída) e `--sac-ease`
  (transições importantes). Nenhuma animação é `linear` e nenhuma é infinita.
- **Abertura**: painel + overlay em 380ms e o conteúdo entrando em cascata de
  40ms (título, produtos, combo, CTA), só na abertura.
- **Produto entrando**: card com `scale .94 -> 1`; o ícone da sacola dá UM pulo
  (1 -> 1,12 -> 1) e a classe sai no fim — ele nunca fica pulando.
- **Etapas do seletor**: a atual recua e some, a nova entra do outro lado; a
  sacola atrás recua 20px em vez de sumir, para a pessoa saber que continua
  dentro do carrinho.
- **Produto**: palco com `perspective`, sombra no chão que encolhe enquanto o
  tênis está "no ar", entrada girando quando o MODELO muda e giro de 8° na
  troca de colorway. No desktop o palco inclina com o mouse (3,5° em X, 5,5° em
  Y, um `requestAnimationFrame` por quadro e nenhum loop); no celular o tilt
  não existe.
- **Preço**: contador de 420ms até o valor novo, um pulso de 5% e um brilho que
  passa uma vez.
- **SEU DROP**: com o combo fechado, os pares aparecem como conjunto, tortos em
  -3°/+3°, com sombra — e o check do "COMBO ATIVADO" se desenha.
- **Remover** é sanfona de 280ms; **trocar** desliza o par para fora antes de
  abrir o seletor. Nos dois casos o ESTADO muda primeiro e a animação é só a
  representação: se ela não rodar, o carrinho se comporta igual.
- **Sem corrida**: troca de etapa tem trava, resposta de modelo e de colorway
  antigos são descartadas por token, todo `setTimeout` de animação passa por um
  registro que é cancelado ao fechar a sacola, e o painel ignora o evento
  `sacola:mudou` que ele mesmo emite (isso também cortou uma ida à rede por
  clique).
- **Preload** só do próximo necessário: passar o mouse num card de modelo busca
  as cores dele uma vez, e o clique abre sem espera.
- **prefers-reduced-motion** tira rotação, 3D, deslocamento e cascata; o fluxo
  inteiro continua funcionando (testado ponta a ponta com a preferência ligada).

**Tocar numa colorway só troca a foto grande** (pedido do dono, 28/09/2026):
quem está comparando as cores não cai na tela de numeração e não precisa voltar
a cada miniatura. Quem avança é o botão **ESCOLHER O TAMANHO**, na barra de
baixo, que também mostra o que está selecionado.

- **Modelo, cor e numeração saem do catálogo que já existe**, sem tabela nova:
  o produto é a colorway (`tesla-coil-malbec`), as variantes são as numerações,
  o **modelo** é a tag mais específica que não é o vendor ("Tesla Coil") e a
  **cor** é o que sobra do título depois de tirar marca e modelo ("Malbec").
  `src/checkout/combo.js`; servido por `GET /api/combo` (64 modelos, filtros de
  marca gerados do catálogo) e `GET /api/combo/modelo/:key` (colorways
  paginadas de 18 em 18 — "Air Max TN" tem 132).
- **Quem entra na oferta é `promo.itemElegivel`**, a mesma função que dá o
  desconto no servidor. Não há segunda régua: o que o painel oferece é
  exatamente o que o PIX cobra barato.
- **O desconto é uma conta só** para as três telas (painel, `/carrinho` e
  checkout): `promoDesconto`, no bloco `CART` do `pages.js`. Antes eram cópias
  literais da mesma fórmula em dois lugares.
- **O painel só escreve o `localStorage 'cart'`**, no formato de sempre
  (`{variante: quantidade}`). Preço, nome, cor e estoque vêm do
  `/api/variants?det=1` a cada mudança — nada de preço guardado no navegador.
  Por isso o valor da tela não tem como divergir do gateway: quem cobra
  continua sendo o `POST /api/orders`, que recalcula tudo do catálogo
  (`resolveCart` + `priceOrder`), como antes deste carrinho existir.
- **A numeração fora de estoque aparece desativada e riscada**, não some — some
  faria a grade pular do 39 para o 41. O botão de adicionar só liga com modelo,
  cor, variante, numeração e estoque válidos.
- **Animações**: a troca de colorway gira a foto ~340ms (a nova é pré-carregada
  antes), a foto "voa" até o cabeçalho da sacola ao adicionar e o total conta
  de um valor ao outro. Nenhuma é infinita, e todas somem em
  `prefers-reduced-motion`. Sem WebGL, sem 3D carregado: só `transform` de CSS
  e as fotos do próprio catálogo, em `loading="lazy"`.
- **Eventos** (`cart_open`, `combo_offer_view`, `combo_selector_open`,
  `combo_model_select`, `combo_color_select`, `combo_size_select`, `combo_add`,
  `combo_change`, `combo_remove`, `checkout_click`) saem pelo **Pixel que já
  existe** (`fbq('trackCustom')`) e pelo `dataLayer`/`gtag` se um dia houver
  GTM. Nenhum script novo. O `AddToCart` padrão continua saindo no add.
- **A oferta pós-compra e a recuperação NÃO têm o painel**
  (`shopHeader(..., { sacola: false })`): lá o carrinho é outro, e abrir o da
  loja por cima misturaria duas compras. A página `/carrinho` continua no ar e
  se atualiza quando o painel mexe (evento `sacola:mudou`).

## Hero e sistema de movimento da loja (28/09/2026)

### O par do hero e o Kairo Gen

**O hero não recebe "a primeira foto que houver".** As 17 fotos que o catálogo
tem dos quatro focos (Tesla Coil Pro, Hocks Bold, off-white, Sombras) foram
conferidas uma a uma: **nenhuma serve para primeira dobra** — 8 têm mão
segurando, 4 têm pé calçado, e as 5 que mostram o par sozinho estão em chão de
concreto, com etiqueta de papel no chão. São fotos de revendedor, não de
estúdio.

Por isso a arte do hero passou pelo **Kairo Gen**: a foto REAL do catálogo
(`img_1982…`, Tesla Coil Pro Preto Refletivo, o #1 dos Mais Vendidos) foi usada
como referência para **trocar só o cenário e a luz**. O produto é o mesmo, e
isso foi conferido detalhe a detalhe contra o original antes de entrar no site:
cadarço branco passando por presilhas pretas, "TESLA" nas duas linguetas, logo
manuscrito no painel de mesh, entressola branca com friso preto, silhueta e
costuras.

Foram **três tentativas**, e as duas primeiras foram recusadas por desvio real:
a v1 trocou o cadarço branco por um cadarço preto tracejado; a v2 acertou a
estrutura mas deixou o cadarço azulado (culpa do "cool rim light" que o prompt
pedia). A v3, com luz neutra e o cadarço descrito explicitamente, passou.

> Regra para quem mexer nisso depois: **o Kairo troca cenário e luz, nunca o
> produto.** Se a geração mudar qualquer detalhe do tênis, ela é descartada —
> a pessoa vai receber o par da foto, e uma foto que promete outro sapato é
> devolução na certa.

**O filme do hero** (`assets/hero-tesla-coil-pro-preto-refletivo.mp4`, 120 KB)
saiu do MESMO primeiro quadro, pelo Seedance 2.0 Mini (image-to-video, 4s,
1080p, 1:1): um movimento de câmera com a luz varrendo o par. Não é `rotateX`
numa imagem plana — é câmera e luz se movendo em volta de um objeto parado.

Como ele entra sem custar LCP:

1. a FOTO é o elemento prioritário (`fetchpriority="high"`, sem lazy) e é ela
   que o navegador mede como LCP — conferido: 116ms, com o vídeo no ar;
2. o `<video>` nasce **sem `src`**, só com `data-src`;
3. o download começa 600ms **depois** do `load` da página, para não disputar
   banda com as fotos da vitrine;
4. quem está em `saveData` ou em rede 2G nunca baixa o vídeo;
5. ele roda em **loop contínuo** (pedido do dono, 28/09/2026), e por isso o
   arquivo é **vai-e-volta**: o filme original ia do escuro ao claro, e emendar
   o fim com o começo daria um pulo de luz a cada volta. Com a metade invertida
   concatenada, o movimento fecha em si mesmo e não há emenda visível —
   3,4s viraram 6,8s e 120 KB viraram 214 KB;
6. ele pausa quando o hero sai da tela **e** quando a aba vai para segundo
   plano, e volta sozinho nos dois casos. A retomada por `visibilitychange` não
   é detalhe: o navegador suspende vídeo de aba em background e **não** retoma
   sozinho quando ela volta, porque o elemento não é `autoplay` — quem deu o
   play foi o nosso código. Sem isso, quem trocasse de aba e voltasse
   encontraria o loop congelado num quadro qualquer;
7. `prefers-reduced-motion` não baixa o vídeo.

Em qualquer uma dessas saídas a foto continua embaixo, visível. **O hero nunca
depende do vídeo para existir.** O bruto de 4,7 MB virou 120 KB cortando os
0,6s iniciais (escuros), reescalando para 720×720 e recodificando sem áudio.

Trocar o par do hero = trocar as três linhas de `HERO_PAR` em `pages.js` e pôr
a arte nova em `/assets`. O handle é conferido contra o catálogo antes de virar
link, então um par que saia do catálogo não deixa link morto.

**O preço saiu da arte e voltou para o código.** O hero era um PNG de 367 KB com
"2 PARES POR R$ 149" desenhado dentro — um segundo dono do preço, que passava a
mentir no primeiro reajuste de `PROMO_*`. Agora é composição em HTML: headline,
bloco da oferta, CTA e a foto de um par real. O valor sai da constante `PRECO`,
derivada de `config.promo` — a MESMA conta do carrinho e do servidor. Trocar
`PROMO_ELIGIBLE_PRICE_CENTS` para 12900 faz o hero escrever R$ 129 e R$ 199
sozinho (conferido). A arte antiga não é mais usada na home.

- **O par do hero** é o primeiro dos Mais Vendidos com foto (`CURADAS`, em
  `collections.js`) — a mesma curadoria da vitrine. Para trocar o par do hero,
  reordene aquela lista; não há foto escolhida à mão aqui. Ele é o elemento
  **LCP**: vai com `fetchpriority="high"`, sem lazy e com dimensões declaradas.
- **A foto vira placa**, com cantos arredondados, fio de luz na borda, sombra
  funda e 2° de inclinação. É proposital: as fotos do catálogo são fotos (tênis
  no asfalto), não recortes em PNG — fingir que o par flutua no preto deixaria
  um retângulo colado na tela. Quando houver recorte, é só tirar a moldura.
- **Fundo em CSS puro** (gradiente da marca + grão em SVG inline + foco de luz),
  0 KB e 0 requisições.
- **Header**: na home nasce transparente por cima do hero (que sobe por baixo
  dele com margem negativa de `--hdr-h`) e ganha corpo com blur de 10px depois
  de 28px de rolagem. A altura é MEDIDA por um script logo após o `</header>`,
  antes de o hero ser lido pelo parser — é o que mantém o CLS em zero.
- **Parallax do hero**: ao descer, o par desce 26px, a headline sobe 20px e o
  que é secundário desbota. O CTA não desbota. Sem travar a rolagem.
- **Profundidade**: tilt de 3° em X e 5° em Y com o mouse (só `pointer: fine`),
  e uma flutuação de 3px que **para quando o hero sai da tela**.

**Aurora do hero** (`.aur`, no `BASE_CSS`): manchas de luz se movendo devagar,
um pulso de gradiente e 14 pontos piscando, atrás do produto. Veio de um
componente React + framer-motion que **não tinha como ser instalado** — esta
loja é Express com HTML montado no servidor, sem React, sem Tailwind, sem
TypeScript e sem bundler. Foi portado para CSS puro: **zero dependência, zero
KB de biblioteca**.

- As cores são as DA MARCA (rosa `--brand` e volt). O roxo/índigo do original
  é identidade de outra marca.
- As manchas são **gradiente radial**, não círculo com `filter: blur()` — a
  borda difusa sai da própria cor, sem pedir ao navegador que desfoque uma
  superfície do tamanho da tela a cada quadro.
- **14 pontos, não 80.** O original pisca 80 estrelas; nesta escala vira
  protetor de tela numa loja de tênis.
- As posições dos pontos vêm de um gerador com **semente fixa**, e não de
  `Math.random` por requisição: o HTML da home revalida por ETag, e marcação
  diferente a cada visita mataria todo 304.
- Congela inteira quando o hero sai da tela e some em `prefers-reduced-motion`.

**Sistema de movimento global** (`--mo-micro` 170ms / `--mo-comp` 380ms /
`--mo-hero` 560ms e as curvas `--ez-out`, `--ez-in`, `--ez`, no `:root` do
`BASE_CSS`): nasceu no carrinho lateral e agora vale para a loja inteira. Os
nomes `--sac-*` da folha do carrinho viraram apelidos destes — **uma definição
só**, e mudar a velocidade da loja muda a do carrinho junto.

**Entrada das seções** (`data-rev` + `IntersectionObserver`): quatro gestos
diferentes, escolhidos por seção, para a página ter ritmo em vez de um desfile
de fade-up — `up` na faixa de benefícios (escalonada), `left` no título de cada
vitrine, `left`/`right` opostos na seção "Quem é". Os cards **não** animam um a
um. Cada alvo sai do observador assim que aparece.

> **Nada nasce escondido sem JavaScript.** Tudo que começa invisível (seções com
> `data-rev`, as linhas da headline) depende da classe `.js` que um script no
> `<head>` põe no `<html>`. Sem script, nada some: a home continua inteira para
> o leitor e para o buscador. Esconder conteúdo confiando que o JS vai devolvê-lo
> é como se perde uma home no Google.

## Página de produto (28/09/2026)

Refeita. Duas colunas no computador — o palco do produto ocupa **57%** e fica
grudado enquanto a coluna de compra rola; no celular vira uma coluna só, na
ordem produto → nome → preço → cor → numeração → CTA.

- **Galeria** com trilho de scroll-snap: swipe nativo no celular, arrastar com
  o mouse no computador, miniaturas, contador discreto e zoom. Sem setas
  gigantes.
- **Giro do produto**: sequência de quadros que o cliente arrasta para girar o
  tênis (`assets/giro/<handle>/g01…g24.webp`). Quem detecta é
  `src/checkout/giro.js`, varrendo a pasta uma vez por processo — pôr os
  arquivos de um produto novo lá já liga a interação, sem código e sem
  migração. Menos de 8 quadros não vira giro. **O produto sem sequência não
  perde nada**: o alternador "Fotos / Girar" nem aparece.
- **Cores na própria página** (`coresIrmas`, em `combo.js`): as colorways do
  mesmo modelo com miniatura REAL. Trocar de cor recarrega o produto de
  verdade — variante, preço, numerações, estoque e SKU vêm do servidor de novo
  — e empurra a URL, então o link é copiável e o botão voltar funciona.
  Diferente do combo, aqui **não** há filtro de promoção: esconder uma cor
  porque ela custa outro preço seria esconder produto de quem está justamente
  olhando aquele modelo.
- **Barra fixa no celular** com preço e ADICIONAR, quando o CTA real sai da
  tela. Ela não tem lógica própria: clica no CTA de verdade, e quem adiciona ao
  carrinho continua sendo o handler único do `SHOP_JS`.
- **Seção cinematográfica**: a foto fica grudada de um lado e troca de ângulo
  conforme cada bloco de texto entra. Sem sequestrar o scroll.
- **Ficha** montada só com o que o catálogo tem: marca, modelo, faixa real de
  numeração e quantas cores o modelo tem. **Não há material, solado nem
  composição** — o catálogo não guarda isso, e chutar seria anúncio falso na
  página de um produto que a pessoa recebe em casa. Lembrando que **1.012 dos
  1.076 produtos não têm descrição nenhuma**: o `body_html` deles é só a tag da
  tabela de medidas.

**Chapas de campanha** (`assets/campanha-concreto.webp` 45 KB e
`campanha-luz.webp` 5 KB, geradas no Kairo): textura de concreto e atmosfera de
luz nas cores da marca, usadas como FUNDO das seções escuras da página de
produto. Entram por CSS, atrás do texto, com a cor sólida declarada junto — se
não baixarem, muda a matéria, não a legibilidade. Não têm produto nem texto
dentro: nenhum preço ou nome desenhado em imagem.

> **O giro de produto está DESLIGADO** (`assets/giro/_desligado-…`). Ele
> funciona, mas os quadros são estúdio PRETO e a página de produto é BRANCA —
> ao lado de fotos de concreto cinza davam três linguagens visuais na mesma
> tela. Religar = tirar o `_desligado-` do nome da pasta, e só depois de a
> fotografia de produto estar padronizada na mesma direção.

> **Dois bugs que o teste pegou e que valem lembrar.** (1) A barra fixa media a
> visibilidade do CTA só pelo IntersectionObserver: no primeiro paint as fotos
> ainda não chegaram, a página era curta, o CTA estava na tela, o observer
> registrava "visível" e **não disparava de novo** quando as imagens empurravam
> o botão para baixo — a barra ficava escondida a página inteira. Agora a
> decisão mede o retângulo na hora. (2) O limitador da rolagem usava
> `requestAnimationFrame`, que é **suspenso em aba de segundo plano**; virou
> limitador por tempo.

## Vitrine, menu e Mais Vendidos

- **Foco da loja: Tesla Coil e Hocks Bold** (pedido do dono, 14/09/2026). Os
  dois abrem a home nos dois lugares de destaque:
  - **Mais Vendidos é AUTOMÁTICO** desde 29/09/2026: sai do ranking de pedidos
    **pagos** (PIX gerado e abandonado não conta), o mesmo que o
    `/admin/ranking` mostra. Regra em `src/checkout/maisVendidos.js`:
    **9 vagas**, janela de **90 dias** civis de São Paulo, piso de **2 pares**
    vendidos, só categoria **Tênis** e só produto que ainda está no catálogo.
    A vaga que o ranking não preencher cai para a **RESERVA** — os 9 da coleção
    "mais-vendidos" da própria Drip (Tesla Coil Pro, Hocks Bold, Puma Caven
    Ferrari, Puma CA Pro AMG), que é o que a vitrine mostrava antes. Com a loja
    sem venda, a vitrine é exatamente a de antes; cada venda nova empurra a
    reserva para fora, uma posição por vez. A lista fica 60s em memória, então
    a venda aparece na home no minuto seguinte. A home e a página
    `/colecao/mais-vendidos` leem a MESMA lista (via `CURADAS` em
    `collections.js`, cujo `handles` é um getter) — o "Ver todos" nunca
    discorda da fileira.
  - **Home: 25 vitrines.** Os sete focos abrem (Tesla Coil, Hocks Bold,
    Tesla x Lokal, Puma CA Pro, Hocks Puff, Puma Park, Stickers — pedido do
    dono, 29/09/2026); depois TN, NB 9060, Nike Mind e o resto na ordem da
    A Fonte, com Air Max 95, LV e camisas entrando. `HOME_FEATURED` em
    `src/routes/checkoutApi.js` — a mesma lista monta as vitrines da oferta
    pós-compra e da recuperação de carrinho.
- **Menu:** o da A Fonte sem o que era só da Nation (Asics, Mizuno, Juliet,
  Shox) e com Acessórios, Camisas, Air Max 95, NB 9060/Numeric. O combo
  `air-max-tn` saiu: aqui todo TN tem a tag `Air Max TN`. `MENU_SPEC` em
  `src/checkout/collections.js`.

## Order bumps

**Os mesmos três que a Drip de Rua tem no ar**, com os preços de lá (pedido do
dono, 13/09/2026). A lista veio da rota pública `/api/bumps` do checkout da Drip
(`dripderuacheckout.shop`), que devolve o que está configurado no metafield da
Shopify dela — as meias que aparecem no código do app da Drip são só o padrão
de fábrica, não o que está no ar.

| bump | aqui | na Drip |
| --- | --- | --- |
| Impermeabilizante de Tênis | R$ 39,90 (sem desconto) | igual |
| Calça Cargo Preta (sarja premium), P–GG | R$ 59,90 (sem desconto), abre em M | abre em P |
| Tesla Coil Pro Preto Refletivo, 34–44 | **R$ 79,00** "de R$ 99,00", abre em 40 | R$ 79,00 de R$ 99,90, abre em 34 |

- **O texto do Tesla mudou.** Lá é "leve pela METADE do preço"; aqui o par custa
  R$ 99 e R$ 79 não é metade — anunciado vira obrigação (CDC, art. 30). Ficou
  "Só aqui no checkout: leve mais um par por R$ 79,00".
- **Com a promo de R$ 149, o bump do Tesla perde para o carrinho.** Quem tem 1
  par e marca o Tesla paga R$ 99 + R$ 79 = **R$ 178**; pondo o mesmo Tesla no
  carrinho, os 2 pares saem por **R$ 149**. O bump nunca conta como par. O preço
  é o da Drip, a pedido do dono — fica anotado para ele decidir.
- **A calça é a de R$ 59,90** (`calca-cargo-preta-sarja-premium`). Existe outra
  com o MESMO nome a R$ 79,90 (`...-1`) — não é ela.
- **Conferido de ponta a ponta** no checkout (celular emulado, até a etapa de
  pagamento, sem gerar PIX): os três cartões montam, os seletores abrem em M e
  40, e marcar o Tesla com 2 pares no carrinho fecha em R$ 149 + R$ 79 =
  **R$ 228,00** (conferido de novo depois da troca de preço). O bump entra depois da promo e nunca conta como par.

Ficam em `defaults()` de `customization.js`; o `/admin` → Personalizar → Order
bumps ganha deles. Os da A Fonte (Juliet, Sneaker Guard) eram da Nation e
sumiriam sem erro.

## Marca

### A logo (13/09/2026)

O dono mandou a arte no mesmo dia: coroa amarela, "ESTILO" em rosa e "DE
ARTISTA" em amarelo-neon, sobre preto. O original (JPEG 1254×1254, sem
transparência) está em `assets/_originais/logo-estilo-de-artista-original.jpeg`,
e **tudo sai dele** por `node assets/_fonte/gerar-logo.mjs`:

| arquivo | onde aparece |
| --- | --- |
| `assets/logo-estilo-de-artista.png` (transparente) | cabeçalho, rodapé, `/admin`, e-mail — todos de fundo escuro (`LOJA_LOGO`) |
| `assets/logo-estilo-de-artista-fundo-claro.png` | topo do checkout, que é claro (`LOJA_LOGO_CLARO`) — transparente, com contorno preto justo nas letras |
| `assets/app/icone-*.png`, `notificacao-logo-192.png` | a arte inteira no quadro preto dela |
| `assets/app/icone-maskable-512.png` | idem, com a diagonal da logo dentro do círculo que o Android recorta |
| `assets/app/badge.png` | só a **coroa**, branca: é o que se reconhece a 24px na barra do Android |

Três decisões:

- **Recorte pela intensidade da tinta**, não por cor: a arte é tinta clara sobre
  um preto limpo, então o alfa sai do canal mais forte e a cor volta dividindo
  por ele. Sem essa divisão a borda escurece e vira contorno sujo.
- **No checkout, a logo leva um contorno preto justo nas letras**, como adesivo,
  em vez de repintada: o amarelo-neon some no branco (1,2:1), e assim ele segue
  encostado no preto, com as cores exatamente as do autor. Até 14/09/2026 ela ia
  no quadro preto inteiro, com cantos redondos; o dono pediu sem o fundo preto.
  Só tirar o quadro não bastava — sem o contorno, o "DE ARTISTA" e a coroa
  sumiriam no cinza claro do checkout.
- **A logo é empilhada e quase quadrada** (1,1:1). Na altura que servia à arte
  larga da A Fonte, o "DE ARTISTA" sairia com uns 10px, então as alturas
  subiram: cabeçalho 58/84px (celular/desktop), rodapé 96px, checkout 64/76px,
  e-mail 64px.

### Cores

As da logo, em `colors` (`src/checkout/customization.js`): **marca = rosa
`#f10769`**, **volt = amarelo-neon `#d5e607`**, preto neutro `#0a0a0a`. Voltar
ao roxo da A Fonte é trocar `brand` para `#4d2a85` e `volt` para `#a8cc2e`.

**O verde também saiu** (pedido do dono, 13/09/2026: "use a cor da logo para a
loja"). A A Fonte tinha preço e botão verdes a pedido do dono dela; aqui:

| elemento | cor |
| --- | --- |
| preço (cards, produto, carrinho) | rosa da logo; nos preços miúdos, o rosa escuro (`--brand-d`), que passa de 4,5:1 |
| selo de desconto ("↓ 28%", "R$ 50 de desconto", selo do carrinho) | amarelo-neon com texto preto (14:1) |
| acento do checkout (total, "grátis", ícones de confiança) | rosa da logo; selos em amarelo |
| "R$ 189" do banner | amarelo-neon com sombra rosa escuro |
| **todo botão de compra** | **verde** — ver abaixo |

**Botões de compra são VERDES** (pedido do dono, mesmo dia): Comprar agora,
Adicionar ao carrinho (contorno), Finalizar compra, Ir para o pagamento,
Comprar, e o botão da oferta pós-compra e da recuperação. É `checkout.botao` =
`#0d874c`: o verde do checkout da A Fonte (`#0f9d58`) fechado até o texto
branco passar de 4,5:1 — o original dá 3,4:1. Muda pelo `/admin` →
Personalizar, e muda todos juntos.

> **Armadilha: a cor existe em DOIS escopos.** `ckVars()` declara `--ck-verde`
> dentro de `.ck{…}` (só o checkout) e `--comprar` no `:root` (a loja toda). Os
> botões da vitrine usaram `--ck-verde` por algumas horas e saíram com o
> **fundo transparente** — sem erro, só um botão sem cor. Botão de fora do
> checkout usa `--comprar`.

Verde fora dos botões, só onde é sinal: o botão do WhatsApp, o ícone do PIX e o
selo de "compra verificada" dos depoimentos (hoje desligados).

Trocar o token não bastava: havia o roxo da Nation **cravado** em oito lugares
(faixa do rodapé, tamanho selecionado, código do PIX, foco da busca, a tela do
código 2FA e os links dos e-mails). Os do site passaram a sair dos tokens —
inclusive um `--brand-rgb` novo, para os `rgba()` —, e os e-mails levam a cor
escrita, porque cliente de e-mail não lê variável CSS.

### Banner, tabela e cache

- **Banner do topo: arte do dono.** "PROMOÇÃO 2 PARES POR R$ 149", Hocks e
  Tesla. **Os dois trocados em 14/09/2026** por arte nova do dono (mesma
  campanha, Hocks e Tesla redesenhados): desktop 1912×823 (a de 13/09 era
  1916×821, e o `width`/`height` do `<source>` desktop no `storePage()`,
  pages.js, acompanhou) e celular 992×1586, mesma medida de antes. Os PNGs
  originais estão em `assets/_originais/banner-principal-{desktop,mobile}.png`
  (as versões de 13/09 ficam no histórico do git); no ar vão os WebP,
  convertidos com
  `ffmpeg -i <png> -c:v libwebp -quality 84 -compression_level 6 -preset picture`.
  Arte nova do dono = converter do mesmo jeito por cima dos dois `.webp` e
  reiniciar o serviço (o `?v=` do banner é calculado no boot).
- **Carrossel do topo** (17/09/2026): a arte da promoção virou o **slide 1** de
  um carrossel de dois, e o "COMPRE COM SEGURANÇA" do dono entrou como **slide
  2** — o Instagram da loja mostrado por dentro (2.006 seguidores, envios e
  feedbacks reais). Desktop 1912×823 e celular 992×1586, **as mesmas medidas do
  slide 1**, senão a altura pularia na troca; o desktop veio 1916×821 e foi
  reescalado na conversão. Originais em
  `assets/_originais/banner-seguranca-{desktop,mobile}.png`, no ar vão os WebP
  (287 KB e 261 KB), convertidos como os outros (`-quality 86`, por causa do
  print de Instagram: é texto fino dentro da arte).
  O movimento é **rolagem nativa com `scroll-snap`** (`.hero-trilho`, o mesmo
  padrão das vitrines): o dedo arrasta, e bolinhas e setas só empurram o scroll.
  As bolinhas ficam **abaixo** da arte — as duas artes terminam numa fileira de
  selos, e bolinha por cima esconderia justamente o que o banner foi desenhado
  pra dizer; as setas só aparecem onde existe cursor. O giro automático é de 6s,
  **para de vez** assim que alguém arrasta, clica numa seta ou numa bolinha
  (puxar o banner debaixo de quem está lendo é pior do que deixar parado), e não
  existe para quem pediu menos movimento no sistema (`prefers-reduced-motion`).
  O slide 1 mantém o `fetchpriority="high"` (é o LCP da home) e o 2 carrega com
  prioridade baixa — `lazy` deixaria o segundo entrar em branco no primeiro
  giro, porque dentro de um trilho horizontal o navegador nem sempre enxerga que
  a imagem está por vir. Sem os dois `banner-seguranca-*`, o topo volta a ser a
  arte única, sem bolinhas e sem setas (`TEM_SLIDE_SEG` em pages.js).
- **Arte do Instagram, no meio da home** (17/09/2026): arte do dono
  (`assets/banner-instagram.webp`, 1254×1254, 358 KB; PNG em
  `assets/_originais/banner-instagram.png`), com o print do perfil, o texto e um
  botão **desenhados dentro**.
  **O @ escrito nas artes não é o perfil real.** Elas saíram do ChatGPT, que
  inventou o arroba: esta diz "estilodeartistaofc" e a do topo, "Siga
  @estilodeartista.ofc" — o perfil é `@estilo_de_artista_`. Os links do site
  apontam para o perfil certo (sai de `LOJA_INSTAGRAM`, nunca do que está
  desenhado), mas quem LER o @ na arte e digitar no Instagram não acha a loja.
  Arte nova de IA = conferir o @ antes de publicar.
  Ela ocupa a **coluna da esquerda** (`ARTE_INSTA` em pages.js), no lugar da
  foto e do painel desenhado, com o título, o texto e o botão do lado direito —
  o formato das outras lojas, que foi o que o dono pediu. As três são quadradas,
  então trocar uma pela outra não mexe na altura da seção. A arte **inteira** é
  o link: o botão desenhado nela não clica, e é nele que o dedo vai; o
  `.insta-btn` de verdade continua na coluna de texto, com o mesmo destino, e é
  o que aparece para teclado e leitor de tela. Tirando o arquivo, a seção volta
  ao painel desenhado.
  Ela ficou algumas horas no ar **sozinha e centrada**, com o botão embaixo,
  porque a arte já traz o texto desenhado dentro e repeti-lo ao lado é
  duplicação — o dono pediu o formato de duas colunas das outras lojas.
- **Banner do checkout** (14/09/2026): arte do dono, "COMPRA SEGURA", em duas
  versões — computador 2172×724 (3:1, aparece com ~1048×349) e celular
  1774×887 (2:1, ~360×180), trocadas por um `<picture>` a 600px. As duas trazem
  a logo, então o banner **entra no lugar do topo com a logo** do checkout, com
  o mesmo link para a loja: com os dois, a logo aparecia duas vezes seguidas e
  o campo de e-mail caía abaixo da dobra num notebook 1366×768. Largura da
  grade, canto dos cartões (reto quando o `/admin` → Personalizar pede cantos
  retos). Originais em `assets/_originais/banner-checkout-{desktop,mobile}.png`;
  no ar vão os WebP (275 KB e 286 KB), convertidos como os do topo. Fica fora
  do `#root`, então continua na tela do PIX. Sem os dois arquivos, a logo volta
  sozinha (`TEM_BANNER_CK` em pages.js) — inclusive uma logo enviada pelo
  `/admin`, que fica escondida enquanto houver banner.
  A primeira versão (1916×821, uma arte só, entre a logo e o formulário) ficou
  no ar poucos minutos: empurrava o formulário para baixo da dobra.
- **Foto do "Quem é"** (14/09/2026): foto do dono, `assets/loja-fachada.webp`
  (1200×724, 144 KB; PNG de 1615×974 em `assets/_originais/loja-fachada.png`),
  ligada por `LOJA_FOTO_SOBRE`. Chama "fachada" porque foi o nome que ele deu —
  a foto é a parede de tênis com o letreiro, e o `alt` descreve isso. É
  **deitada**, então o `.about-img img` ganhou `height:auto` e voltou ao
  enquadramento `center`: sem o `height:auto` a altura saía do atributo do
  `<img>`, travava no `max-height` e o `cover` cortava as laterais. Trocou a
  foto? acerte o `width`/`height` do `<img>` no `storePage()` (pages.js).
- O banner provisório que eu tinha desenhado em HTML (logo + fotos + preço)
  **foi apagado** junto com as fotos dele, e o `gerar-arte.mjs` deixou de gerar
  banner: rodá-lo por hábito sobrescreveria a arte do dono. Ele agora só refaz
  a tabela de medidas.
- **Tabela de medidas:** `assets/tabela-medidas.png`, sem marca, 34–44, nas
  cores da logo. A fonte editável é `assets/tabela-medidas-fonte.html`.
- **As artes de `/assets` saem com `?v=`** tirado da data do arquivo
  (`comVersao` em `pages.js`): banner, logo e tabela. O `/assets` tem cache de 7
  dias e, sem isso, a troca do banner provisório pelo da logo ficou invisível
  para quem já tinha aberto a loja — aconteceu nas próprias capturas de teste.
- O topo só aparece se `banner-principal-mobile.webp` existir (`TEM_BANNER`,
  trava trazida da Nação 13).
- O Chrome headless não abre janela menor que ~500px: pedindo 192, o layout
  segue a janela mínima e o conteúdo cai fora do recorte. Por isso as artes
  pequenas saem de imagem grande reduzida, nunca de render direto.

## O que NÃO veio da A Fonte, e por quê

| o que era | como está |
| --- | --- |
| logo, banners, arte do Instagram, foto da loja, ícones | nada disso veio; logo, banners e foto da loja próprios (do dono), ícones feitos a partir da logo |
| 6 depoimentos com foto | **lista vazia** — clientes da A Fonte, autorização dada àquela loja |
| CNPJ nos termos (`14.531.600/0001-90` como padrão no código) | **sem padrão**: sem `LOJA_CNPJ` a linha some dos documentos |
| Coreon própria e UmbrellaPag "Dripzone" | **chaves vazias** — o dinheiro iria para a conta de outra loja |
| Pixel da Meta | pixel próprio (`1563522885353553`); o token da Conversions API fica só no painel da Render |
| Pixel da UTMify | pixel próprio (`6a68036e9e4969c2b239d1df`); o token de API fica só no painel da Render |
| tela do código 2FA escrita "NATION47" | agora sai de `LOJA_NOME` |
| Instagram `@a_fonte.ofc` | perfil próprio: `@estilo_de_artista_` (`https://www.instagram.com/estilo_de_artista_/`, em `LOJA_INSTAGRAM`) |

## Banco: Postgres (Supabase)

O banco é **Postgres**, não mais SQLite em disco. A conexão fica em
`src/pg.js`; o que cada consulta significa, em `src/db.js`.

Por que mudou: na Vercel não existe disco. Cada requisição pode cair numa
instância diferente, e o que uma gravasse em arquivo a outra não enxergaria —
o postback da Coreon chegaria numa instância que nunca viu o pedido, e o
dinheiro entraria sem o pedido ficar pago.

- **Produção:** `DATABASE_URL` com a string da Supabase, a do **pooler em modo
  transação** (porta 6543), não a conexão direta: serverless abre muitas
  conexões e a direta esgota.
- **`DB_SCHEMA=estilodeartista`** — e isto não é detalhe. O projeto da Supabase
  é compartilhado com outras lojas, e os nomes de tabela desta base de código
  são genéricos (`orders`, `products`, `settings`): duas lojas no mesmo schema
  gravariam pedido na mesma tabela, e depois de os pedidos se intercalarem não
  haveria como separar. O schema entra no pacote de abertura da conexão
  (`options=-c search_path=...`), que é o único jeito que sobrevive ao pooler em
  modo transação — um `SET` solto não sobrevive, porque cada consulta pode cair
  numa conexão diferente. `public` **não** entra como reserva de propósito: com
  ele, uma tabela que faltasse aqui seria encontrada no schema de outra loja, e
  a falha seria silenciosa. Se o schema não estiver valendo, `pg.js` se recusa a
  abrir em vez de gravar no lugar errado.
- **Local e testes:** sem `DATABASE_URL`, sobe um Postgres embutido (PGlite) na
  pasta do `DATA_DIR`. Não precisa instalar nada e não toca em produção.
- O esquema é criado sozinho na primeira requisição (`criarEsquema` em `db.js`).

Três regras para quem mexer no código:

1. **Tudo que fala com o banco é assíncrono** e precisa de `await`. As duas
   exceções são `getSetting` e `setSetting`, que continuam síncronas de
   propósito (as páginas são montadas de forma síncrona e leem personalização
   no meio da montagem). As settings ficam numa cópia em memória, conferida
   com o banco a cada requisição.
2. **Trabalho disparado sem `await` que precise terminar passa por
   `emSegundoPlano`** (`src/segundoPlano.js`). Na Vercel a instância pode ser
   congelada assim que a resposta sai; sem isso a Coreon recebe o 200 e o
   pedido nunca fica pago. Esquecer não dá erro — só perde o trabalho, às
   vezes, em produção, sem log.
3. **A vitrine "Mais Vendidos" é lida de forma síncrona** pelas páginas
   (`collections.js`), então `handlesMaisVendidos()` continua síncrona e
   devolve o que está em memória; quem atualiza é `aquecerMaisVendidos()`, em
   segundo plano, chamado pelo `app.js`. Se ela virar assíncrona, arrasta as
   views inteiras.

### Trazer os dados do SQLite antigo

```
node scripts/migrar-sqlite-para-postgres.mjs caminho/do/checkout.sqlite
```

Baixe o `checkout.sqlite` do disco do Render (Shell: fica em
`$DATA_DIR/checkout.sqlite`) e aponte `DATABASE_URL` e `DB_SCHEMA` para a
Supabase antes de rodar. É idempotente (upsert por chave) e não apaga nada do
destino — pode rodar **de novo** depois da virada para pegar pedido criado no
meio do caminho. No fim ele conta os pedidos que entraram; confira no painel
antes de desligar o Render.

## Deploy

**No ar desde 14/09/2026:** https://estilo-de-artista-checkout.onrender.com

| coisa | onde |
| --- | --- |
| código | `brkznstreet-ctrl/EstiloDeArtista-Checkout` (privado), branch `main` |
| serviço | `estilo-de-artista-checkout`, `srv-dajv6g7qj5pc73f7abeg`, plano starter |
| região | virginia, como a A Fonte |
| disco | `checkout-data`, 1 GB em `/var/data` |

`autoDeploy` está ligado: **push no `main` sobe sozinho**. O banco não vai no
git; o primeiro boot importa o `data-import/products_export.csv` sozinho.

**CUIDADO ao levar o Postgres para o `main` enquanto o Render estiver no ar:**
o serviço do Render não tem `DATABASE_URL`, então o código novo cairia num
Postgres embutido VAZIO e a loja apareceria sem pedidos nem catálogo — e PIX
pendente pago no intervalo não confirmaria. Antes de juntar: desligar o
`autoDeploy` do Render, ou pôr `DATABASE_URL` e `DB_SCHEMA` nele.

### Na Vercel

`vercel.json`: todas as rotas caem em `api/index.js`, que entrega o mesmo app
Express de `src/app.js`. `src/server.js` só existe para rodar como processo de
longa duração (local e Render) — na Vercel não há `listen`.

**`routes` e não `rewrites`, e isto é segurança, não estilo.** `rewrites` só
vale DEPOIS de a Vercel procurar um arquivo com aquele caminho na publicação —
e como o código vai inteiro para lá, `/src/db.js`, `/src/config.js` e o CSV do
catálogo seriam servidos como arquivo estático para qualquer pessoa (foi o que
aconteceu com a AvaliaJá e com o Nation 47, confirmado no ar em 30/09/2026).
`routes` é avaliado ANTES do sistema de arquivos, então tudo passa pelo Express
e o que não é rota vira 404. As imagens continuam pelo `express.static` com 7
dias de cache, e a borda da Vercel guarda a resposta.

`APP_URL` é obrigatória em produção: sem ela o endereço vem de `VERCEL_URL`, que
muda a cada publicação — e um link de pedido com esse endereço morre no deploy
seguinte.

**A Coreon tem UMA URL de retorno, cadastrada no painel dela** (não por
cobrança, como o Umbrella). Então na virada a ordem importa: migrar os pedidos,
apontar o domínio, trocar a URL na Coreon e **rodar a migração de novo** para
pegar pedido criado no meio.

**O serviço NÃO nasceu do `render.yaml`** — foi criado pela API do Render, como
o da A Fonte. Editar o blueprint não muda nada no que está rodando; variável se
mexe em Render → estilo-de-artista-checkout → Environment, e só vale depois de
um deploy novo (restart não basta).

Variáveis no ar: as de marca e preço do `render.yaml`, mais duas que **não**
são as do `.env` local:

- **`DEV_TOOLS=0`.** O `.env` tem `1`; no ar isso deixaria qualquer um simular
  pagamento pelo `POST /api/dev/pay/:orderId`.
- **`ADMIN_PASSWORD` própria**, gerada no deploy. A do `.env` vale só nesta
  máquina.

Sem Shopify, Meta ou UTMify. Gateway: Coreon, desde 14/09/2026 (abaixo).

### Domínio reserva: estilodeartista.store (desde 24/09/2026)

**O principal é o `.shop`** (seção seguinte). O `.store` ficou só de reserva:
está ligado ao serviço e abre a mesma loja, mas o `APP_URL` voltou para
`https://estilodeartista.shop` no deploy `dep-daqqe5vavr4c7395sr6g`, ainda em
24/09/2026. Se um dia precisar dele como principal, basta trocar o `APP_URL` e
fazer um deploy novo. O resto já está pronto.

Registrado na Hostinger em 24/09/2026 e apontado da mesma forma que o `.shop`
(abaixo): zona com `A @ 216.24.57.1` e `CNAME www
estilo-de-artista-checkout.onrender.com.` no lugar do estacionamento, pela API
da Hostinger. No Render entrou pelo `POST /custom-domains` (um pedido só cria o
apex e o `www`, que redireciona para o apex); ambos `verified`. Começou a
resolver no 8.8.8.8 uns 4 minutos depois de trocar a zona, e o TLS saiu uns 3
minutos depois disso.

Ele foi principal por uns minutos (deploy `dep-daqpv3vlot8c73e8tqbg`). O
webhook da Coreon ficou no `onrender.com` o tempo todo.

> **Em 24/09/2026 o `.shop` saiu do ar por alguns minutos.** O servidor do
> registro `.shop` (GMO) respondia NXDOMAIN, embora a Hostinger mostrasse o
> domínio `Active` e a zona estivesse certa. Pouco depois voltou sozinho. Se
> acontecer de novo, a saída é o `.store`.

### Domínio principal: estilodeartista.shop

Registrado na **Hostinger em 14/09/2026** (12:49 de Brasília) e apontado para
o Render no mesmo dia, pela **API da Hostinger** (`PUT
/api/dns/v1/zones/estilodeartista.shop` com `overwrite: true`, que mescla por
nome+tipo — ver `hostinger-resend.md`). Os dois endereços estão no serviço
(`estilodeartista.shop` e `www.estilodeartista.shop`, com o `www`
redirecionando para o apex), ambos `verified` no Render.

Zona DNS na Hostinger (os NS do domínio são os dela, `lunar` e
`solar.dns-parking.com`):

| tipo | nome | valor |
| --- | --- | --- |
| A | `@` | `216.24.57.1` |
| CNAME | `www` | `estilo-de-artista-checkout.onrender.com.` |

O apex é **A e não CNAME** porque CNAME na raiz não existe no DNS;
`216.24.57.1` é o endereço que o Render publica para apex. Os dois registros
de antes eram do estacionamento da Hostinger (`A @ 2.57.91.91` e o `www`
apontando para o próprio domínio) e foram substituídos. A zona não tinha MX,
TXT nem CAA, então **nenhum e-mail foi derrubado** — se um dia houver e-mail no
domínio, conferir isso antes de mexer.

O TLS o Render emite sozinho depois que o domínio verifica: aqui levou **cerca
de um minuto e meio**. O `.shop` recém-registrado já resolvia no 8.8.8.8 e no
1.1.1.1 quando a zona foi trocada (na A Fonte a delegação demorou uns 20
minutos). `http://` responde `301` para `https://`, e o `www` redireciona para o
apex.

**`APP_URL=https://estilodeartista.shop`** está definida no Render (deploy
`dep-dak3coad0e5s738i4iqg`), e só depois de o TLS responder — é ela que faz a
loja falar o domínio novo: links de e-mail, `event_source_url` da Meta e o campo
`domain` que vai para a Coreon em cada cobrança. O código não redireciona o
`onrender.com` para o domínio; os dois endereços servem a mesma loja.

> **O webhook da Coreon continua no endereço `onrender.com`, de propósito.** Ele
> é cadastrado uma vez por conta, e o `onrender.com` nunca muda — se seguisse o
> domínio, perder ou trocar o domínio viraria cliente pagando sem o pedido
> fechar. O `/admin` → Gateway mostra o endereço do Render por isso.

## Gateway: Coreon Pay (desde 14/09/2026)

Conta `3333e1b3-…`. Vieram três valores e só dois são credencial — a regra da
A Fonte vale aqui também: **32 hex = key, 48 hex = secret, UUID = id da
conta** (o UUID usado como chave dá 401).

Conferido contra `GET /api/v1/balance` em 14/09/2026: `200 {"success":true}`.
**A conta não é nova** — já tem saldo e saques. Se ela também atende outra
loja, o webhook (um por conta, abaixo) é o ponto a conferir antes de mexer.

No Render: `COREON_API_KEY`, `COREON_API_SECRET` e `DEFAULT_GATEWAY=coreon`,
gravadas uma a uma pela API (`PUT /v1/services/{id}/env-vars/{CHAVE}` — o
`PUT` sem a chave substitui a lista inteira).

**Webhook cadastrado em 14/09/2026.** A Coreon não aceita postback por
cobrança: ele é cadastrado no painel dela (Integrações → Webhooks), evento
`payment.paid`, neste endereço — o do Render, que não muda se um dia entrar
domínio próprio:

```
https://estilo-de-artista-checkout.onrender.com/webhooks/coreon
```

O `whsec_` que o painel devolveu está em `COREON_WEBHOOK_SECRET` (Render e
`.env`) desde o deploy `dep-dak12abl550s73bk7v90`. Sem o webhook, o cliente
paga e o pedido fica pendente — sem erro nenhum aparecer.

**Conferido no log do Render em 14/09/2026**, e não só "salvei a variável":
três postbacks no serviço no ar, com referência inventada (nenhum pedido
tocado). Os três respondem `200` na hora — o `curl` sozinho não distingue; a
resposta está no log (`GET /v1/logs` com `ownerId`, `resource` e
`text=webhook coreon`):

| postback | log |
| --- | --- |
| assinado com o `whsec_` | passou a assinatura, parou em "sem pedido correspondente" |
| assinado com segredo errado | "ASSINATURA INVÁLIDA" — descartado |
| sem assinatura | "SEM ASSINATURA" — descartado (é o pedido forjado do aviso abaixo) |

**Compra real de ponta a ponta ainda não foi feita**: nenhuma cobrança foi
criada nesta conta pelo app. O primeiro PIX pago é a prova que falta.

> **Não vender com `COREON_WEBHOOK_SECRET` vazio.** O código aceita (avisa no
> log e confirma pelo `external_reference`), mas o `external_reference` é o
> id do pedido, que o próprio cliente conhece, e id da transação e valor só são
> conferidos SE vierem no corpo. Um POST em `/webhooks/coreon` com o próprio
> número do pedido e `"event":"payment.paid"` marca o pedido como pago sem PIX
> nenhum — é o mesmo buraco que o comentário do ramo `sem-header` descreve, só
> que por outro caminho. Com o segredo preenchido, postback sem assinatura é
> descartado.

## Gateway: Solution Payments (desde 29/09/2026)

Segundo gateway da loja, a pedido do dono. **A Coreon continua a ativa**: a
Solution entra como opção na aba `/admin` → Gateway, e a troca é um clique lá
(vale na hora, sem deploy). O código já existia (veio da A Fonte) e confere com
a documentação em `app.solutionpayments.com.br/documentacao`:

| coisa | como é |
| --- | --- |
| autenticação | Basic, usuário fixo `x` + a chave `sk_…` |
| criar PIX | `POST /v1/transactions.php`, valores em **centavos** |
| consultar | `GET /v1/transaction.php?id=…` |
| webhook | vai **por cobrança** (`postbackUrl`), nada a cadastrar no painel dela |

Uma chave só: `SOLUTION_API_KEY` (no `.env` e no Render). Conferida em
29/09/2026 contra a consulta: com a chave, `404 Transaction not found`; com
chave inventada, `401`.

**O postback da Solution não tem assinatura.** Por isso o webhook
(`src/routes/solutionWebhook.js`) não acredita no corpo: acha o pedido pelo
`?token=` secreto da URL e **pergunta à API da Solution** se a transação que a
loja criou está `paid` e com o valor certo. Só então marca como pago. Se a
consulta falhar (fora do ar, formato inesperado), cai nas conferências do corpo
— id e valor —, que eram as únicas antes.

Testado em banco temporário, sem marcar pedido nenhum: token errado, evento
pendente, pago forjado com id divergente e pago forjado com valor menor — os
quatro descartados.

**Falta a compra real.** Nenhum PIX foi gerado nesta conta pelo app. No primeiro
pago, olhar o log do Render por `webhook solution`:

- `marcado como PAGO (confirmado na API)` — tudo certo;
- `consulta à API falhou … conferindo pelo corpo` — o id que a criação devolve
  não é o que a consulta aceita; o pedido fecha mesmo assim, mas vale acertar;
- `id divergente` — o postback manda um id diferente do da criação e o pedido
  **fica pendente**: marcar na mão no `/admin` e ajustar o webhook.

> **O postback segue o `APP_URL`** (`estilodeartista.shop`), diferente do da
> Coreon, que é fixo no `onrender.com`. Se o domínio cair, os postbacks da
> Solution não chegam até ele voltar (ela tenta de novo sozinha).

## Pendências

1. ~~**Webhook da Coreon**~~ **Cadastrado e com segredo em 14/09/2026** — ver
   "Gateway".
2. **`LOJA_CNPJ`, `LOJA_EMAIL` e WhatsApp** (o e-mail é de exemplo).
3. ~~**Logo**~~ **Feita em 13/09/2026** — ver "Marca". As cores passaram para as
   dela; se o dono preferir o roxo da A Fonte, é uma linha.
4. ~~**Deploy**~~ **No ar desde 14/09/2026** — ver "Deploy", com domínio
   próprio (`estilodeartista.shop`) no mesmo dia.
5. **Nomes genéricos** dos TN/LV (ver Catálogo).
6. **Fotos** servidas do CDN da Shopify da Drip (`/1/0770/9058/6782/`) — e as
   dos Air Max 95, do CDN da Nation (`/1/0994/4570/2975/`). Funciona enquanto
   as duas lojas existirem.
7. **Central de Lojas:** o módulo veio no código, mas sem `CENTRAL_TOKEN` a loja
   não aparece no painel único.
8. `captura-drip/gerar-csv.mjs` é o script da A Fonte (lê o banco dela); ficou
   como registro de agosto. Nesta loja o caminho é `gerar-extras` + `montar`.
