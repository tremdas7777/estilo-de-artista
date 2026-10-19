// Uso: node assets/_fonte/gerar-logo.mjs
//
// Tira da arte original (assets/_originais/logo-estilo-de-artista-original.jpeg,
// 1254x1254, JPEG SEM alfa, logo rosa e amarela sobre preto) tudo o que a loja
// usa:
//   assets/logo-estilo-de-artista.png              fundo transparente — LOJA_LOGO
//   assets/logo-estilo-de-artista-fundo-claro.png  transparente com contorno preto
//                                                  justo nas letras — LOJA_LOGO_CLARO
//   assets/app/icone-{180,192,512}.png, notificacao-logo-192.png
//   assets/app/icone-maskable-512.png              com a margem que o Android recorta
//   assets/app/badge.png                           só a coroa, branca e transparente
//
// Rode ANTES do gerar-arte.mjs: o banner do topo usa a logo transparente.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(AQUI, '..');
const ORIGINAL = path.join(ASSETS, '_originais', 'logo-estilo-de-artista-original.jpeg');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const tmp = fs.mkdtempSync(path.join(AQUI, 'tmp-'));
try {
  // JPEG -> pixels crus pelo ffmpeg: não há decodificador de JPEG no node_modules.
  const cru = path.join(tmp, 'orig.png');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', ORIGINAL, '-pix_fmt', 'rgba', cru]);
  const orig = PNG.sync.read(fs.readFileSync(cru));
  const { width: W, height: H } = orig;

  // ------------------------------------------------------------ recorte
  // A arte é tinta CLARA sobre preto, e o preto do arquivo é limpo (no máximo 1
  // de 255 nos cantos). A cobertura de tinta sai do canal mais forte: tinta
  // cheia (rosa 241, amarelo 230) vira opaca e o degradê da borda vira alfa
  // parcial. A cor volta dividindo pelo alfa — sobre preto, P = α·F. Sem essa
  // divisão a borda ficaria escurecida e apareceria como contorno sujo sobre
  // qualquer fundo que não seja preto. É o espelho do α = 1 − min/255 que a
  // Nação 13 usou para tinta escura sobre branco.
  const CHEIO = 200;
  const sem = new PNG({ width: W, height: H });
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const m = Math.max(orig.data[o], orig.data[o + 1], orig.data[o + 2]);
    const a = m <= 2 ? 0 : Math.min(1, m / CHEIO);
    if (a > 0) {
      for (let c = 0; c < 3; c++) sem.data[o + c] = Math.min(255, Math.round(orig.data[o + c] / a));
      sem.data[o + 3] = Math.round(a * 255);
    }
    if (a > 0.04) {
      const x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  console.log(`tinta: ${bw}x${bh} em (${x0},${y0})`);

  const corta = (img, cx, cy, w, h) => {
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = cx + x, sy = cy + y;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      img.data.copy(out.data, (y * w + x) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
    }
    return out;
  };

  // Redução por MÉDIA DE ÁREA com alfa PRÉ-MULTIPLICADO. Sem pré-multiplicar, os
  // pixels transparentes da borda entram na média com a cor que carregam e a
  // logo ganha auréola justamente no tamanho pequeno (lição da A Fonte).
  const reduz = (img, w2, h2) => {
    const { width: w, data: d } = img;
    const out = new PNG({ width: w2, height: h2 });
    const sx = img.width / w2, sy = img.height / h2;
    for (let y = 0; y < h2; y++) {
      const ya = y * sy, yb = ya + sy;
      for (let x = 0; x < w2; x++) {
        const xa = x * sx, xb = xa + sx;
        let r = 0, g = 0, b = 0, a = 0, area = 0;
        for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
          const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
          for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
            const k = (Math.min(xb, xx + 1) - Math.max(xa, xx)) * wy;
            const i = (yy * w + xx) * 4;
            const al = d[i + 3] / 255;
            r += d[i] * al * k; g += d[i + 1] * al * k; b += d[i + 2] * al * k; a += al * k; area += k;
          }
        }
        const o = (y * w2 + x) * 4;
        if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
        out.data[o + 3] = Math.round((255 * a) / area);
      }
    }
    return out;
  };
  const grava = (img, rel) => {
    fs.writeFileSync(path.join(ASSETS, rel), PNG.sync.write(img));
    console.log(`ok ${rel} ${img.width}x${img.height}`);
  };
  // 400px de altura: o maior uso é o rodapé a 96px, e 400 cobre tela 3x.
  const ALTURA = 400;
  const naAltura = (img) => reduz(img, Math.round((img.width * ALTURA) / img.height), ALTURA);

  // 1) Fundo transparente — cabeçalho, rodapé, /admin e e-mail (todos escuros).
  const P = 14;
  grava(naAltura(corta(sem, x0 - P, y0 - P, bw + 2 * P, bh + 2 * P)), 'logo-estilo-de-artista.png');

  // 2) Fundo claro — o topo do checkout é quase branco, e ali o amarelo-neon
  //    some (1,2:1 contra o branco). Até 14/09/2026 a arte ia no quadro PRETO
  //    em que foi desenhada, com cantos redondos; o dono pediu sem o quadro.
  //    Agora é a logo transparente com um CONTORNO preto justo nas letras, como
  //    adesivo: o amarelo continua encostado no preto, o fundo claro aparece em
  //    volta, e as cores seguem exatamente as do autor. Os miolos pequenos (o
  //    do O, os vãos entre letras) fecham em preto, como eram na arte.
  //
  //    O contorno é uma dilatação do alfa por um disco de borda suave, feita já
  //    na altura final (400px): RC = 10 dá ~2px na tela, onde o checkout mostra
  //    a logo com 64–76px. PC é a folga no original para ele não ser cortado.
  //
  //    A dilatação lê um alfa LIMPO (tinta abaixo de ~20% conta como nada): o
  //    JPEG deixa um chuvisco de tinta fraca em volta das letras, e o disco
  //    espalhava esse chuvisco num halo cinza por fora do contorno.
  const PC = 40, RC = 10, PRETO = 10; // #0a0a0a, o preto neutro da loja
  const base = naAltura(corta(sem, x0 - PC, y0 - PC, bw + 2 * PC, bh + 2 * PC));
  const { width: cw, height: ch } = base;
  const limpo = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) limpo[i] = Math.min(1, Math.max(0, (base.data[i * 4 + 3] / 255 - 0.2) / 0.5));
  const disco = [];
  for (let dy = -RC - 1; dy <= RC + 1; dy++) for (let dx = -RC - 1; dx <= RC + 1; dx++) {
    const k = Math.min(1, Math.max(0, RC + 0.5 - Math.hypot(dx, dy)));
    if (k > 0) disco.push([dx, dy, k]);
  }
  const contorno = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let ab = 0;
    for (const [dx, dy, k] of disco) {
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) continue;
      const v = limpo[sy * cw + sx] * k;
      if (v > ab) { ab = v; if (ab >= 1) break; }
    }
    // Arte POR CIMA do preto (operador "over"), com as cores não multiplicadas.
    // Fora do contorno não sobra nada: é o mesmo chuvisco, em pontinhos soltos.
    const o = (y * cw + x) * 4;
    const aa = ab > 0 ? base.data[o + 3] / 255 : 0;
    const ao = aa + ab * (1 - aa);
    if (ao > 0) {
      for (let c = 0; c < 3; c++) {
        contorno.data[o + c] = Math.round((base.data[o + c] * aa + PRETO * ab * (1 - aa)) / ao);
      }
    }
    contorno.data[o + 3] = Math.round(ao * 255);
  }
  grava(contorno, 'logo-estilo-de-artista-fundo-claro.png');

  // 3) Ícones: a arte inteira sobre o preto dela, quadrada, centrada na tinta.
  //    Normal com a logo em ~82% do lado. Maskable com a diagonal da logo dentro
  //    do círculo de 80% que o Android garante — senão o recorte redondo decepa
  //    os cantos do "ESTILO" e da coroa.
  const cx = x0 + bw / 2, cy = y0 + bh / 2;
  const quadrado = (lado) => {
    const s = Math.min(W, H, Math.round(lado));
    const sx = Math.round(Math.min(W - s, Math.max(0, cx - s / 2)));
    const sy = Math.round(Math.min(H - s, Math.max(0, cy - s / 2)));
    return corta(orig, sx, sy, s, s);
  };
  const icone = quadrado(Math.max(bw, bh) * 1.22);
  const maskable = quadrado((2 * Math.hypot(bw / 2, bh / 2)) / 0.8);
  for (const [rel, img, s] of [
    ['app/icone-180.png', icone, 180], ['app/icone-192.png', icone, 192], ['app/icone-512.png', icone, 512],
    ['app/notificacao-logo-192.png', icone, 192], ['app/icone-maskable-512.png', maskable, 512],
  ]) grava(reduz(img, s, s), rel);

  // 4) Badge: o Android pinta de uma cor só e usa APENAS o alfa, e o ícone sai
  //    com uns 24px na barra de status. A logo inteira viraria um borrão; a
  //    COROA é o traço que se reconhece nesse tamanho. Coroa = tinta amarela
  //    acima do "DE ARTISTA" (o rosa é o "ESTILO", que fica de fora).
  //
  //    Duas passadas. A caixa da coroa sai só de amarelo FORTE (tinta quase
  //    cheia): o JPEG deixa ruído de cor em volta do rosa que também "parece
  //    amarelo" e, na primeira versão, esticou a caixa até o fim do ESTILO — a
  //    coroa saiu com 183 pixels num canto. Depois, dentro da caixa (com folga
  //    para a borda suave), entra todo pixel amarelado com o alfa que tem.
  const LIMITE_Y = y0 + bh * 0.4;
  const cor = (o) => [sem.data[o], sem.data[o + 1], sem.data[o + 2], sem.data[o + 3]];
  let c0 = W, c1 = 0, r0 = H, r1 = 0;
  for (let i = 0; i < W * H; i++) {
    const y = (i / W) | 0, x = i % W;
    if (y > LIMITE_Y) break;
    const [r, g, b, a] = cor(i * 4);
    if (a > 150 && r > 150 && g > 170 && b < 90) { c0 = Math.min(c0, x); c1 = Math.max(c1, x); r0 = Math.min(r0, y); r1 = Math.max(r1, y); }
  }
  const F = 6;
  const coroa = new PNG({ width: W, height: H });
  for (let y = r0 - F; y <= r1 + F; y++) for (let x = c0 - F; x <= c1 + F; x++) {
    const o = (y * W + x) * 4;
    const [r, g, b, a] = cor(o);
    if (a < 8 || !(g > 120 && r > 90 && b < 140)) continue;
    coroa.data[o] = coroa.data[o + 1] = coroa.data[o + 2] = 255;
    coroa.data[o + 3] = a;
  }
  console.log(`coroa: ${c1 - c0 + 1}x${r1 - r0 + 1} em (${c0},${r0})`);
  const lado = Math.round(Math.max(c1 - c0, r1 - r0) * 1.18);
  const badge = corta(coroa, Math.round((c0 + c1) / 2 - lado / 2), Math.round((r0 + r1) / 2 - lado / 2), lado, lado);
  grava(reduz(badge, 96, 96), 'app/badge.png');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
