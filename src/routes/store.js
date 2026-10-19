import { Router } from 'express';
import { storePage, cartPage, checkoutPage, collectionPage, productPage, legalPage, upsellPage, recuperacaoPage } from '../views/pages.js';
import { getCustomization } from '../checkout/customization.js';
import { DOCS } from '../views/legal-docs.js';

const router = Router();

// Logo enviada pelo /admin. Fica no banco (não no disco) porque disco zerado
// no Render levaria a arte junto e a loja subiria sem marca — mesma armadilha
// que já mordeu as chaves de notificação. O nome do arquivo diz .png, mas o
// tipo real sai do próprio data URI: aceita jpeg, webp e svg também.
function serveLogo(fundo) {
  return (_req, res) => {
    const cx = getCustomization();
    const bruto = fundo === 'clara' ? (cx.logo.clara || cx.logo.escura) : cx.logo.escura;
    if (!bruto) return res.status(404).end();

    const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(bruto);
    if (!m) return res.status(404).end();

    // Cache longo é seguro: o endereço carrega ?v= derivado do conteúdo, então
    // trocar a arte troca a URL e o navegador busca de novo sozinho.
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');

    // SVG é o único formato aceito aqui que pode conter <script>, e esta rota
    // o devolve como documento próprio — abrir /marca/logo.png no navegador
    // executaria esse script NO DOMÍNIO DA LOJA (dentro de <img> não roda, mas
    // na URL direta roda). Plantar a arte exige o /admin já invadido, então
    // isto não é porta de entrada; é para o estrago não continuar depois, com
    // um endereço da própria loja servindo script para o cliente.
    //
    // Content-Disposition faz o navegador BAIXAR em vez de renderizar, e a CSP
    // desliga script mesmo se ele for aberto de outro jeito. A logo em <img>
    // continua aparecendo normalmente — <img> não é afetado por nenhum dos dois.
    if (m[1] === 'image/svg+xml') {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    return res.type(m[1]).send(Buffer.from(m[2], 'base64'));
  };
}

router.get('/marca/logo.png', serveLogo('escura'));
router.get('/marca/logo-claro.png', serveLogo('clara'));

// storePage virou assíncrona quando o hero passou a mostrar um par real do
// catálogo (ele é lido do banco). Erro aqui não pode derrubar a home: sem o
// produto o hero se monta só com o texto — quem trata isso é o produtoDoHero.
router.get('/', async (_req, res, next) => {
  try { res.type('html').send(await storePage()); }
  catch (e) { next(e); }
});
// Carrinho: parada entre o "Adicionar ao carrinho" e o checkout.
router.get('/carrinho', (_req, res) => res.type('html').send(cartPage()));
router.get('/checkout', (_req, res) => res.type('html').send(checkoutPage()));
// Coleções: /colecao/air-max-tn — o handle é resolvido pela tag no /api/colecao.
router.get('/colecao/:handle', (req, res) => res.type('html').send(collectionPage(req.params.handle)));
router.get('/produto/:handle', (req, res) => res.type('html').send(productPage(req.params.handle)));
// Oferta pós-compra. A página nasce vazia e só se monta depois que o token da
// URL passa pelo /api/oferta — quem valida o acesso é o backend, não esta rota.
router.get('/oferta/:id', (req, res) => res.type('html').send(upsellPage(req.params.id)));
// Recuperação de PIX abandonado. Mesma ideia da oferta: a página nasce vazia e
// só se monta depois que o token da URL passa pelo /api/recuperar — quem decide
// o acesso é o backend, nunca esta rota.
router.get('/recuperar/:id', (req, res) => res.type('html').send(recuperacaoPage(req.params.id)));

// Rastreio: aceita ?pedido=<id> pra já vir com o número preenchido.

// Políticas (privacidade, trocas, termos). Uma rota por documento, com o
// endereço saindo da própria lista — assim criar um documento novo em
// legal-docs.js já publica a página, sem ninguém lembrar de vir aqui.
// legalPage devolve null quando LOJA_LEGAL=0: a página some de verdade (404),
// não fica servindo a política de outra loja com o nome trocado.
for (const doc of DOCS) {
  router.get(`/${doc.slug}`, (_req, res) => {
    const pagina = legalPage(doc.slug);
    if (!pagina) return res.status(404).send('Página não encontrada');
    return res.type('html').send(pagina);
  });
}

export default router;
