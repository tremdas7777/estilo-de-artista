// Sequência de GIRO de um produto: os quadros que a página de produto usa para
// deixar o cliente arrastar e "girar" o tênis.
//
// Por que é uma pasta no disco e não uma coluna no banco: os quadros são arte,
// como a logo e os banners. Quem produz um giro novo joga os arquivos em
// assets/giro/<handle>/ e a página passa a oferecer a interação sozinha — sem
// migração, sem import, sem deploy de código.
//
// O catálogo desta loja NÃO tem ângulos limpos suficientes para montar isso a
// partir das fotos: dos 4 retratos do Tesla Coil Pro, 1 tem mão segurando, 1
// tem pé calçado, 1 tem mão e relógio, e só 1 mostra o par sozinho. O giro que
// existe hoje foi interpolado a partir DESSA foto boa (ver o LEIA-ME).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PASTA = join(RAIZ, 'assets', 'giro');

// Lido uma vez por processo. São arquivos versionados: não mudam sem deploy, e
// olhar o disco a cada visita de produto seria I/O por nada.
let cache = null;

function varrer() {
  const mapa = new Map();
  let pastas = [];
  try { pastas = fs.readdirSync(PASTA, { withFileTypes: true }); } catch { return mapa; }
  for (const d of pastas) {
    if (!d.isDirectory()) continue;
    let arquivos = [];
    try { arquivos = fs.readdirSync(join(PASTA, d.name)); } catch { continue; }
    const quadros = arquivos.filter((a) => /^g\d+\.(webp|avif|jpg|png)$/i.test(a)).sort();
    // Menos de 8 quadros não vira giro: vira pulo. Nesse caso a página fica só
    // com a galeria normal, que é o comportamento de sempre.
    if (quadros.length >= 8) {
      mapa.set(d.name, { quadros, ext: quadros[0].split('.').pop() });
    }
  }
  return mapa;
}

// Shape que o front recebe. `base` já vem pronta para montar o endereço do
// quadro: base + numero + '.' + ext.
export function giroDoProduto(handle) {
  if (!cache) cache = varrer();
  const g = cache.get(String(handle || ''));
  if (!g) return null;
  return {
    quadros: g.quadros.length,
    base: `/assets/giro/${handle}/g`,
    ext: g.ext,
    // O primeiro quadro é o que a página mostra parada; ele entra com
    // prioridade e os outros só depois (ver a PDP).
    primeiro: `/assets/giro/${handle}/${g.quadros[0]}`,
  };
}

export default { giroDoProduto };
