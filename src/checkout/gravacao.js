// Gravacao personalizada na lamina (Knife Lab).
//
// O texto nasce no navegador e atravessa uma URL ate aqui, entao TUDO e
// resaneado deste lado. O front ja filtra os caracteres, mas o front e so a
// primeira porta: quem chama /api/orders direto passa por cima dele.
//
// A loja que nao usa gravacao nunca manda o campo, e todas as funcoes daqui
// devolvem lista vazia — e por isso que este modulo pode existir no
// repositorio compartilhado sem mudar nada na outra loja.

const MAX_TEXTO = 40;
const MAX_ESTILO = 30;
const MAX_LINHAS = 20;

// Mesma faixa aceita pelo tema. Fora dela nao e capricho: a maquina de
// gravacao nao reproduz, e a peca volta.
const PERMITIDO = /[^-A-Za-z\u00C0-\u024F0-9 .,'&!?#+]/g;

export function limpaTexto(v, max = MAX_TEXTO) {
  return String(v == null ? '' : v).replace(PERMITIDO, '').trim().slice(0, max);
}

// Distribui as gravacoes recebidas sobre os itens ja resolvidos no catalogo.
// Duas travas que importam:
//   - variante que nao esta no carrinho e descartada (senao daria para mandar
//     gravar algo que nao foi comprado);
//   - o total gravado de uma variante nunca passa da quantidade comprada.
export function aplicaGravacoes(items, brutas) {
  if (!Array.isArray(brutas) || !brutas.length) return 0;

  const restante = new Map();
  for (const it of items) {
    restante.set(String(it.variantId), (restante.get(String(it.variantId)) || 0) + it.qty);
  }

  const porVariante = new Map();
  let total = 0;

  for (const g of brutas.slice(0, MAX_LINHAS)) {
    const vid = String(g?.variantId ?? '');
    const texto = limpaTexto(g?.texto);
    if (!vid || !texto || !restante.has(vid)) continue;

    const sobra = restante.get(vid);
    if (sobra <= 0) continue;

    const qty = Math.min(sobra, Math.max(1, Math.min(20, parseInt(g?.qty, 10) || 1)));
    restante.set(vid, sobra - qty);

    if (!porVariante.has(vid)) porVariante.set(vid, []);
    porVariante.get(vid).push({ qty, texto, estilo: limpaTexto(g?.estilo, MAX_ESTILO) });
    total += qty;
  }

  // Uma variante pode ocupar mais de uma linha do carrinho; a gravacao entra
  // na primeira, que e onde o painel e o e-mail vao procurar.
  const usadas = new Set();
  for (const it of items) {
    const vid = String(it.variantId);
    if (usadas.has(vid) || !porVariante.has(vid)) continue;
    it.gravacoes = porVariante.get(vid);
    usadas.add(vid);
  }
  return total;
}

// Texto de uma linha, do jeito que a pessoa que grava precisa ler.
export function resumo(g) {
  const partes = ['"' + g.texto + '"'];
  if (g.estilo) partes.push('letra ' + g.estilo);
  if (g.qty > 1) partes.push(g.qty + ' unidades');
  return partes.join(' — ');
}

export function todas(items) {
  const fora = [];
  for (const it of items || []) {
    for (const g of it.gravacoes || []) fora.push({ item: it, g });
  }
  return fora;
}

export default { limpaTexto, aplicaGravacoes, resumo, todas };
