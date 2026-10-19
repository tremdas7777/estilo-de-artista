// Helpers de cor compartilhados. Viviam no topo do views/pages.js, mas a
// personalização passou a derivar tons também (linha suave/forte a partir da
// cor de linha escolhida no /admin) e duas cópias das mesmas contas divergiriam
// na primeira correção.

export const hexRgb = (h) => {
  const s = String(h).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

export const rgbHex = (r, g, b) => '#' + [r, g, b]
  .map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'))
  .join('');

export const darken = (hex, f) => {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(r * (1 - f), g * (1 - f), b * (1 - f));
};

export const softTint = (hex, f) => {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
};

export const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

// Luminância relativa (WCAG 2.1).
function luminancia(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Preto ou branco por cima de uma cor. Usado no botão principal: quem escolher
// um amarelo claro no /admin precisa de texto preto, senão o rótulo some.
//
// A regra NÃO é "o que tiver mais contraste". Esse critério (limiar 0.179)
// devolvia preto no verde padrão #0f9d58 — tecnicamente mais contrastado, mas
// invertia o botão que o checkout sempre teve e um "comprar" verde com letra
// preta simplesmente parece errado. Então: branco por padrão, e só cai no preto
// quando o branco falha de verdade (abaixo de 3:1, o mínimo da WCAG para texto
// grande — que é o caso do rótulo do botão, 16px em negrito).
export function tintaLegivel(fundo) {
  const l = luminancia(fundo);
  const contrasteDoBranco = 1.05 / (l + 0.05);
  return contrasteDoBranco >= 3 ? '#ffffff' : '#111111';
}

export default { hexRgb, rgbHex, darken, softTint, isHex, tintaLegivel };
