// Uso: node assets/_fonte/gerar-arte.mjs
//
// Renderiza a TABELA DE MEDIDAS (assets/tabela-medidas-fonte.html -> 900x900
// assets/tabela-medidas.png) com o Chrome da máquina em modo headless — não há
// ImageMagick aqui.
//
// Até 13/09/2026 este script também desenhava o banner do topo, a partir de um
// banner.html provisório. O dono mandou a ARTE DE VERDADE no mesmo dia, e a
// parte do banner saiu daqui de propósito: rodar este script por hábito não
// pode sobrescrever o banner dele. A arte original está em
// assets/_originais/banner-principal-{desktop,mobile}.png; o que vai no ar é o
// WebP convertido (ver "Banner do topo" no LEIA-ME).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(AQUI, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// O Chrome headless não abre janela menor que ~500px; 900 está acima disso,
// então o tamanho pedido é o tamanho que o layout enxerga.
const html = pathToFileURL(path.join(ASSETS, 'tabela-medidas-fonte.html')).href;
const saida = path.join(ASSETS, 'tabela-medidas.png');
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=900,900', '--virtual-time-budget=4000', `--screenshot=${saida}`, html], { stdio: 'ignore' });
if (!fs.existsSync(saida)) throw new Error('o Chrome não gerou ' + saida);
// Fica em PNG: é texto miúdo e linha fina, onde o WebP com perda borra os números.
console.log('ok tabela-medidas.png', fs.statSync(saida).size, 'bytes');
