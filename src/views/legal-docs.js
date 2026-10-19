// ============================================================================
// PÁGINAS INSTITUCIONAIS — privacidade, trocas e termos de uso
//
// O TEXTO mora aqui, separado do pages.js, por dois motivos:
//  1. pages.js já passa de 3 mil linhas — enfiar 400 linhas de texto jurídico
//     no meio da vitrine deixaria o arquivo impossível de navegar;
//  2. quem edita o texto (o Gustavo, o contador, um advogado) não deveria
//     precisar entender template literal, CSS nem rota pra trocar uma frase.
//
// COMO EDITAR: mexa só no conteúdo das crases de cada `corpo`. A marcação é um
// markdown minúsculo, e é só isso que o renderizador entende:
//
//     ## 1. Título de seção        -> título grande
//     ### Subtítulo                -> título menor
//     * item                       -> item de lista com marcador
//     **negrito**                  -> negrito
//     [texto](mailto:a@b.com)      -> link
//     linha em branco              -> separa parágrafos
//
// Linhas seguidas viram UM parágrafo com quebra de linha entre elas (é o que
// faz o bloco de contato sair com e-mail e WhatsApp um embaixo do outro).
//
// PLACEHOLDERS: o que está entre chaves duplas é preenchido na hora de montar
// a página, não na hora de escrever:
//     {{LOJA}}   nome da loja           {{EMAIL}}  e-mail de atendimento
//     {{ZAP}}    WhatsApp formatado     {{CNPJ}}   CNPJ da empresa
// E-mail e WhatsApp vêm da aba WhatsApp do /admin — trocar lá troca também
// aqui, sem redeploy. Nunca escreva o número na mão no texto: seria a segunda
// cópia do dado, e as duas iam divergir no dia em que o número mudasse.
//
// AO ALTERAR O TEXTO, atualize ATUALIZADO logo abaixo. A data aparece no rodapé
// de cada documento e é ela que prova, numa discussão, qual versão valia quando.
// ============================================================================

import { getContato, formatarWhatsapp } from '../checkout/contato.js';

// Data da última revisão dos textos. Formato brasileiro, escrita à mão de
// propósito: gerar com new Date() faria a página se dizer "atualizada hoje"
// todo dia, sem ninguém ter revisado nada.
const ATUALIZADO = '24/08/2026';

// CNPJ do responsável. Sai por variável de ambiente porque este mesmo código
// atende mais de uma loja (um serviço por loja no Render). SEM padrão nesta
// loja: o que vinha aqui era o CNPJ da A Fonte, e publicá-lo nos termos da
// Estilo de Artista diria ao cliente que outra empresa responde pela venda.
// Vazio, a linha some dos documentos (ver preencher).
const CNPJ = (process.env.LOJA_CNPJ || '').trim();

// Nome da loja nos textos — mesma variável que o resto do site usa.
const LOJA_NOME = process.env.LOJA_NOME_COMPLETO || process.env.LOJA_NOME || 'Estilo de Artista';

// Estas páginas são ESPECÍFICAS de loja de tênis: o texto fala em numeração
// e sola. LOJA_LEGAL=0 desliga as páginas e some com os links dos rodapés — é
// o que a Knife Lab e qualquer loja futura precisam fazer até terem os próprios
// documentos. Servir a política da Nation numa loja de facas seria pior do que
// não ter política nenhuma.
export const LEGAL_LIGADO = process.env.LOJA_LEGAL !== '0';

// ---------------------------------------------------------------- documentos
// `menu` é o texto curto do rodapé; `titulo` é o cabeçalho da página inteira.
export const DOCS = [
  {
    slug: 'politica-de-privacidade',
    menu: 'Política de Privacidade',
    titulo: 'Política de Privacidade',
    resumo: 'Como coletamos, usamos, guardamos e protegemos os seus dados.',
    corpo: `
A **{{LOJA}}** valoriza a privacidade, a segurança e a confiança de seus clientes. Esta Política de Privacidade explica como coletamos, utilizamos, armazenamos e protegemos as informações fornecidas durante a navegação e utilização do nosso site.

## 1. Informações coletadas

Durante sua navegação, cadastro ou compra, poderemos coletar informações como:

* Nome completo;
* CPF, quando necessário para faturamento ou envio;
* Endereço de entrega e cobrança;
* E-mail;
* Telefone e WhatsApp;
* Informações relacionadas ao pedido;
* Dados necessários para processamento e acompanhamento da compra;
* Informações técnicas de navegação, como endereço IP, navegador, dispositivo e páginas acessadas.

As informações de pagamento poderão ser processadas diretamente por empresas especializadas e intermediadores financeiros.

A **{{LOJA}}** não armazena os dados completos de cartões quando o pagamento é realizado por plataformas de pagamento terceirizadas.

## 2. Como utilizamos seus dados

As informações coletadas poderão ser utilizadas para:

* Processar e confirmar pedidos;
* Confirmar pagamentos;
* Preparar e realizar o envio dos produtos;
* Enviar informações sobre o andamento do pedido;
* Disponibilizar informações de rastreamento;
* Prestar suporte e atendimento ao cliente;
* Prevenir fraudes e atividades suspeitas;
* Melhorar a experiência de navegação no site;
* Melhorar nossos produtos e serviços;
* Enviar ofertas e comunicações promocionais, quando autorizado pelo cliente.

## 3. Compartilhamento de informações

Os dados do cliente poderão ser compartilhados somente quando necessário com empresas responsáveis por:

* Processamento de pagamentos;
* Transportadoras e serviços de entrega;
* Correios, quando aplicável;
* Hospedagem e funcionamento da plataforma;
* Sistemas de gerenciamento de pedidos;
* Serviços de atendimento;
* Ferramentas de análise e marketing;
* Sistemas de prevenção contra fraudes;
* Autoridades públicas, quando houver obrigação legal.

A **{{LOJA}} não vende nem comercializa os dados pessoais de seus clientes**.

## 4. Cookies

Nosso site poderá utilizar cookies e tecnologias semelhantes para:

* Melhorar sua experiência de navegação;
* Lembrar suas preferências;
* Manter produtos no carrinho;
* Analisar o funcionamento e desempenho do site;
* Entender como os visitantes utilizam nossas páginas;
* Exibir publicidade e ofertas mais relevantes, quando aplicável.

O cliente poderá bloquear ou excluir cookies diretamente nas configurações de seu navegador.

Algumas funcionalidades do site poderão ser afetadas caso determinados cookies sejam desativados.

## 5. Segurança das informações

A {{LOJA}} adota medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra:

* Acessos não autorizados;
* Alterações indevidas;
* Perdas;
* Vazamentos;
* Divulgação não autorizada;
* Utilização indevida.

Apesar das medidas de segurança adotadas, nenhum sistema conectado à internet pode ser considerado totalmente livre de riscos.

## 6. Direitos do cliente

De acordo com a legislação brasileira aplicável, incluindo a Lei Geral de Proteção de Dados Pessoais — LGPD, o cliente poderá solicitar, quando cabível:

* Confirmação da existência de tratamento de dados;
* Acesso aos seus dados pessoais;
* Correção de dados incorretos ou desatualizados;
* Informações sobre o compartilhamento dos dados;
* Exclusão ou anonimização de determinados dados, quando permitido pela legislação;
* Revogação de consentimentos anteriormente fornecidos;
* Informações sobre a forma como seus dados são utilizados.

Algumas informações poderão ser mantidas pelo período necessário para cumprimento de obrigações legais, fiscais, regulatórias ou para exercício de direitos.

## 7. Comunicações promocionais

Caso o cliente tenha autorizado o recebimento de comunicações comerciais, a {{LOJA}} poderá enviar:

* Novidades;
* Promoções;
* Cupons;
* Lançamentos;
* Avisos sobre produtos;
* Ofertas especiais.

O cliente poderá solicitar o cancelamento dessas comunicações a qualquer momento.

Mensagens relacionadas a pedidos, pagamentos, segurança, rastreamento ou atendimento poderão continuar sendo enviadas quando necessárias.

## 8. Links e serviços de terceiros

Nosso site poderá utilizar serviços ou conter links de terceiros.

A {{LOJA}} não é responsável pelas práticas de privacidade adotadas por páginas externas, plataformas de pagamento, redes sociais ou outros serviços que possuam suas próprias políticas.

## 9. Alterações desta política

Esta Política de Privacidade poderá ser atualizada periodicamente para refletir mudanças em nossos serviços, processos ou exigências legais.

A versão mais recente permanecerá disponível em nosso site.

## 10. Contato

Em caso de dúvidas relacionadas à privacidade ou ao tratamento de dados pessoais, entre em contato:

**{{LOJA}}**

**E-mail:** [{{EMAIL}}](mailto:{{EMAIL}})
**WhatsApp:** {{ZAP}}
**CNPJ/CPF responsável:** {{CNPJ}}
`,
  },

  {
    slug: 'politica-de-trocas',
    menu: 'Trocas e Devoluções',
    titulo: 'Política de Trocas, Devoluções e Reembolsos',
    resumo: 'Prazos, condições e como pedir troca, devolução ou reembolso.',
    corpo: `
A **{{LOJA}}** deseja proporcionar uma experiência de compra transparente e segura.

Por isso, esta política apresenta os procedimentos relacionados a trocas, devoluções, defeitos e reembolsos.

## 1. Direito de arrependimento

Nas compras realizadas pela internet, o consumidor poderá exercer o direito de arrependimento dentro do prazo legal de **7 dias corridos a partir do recebimento do produto**, conforme aplicável à legislação brasileira.

Não é necessário que o produto apresente defeito para o exercício do direito de arrependimento dentro do prazo legal.

Para iniciar a solicitação, entre em contato conosco informando:

* Nome completo;
* Número do pedido;
* Produto adquirido;
* Data de recebimento;
* Motivo da solicitação.

## 2. Condições para devolução

Sempre que possível, o produto deverá ser encaminhado:

* Com a embalagem recebida;
* Com etiquetas e acessórios;
* Sem alterações realizadas pelo cliente;
* Sem danos causados por utilização inadequada;
* Em condições compatíveis com uma avaliação do produto.

O item devolvido poderá passar por uma análise após o recebimento.

Essa análise não limita ou exclui direitos legalmente garantidos ao consumidor.

## 3. Troca de tamanho

Caso o tamanho escolhido não tenha ficado adequado, entre em contato com nosso atendimento para verificar a possibilidade de troca.

A troca estará sujeita à disponibilidade do modelo e da numeração desejada.

Caso o mesmo produto não esteja disponível, poderão ser apresentadas alternativas, como:

* Outro tamanho;
* Outro modelo;
* Crédito para utilização na loja;
* Outra solução acordada com o cliente e permitida pela legislação.

## 4. Produto com defeito

Caso seja identificado um possível defeito de fabricação, entre em contato com nosso atendimento.

Poderemos solicitar:

* Fotos do produto;
* Vídeos;
* Número do pedido;
* Descrição do problema;
* Data em que o defeito foi identificado.

Para produtos duráveis, serão respeitados os prazos e garantias previstos na legislação brasileira.

Quando constatado defeito coberto pela garantia, serão disponibilizadas as soluções previstas na legislação aplicável.

## 5. Situações que podem não caracterizar defeito

Após análise, determinadas situações poderão ser identificadas como decorrentes de uso ou desgaste, tais como:

* Desgaste natural da sola;
* Danos provocados por uso inadequado;
* Cortes ou rasgos causados externamente;
* Lavagem inadequada;
* Utilização de produtos químicos;
* Secagem incorreta;
* Alterações realizadas pelo consumidor;
* Danos resultantes da conservação inadequada.

A análise de cada situação será realizada sem prejuízo dos direitos legais do consumidor.

## 6. Produto incorreto ou divergente

Se você receber:

* Modelo diferente do comprado;
* Cor diferente da solicitada;
* Tamanho incorreto;
* Quantidade diferente;
* Produto danificado durante o transporte;

entre em contato conosco assim que identificar o problema.

Após a confirmação da ocorrência, serão apresentadas as providências adequadas sem prejuízo dos direitos do consumidor.

## 7. Reembolso

Quando a devolução for aprovada e houver direito ao reembolso, a restituição será realizada preferencialmente através do mesmo meio de pagamento utilizado na compra, observadas as condições da instituição financeira ou plataforma de pagamento.

### Pagamentos via PIX

Nos casos aplicáveis, o valor poderá ser devolvido via PIX para uma conta indicada pelo comprador.

Poderemos solicitar os dados necessários exclusivamente para realização do reembolso.

### Pagamentos com cartão

O pedido de estorno será encaminhado à intermediadora ou operadora responsável.

O prazo para que o valor apareça na fatura depende do banco, da bandeira do cartão e da data de fechamento da fatura.

A {{LOJA}} não controla os prazos internos das instituições financeiras após a solicitação do estorno.

## 8. Frete de devolução

Quando a devolução ou troca decorrer de:

* Direito de arrependimento exercido nos termos legais;
* Defeito coberto;
* Erro cometido pela loja;
* Produto divergente do pedido;

os custos serão tratados conforme a legislação aplicável.

Quando a troca ocorrer exclusivamente por preferência do consumidor fora das hipóteses em que a loja possua obrigação legal de custear o procedimento, eventuais custos serão previamente informados.

## 9. Como solicitar uma troca ou devolução

Para agilizar o atendimento, envie:

* Nome completo;
* Número do pedido;
* Telefone utilizado na compra;
* Produto relacionado à solicitação;
* Motivo;
* Fotos ou vídeos, quando necessários.

### Canais de atendimento

**WhatsApp:** {{ZAP}}
**E-mail:** [{{EMAIL}}](mailto:{{EMAIL}})

Nossa equipe fornecerá as orientações necessárias para o envio ou continuidade da solicitação.

## 10. Prazo para análise

Após o recebimento do produto devolvido, poderá ser realizada uma análise antes da conclusão do procedimento.

O cliente será informado sobre o andamento da solicitação através dos canais de atendimento disponibilizados pela {{LOJA}}.

## 11. Disposições finais

A **{{LOJA}}** busca solucionar todas as solicitações de forma transparente e respeitando a legislação brasileira.

Nenhuma disposição desta política pretende excluir, restringir ou limitar direitos garantidos ao consumidor.

Caso exista divergência entre esta política e uma obrigação estabelecida pela legislação brasileira, prevalecerá a norma legal aplicável.
`,
  },

  {
    slug: 'termos-de-uso',
    menu: 'Termos e Condições de Uso',
    titulo: 'Termos e Condições de Uso',
    resumo: 'As regras da compra: preços, estoque, pagamento, envio e entrega.',
    corpo: `
Bem-vindo à **{{LOJA}}**.

Ao acessar nosso site, navegar por nossas páginas ou realizar uma compra, você declara estar de acordo com estes Termos e Condições de Uso.

Recomendamos que leia atentamente todas as informações antes de finalizar seu pedido.

## 1. Sobre a {{LOJA}}

A **{{LOJA}}** é uma loja online especializada na comercialização de tênis e produtos relacionados.

Nosso objetivo é proporcionar uma experiência de compra simples, segura e transparente.

As fotografias, descrições, cores, medidas e demais informações dos produtos são apresentadas da forma mais fiel possível.

Entretanto, pequenas variações de tonalidade poderão ocorrer dependendo da iluminação das fotografias e das configurações da tela utilizada pelo cliente.

## 2. Cadastro e informações fornecidas

Ao realizar uma compra, o cliente se compromete a fornecer informações verdadeiras, completas e atualizadas.

É responsabilidade do cliente verificar corretamente:

* Nome completo;
* CPF, quando solicitado;
* E-mail;
* Telefone;
* CEP;
* Endereço;
* Número;
* Complemento;
* Cidade e estado;
* Tamanho e modelo escolhido.

Informações incorretas poderão ocasionar atrasos ou problemas na entrega.

## 3. Preços e promoções

Todos os preços apresentados no site são informados em reais (R$).

A {{LOJA}} poderá disponibilizar:

* Promoções;
* Cupons de desconto;
* Combos;
* Ofertas especiais;
* Frete promocional;
* Brindes;
* Campanhas por período limitado.

As condições poderão ser alteradas ou encerradas após o término do período promocional ou do estoque destinado à campanha.

O valor válido para o pedido será aquele apresentado no momento da finalização da compra, salvo em casos de erro evidente de sistema, digitação ou informação.

## 4. Disponibilidade dos produtos

Todos os pedidos estão sujeitos à disponibilidade de estoque.

Caso algum produto comprado fique indisponível devido a erro de estoque ou situação excepcional, a {{LOJA}} entrará em contato com o cliente para apresentar as alternativas disponíveis.

Dependendo da situação, poderão ser oferecidas opções como:

* Alteração do tamanho;
* Troca de modelo;
* Crédito na loja;
* Cancelamento do item;
* Reembolso do valor correspondente, quando aplicável.

Nenhuma substituição será realizada sem conhecimento do cliente.

## 5. Pagamento

As formas de pagamento disponíveis serão apresentadas durante o checkout.

A aprovação do pedido poderá depender da confirmação da instituição financeira ou intermediadora responsável pelo pagamento.

Pedidos cujo pagamento não seja aprovado, identificado ou concluído poderão ser cancelados.

Por motivos de segurança, determinadas compras também poderão passar por procedimentos de verificação antifraude.

## 6. Envio

Após a confirmação do pagamento, o pedido seguirá para preparação e postagem.

Quando disponível, o cliente receberá informações para acompanhamento e rastreamento da encomenda.

Os prazos apresentados durante a compra são estimativas e poderão variar conforme:

* Localidade;
* Modalidade de envio;
* Transportadora;
* Correios;
* Finais de semana e feriados;
* Condições climáticas;
* Greves;
* Restrições logísticas;
* Situações externas fora do controle da {{LOJA}}.

## 7. Endereço de entrega

É responsabilidade do cliente informar corretamente o endereço no momento da compra.

Caso o pedido retorne ao remetente por motivos como:

* Endereço incorreto;
* Endereço incompleto;
* Destinatário desconhecido;
* Falta de retirada;
* Ausência recorrente no endereço;

o cliente deverá entrar em contato com nosso atendimento.

Quando permitido pela legislação, eventuais custos para um novo envio poderão ser informados ao consumidor antes da repostagem.

## 8. Recebimento do pedido

Recomendamos verificar a embalagem no momento do recebimento.

Caso identifique:

* Produto incorreto;
* Quantidade divergente;
* Produto danificado;
* Embalagem severamente violada;
* Outro problema relacionado ao pedido;

entre em contato com nosso atendimento assim que possível.

## 9. Trocas e devoluções

As solicitações de troca, devolução, cancelamento ou reembolso deverão seguir nossa [Política de Trocas, Devoluções e Reembolsos](/politica-de-trocas), disponível no rodapé do site.

Os direitos garantidos ao consumidor pela legislação brasileira serão respeitados.

## 10. Uso adequado dos produtos

O cliente deverá utilizar os produtos de acordo com sua finalidade e realizar os cuidados necessários para sua conservação.

Desgaste natural, danos provocados pelo uso incorreto, lavagem inadequada, exposição indevida ou outras situações causadas após o recebimento poderão não ser caracterizados como defeito de fabricação.

## 11. Uso do site

Não é permitido utilizar o site da {{LOJA}} para:

* Práticas fraudulentas;
* Tentativas de invasão;
* Interferência no funcionamento da plataforma;
* Inserção de códigos maliciosos;
* Violação de direitos de terceiros;
* Utilização não autorizada de nossos conteúdos.

## 12. Propriedade intelectual

Textos, fotografias próprias, elementos gráficos, identidade visual e demais conteúdos desenvolvidos pela {{LOJA}} são protegidos pela legislação aplicável.

Marcas comerciais de terceiros eventualmente mencionadas ou exibidas pertencem aos seus respectivos titulares.

## 13. Disponibilidade do site

A {{LOJA}} busca manter sua plataforma disponível e funcionando adequadamente.

Entretanto, poderão ocorrer interrupções temporárias por:

* Atualizações;
* Manutenção;
* Instabilidade do servidor;
* Falhas de terceiros;
* Eventos externos fora de nosso controle.

## 14. Alterações destes termos

Estes Termos e Condições poderão ser atualizados sempre que necessário.

As novas versões serão disponibilizadas nesta página.

## 15. Legislação aplicável

As relações de consumo realizadas através da {{LOJA}} serão regidas pela legislação brasileira aplicável, especialmente pelas normas de proteção ao consumidor.

Nenhuma disposição destes Termos tem o objetivo de limitar direitos legalmente garantidos ao consumidor.

## 16. Contato

Caso tenha dúvidas sobre estes Termos ou sobre sua compra:

**{{LOJA}}**

**WhatsApp:** {{ZAP}}
**E-mail:** [{{EMAIL}}](mailto:{{EMAIL}})
**CNPJ/CPF responsável:** {{CNPJ}}
`,
  },
];

// Índice por slug, montado uma vez.
const PORSLUG = new Map(DOCS.map((d) => [d.slug, d]));

export const docPorSlug = (slug) => PORSLUG.get(slug) || null;

// Lista enxuta para os rodapés: só o que os links precisam saber. Vazia quando
// LOJA_LEGAL=0, e aí os rodapés não desenham nada.
export const linksLegais = () => (LEGAL_LIGADO ? DOCS.map((d) => ({ href: `/${d.slug}`, texto: d.menu })) : []);

// ------------------------------------------------------------- renderização
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

// Marcação de linha: negrito e link. Escapa ANTES de aplicar as tags, senão um
// "<" no texto viraria HTML de verdade. O & virando &amp; dentro do href é o
// comportamento correto de HTML, não um bug.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:|\/)[^)\s]+)\)/g,
      (_m, txt, url) => `<a href="${url}"${url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Markdown mínimo -> HTML. Máquina de estados por linha, porque o texto é
// simples e um parser de verdade seria dependência nova para três páginas.
// Linhas seguidas viram UM parágrafo separado por <br>: é o que mantém o bloco
// de contato (e-mail numa linha, WhatsApp na outra) com a quebra certa.
function paraHtml(md) {
  const out = [];
  let itens = [];
  let paragrafo = [];

  const fechaLista = () => { if (itens.length) { out.push(`<ul>${itens.join('')}</ul>`); itens = []; } };
  const fechaParagrafo = () => { if (paragrafo.length) { out.push(`<p>${paragrafo.join('<br>')}</p>`); paragrafo = []; } };
  const fechaTudo = () => { fechaLista(); fechaParagrafo(); };

  for (const bruta of md.split('\n')) {
    const linha = bruta.trim();
    if (!linha) { fechaTudo(); continue; }

    if (linha.startsWith('### ')) { fechaTudo(); out.push(`<h3>${inline(linha.slice(4))}</h3>`); continue; }
    if (linha.startsWith('## ')) { fechaTudo(); out.push(`<h2>${inline(linha.slice(3))}</h2>`); continue; }
    if (linha.startsWith('* ')) { fechaParagrafo(); itens.push(`<li>${inline(linha.slice(2))}</li>`); continue; }

    fechaLista();
    paragrafo.push(inline(linha));
  }
  fechaTudo();
  return out.join('');
}

// Preenche os placeholders com os dados vivos da loja. E-mail e WhatsApp saem
// do /admin a cada request — por isso a troca acontece aqui, na montagem da
// página, e não uma vez no carregamento do módulo.
function preencher(txt) {
  const ct = getContato();
  // Sem LOJA_CNPJ a linha "CNPJ/CPF responsável" sai inteira do documento, em
  // vez de ir ao ar com o rótulo seguido de nada.
  const base = CNPJ
    ? txt.replaceAll('{{CNPJ}}', CNPJ)
    : txt.split('\n').filter((l) => !l.includes('{{CNPJ}}')).join('\n');
  return base
    .replaceAll('{{LOJA}}', LOJA_NOME)
    .replaceAll('{{EMAIL}}', ct.email)
    // Loja sem WhatsApp cadastrado cai no e-mail, pra linha não sair vazia.
    .replaceAll('{{ZAP}}', ct.whatsapp ? formatarWhatsapp(ct.whatsapp) : ct.email);
}

// Devolve o documento pronto para virar página, ou null se o slug não existe /
// as páginas estão desligadas (LOJA_LEGAL=0). Quem chama trata o null com 404.
export function renderLegal(slug) {
  if (!LEGAL_LIGADO) return null;
  const doc = docPorSlug(slug);
  if (!doc) return null;
  return {
    titulo: doc.titulo,
    resumo: doc.resumo,
    atualizado: ATUALIZADO,
    html: paraHtml(preencher(doc.corpo)),
  };
}

export default { DOCS, docPorSlug, linksLegais, renderLegal, LEGAL_LIGADO };
