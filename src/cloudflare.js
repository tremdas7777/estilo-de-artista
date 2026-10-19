// Quem é proxy de confiança na frente desta aplicação.
//
// A loja está atrás de DOIS proxies, não um: o visitante fala com a Cloudflare,
// a Cloudflare fala com o Render, e o Render fala com este processo. Cada um
// acrescenta um endereço ao cabeçalho x-forwarded-for, e é a partir dele que o
// Express decide o valor de req.ip.
//
// Isto já custou um erro: configurado para confiar em UM salto, o req.ip virava
// o endereço da BORDA DA CLOUDFLARE. O diário de acesso do painel passou a
// registrar "Seattle, Estados Unidos · Cloudflare" para um login feito de um
// iPhone no Brasil — inútil para a única pergunta que o registro precisa
// responder, que é "esse acesso foi meu?". E o freio de força bruta passou a
// contar por borda da Cloudflare, juntando visitantes que não têm relação.
//
// A conta certa não é de QUANTOS saltos, é de QUAIS. Contar saltos quebra
// sempre que a topologia muda (e muda: ligar ou desligar a Cloudflare num
// domínio é um clique). Conferir QUEM é cada salto vale nos dois casos.
//
// Regra, aplicada de dentro para fora:
//   salto 0  -> sempre confiável. É o proxy do próprio Render, que entrega a
//               conexão a este processo; o endereço dele varia e não temos como
//               listar. Ele não é problema: ninguém de fora consegue se pôr
//               nessa posição sem já estar dentro da infraestrutura.
//   salto 1+ -> confiável SÓ se for um endereço da Cloudflare.
//
// O que isso garante nos dois caminhos possíveis:
//   pela Cloudflare  -> [render, borda-cf, CLIENTE]  : para no cliente. Certo.
//   direto no Render -> [render, CLIENTE, forjado]   : para no cliente também,
//                       porque o que o cliente escreveu no cabeçalho não está
//                       em faixa da Cloudflare. O endereço forjado é ignorado.
//
// As faixas são as publicadas em cloudflare.com/ips-v4 e /ips-v6. Mudam com
// pouquíssima frequência; se a Cloudflare acrescentar uma nova, o sintoma é o
// req.ip voltar a ser o da borda — e a conferência é a mesma tela do painel que
// mostra "seu IP neste acesso".

const FAIXAS_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];

const FAIXAS_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

// IPv4 em número de 32 bits. Devolve null se não for um IPv4 válido — e é
// importante que devolva null em vez de 0: "0" é um endereço legítimo, e
// confundir os dois faria endereço inválido casar com a faixa 0.0.0.0/x.
function v4ParaNumero(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const parte of p) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const b = Number(parte);
    if (b > 255) return null;
    n = n * 256 + b;
  }
  return n;
}

// IPv6 em BigInt de 128 bits, cobrindo a forma abreviada com "::".
function v6ParaNumero(ip) {
  let s = String(ip).toLowerCase();
  // ::ffff:1.2.3.4 é um IPv4 vestido de IPv6 — tratado como IPv4 lá fora.
  if (s.includes('.')) return null;
  const partes = s.split('::');
  if (partes.length > 2) return null;
  const esq = partes[0] ? partes[0].split(':') : [];
  const dir = partes.length === 2 && partes[1] ? partes[1].split(':') : [];
  const faltam = 8 - esq.length - dir.length;
  if (faltam < 0 || (partes.length === 1 && esq.length !== 8)) return null;
  const grupos = partes.length === 2
    ? [...esq, ...Array(faltam).fill('0'), ...dir]
    : esq;
  let n = 0n;
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

// Pré-calcula base e máscara de cada faixa, uma vez no carregamento — isto roda
// a cada requisição, não é lugar de refazer contas de string.
const V4 = FAIXAS_V4.map((c) => {
  const [rede, bits] = c.split('/');
  const base = v4ParaNumero(rede);
  const mascara = Number(bits) === 0 ? 0 : (-1 << (32 - Number(bits))) >>> 0;
  return { base: (base & mascara) >>> 0, mascara };
});

const V6 = FAIXAS_V6.map((c) => {
  const [rede, bits] = c.split('/');
  const desloc = 128n - BigInt(bits);
  return { base: v6ParaNumero(rede) >> desloc, desloc };
});

export function ehCloudflare(ip) {
  if (!ip) return false;
  // O Node entrega IPv4 embrulhado em IPv6 (::ffff:1.2.3.4) quando o socket é
  // dual-stack. Desembrulha antes de decidir qual das duas contas usar.
  const limpo = String(ip).trim().toLowerCase().replace(/^::ffff:/, '');

  const n4 = v4ParaNumero(limpo);
  if (n4 !== null) return V4.some((f) => ((n4 & f.mascara) >>> 0) === f.base);

  const n6 = v6ParaNumero(limpo);
  if (n6 !== null) return V6.some((f) => (n6 >> f.desloc) === f.base);

  return false;
}

// É isto que vai no app.set('trust proxy', ...). O Express chama uma vez por
// endereço da cadeia, de dentro para fora, e para no primeiro que não for
// confiável — esse vira o req.ip.
export const proxyConfiavel = (ip, salto) => salto === 0 || ehCloudflare(ip);

export default { ehCloudflare, proxyConfiavel };
