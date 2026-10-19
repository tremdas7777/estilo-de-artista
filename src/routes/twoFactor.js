import crypto from 'node:crypto';
import { getSetting, setSetting } from '../db.js';

// Verificação em duas etapas (2FA) do /admin, no padrão TOTP — o mesmo do
// Google Authenticator, Authy, 1Password e afins.
//
// Feito com node:crypto puro, SEM dependência nova, de propósito: TOTP é um
// HMAC-SHA1 sobre o contador de tempo (RFC 6238), curto o bastante pra caber
// aqui e auditar de bater o olho. Trazer um pacote pra isso seria mais código
// pra confiar, não menos.
//
// O segredo mora no BANCO (settings), como as chaves de push. Nasce quando o
// dono clica em "ativar" e só passa a valer depois que ele confirma um código
// — assim ninguém liga o 2FA sem ter o app configurado e se tranca pra fora.

const KEY_SECRET = '2fa_secret';   // segredo Base32 confirmado (2FA ligado)
const KEY_PEND = '2fa_pendente';   // segredo gerado, à espera de confirmação
const KEY_BACKUP = '2fa_backup';   // códigos de emergência (hash), JSON

// Base32 (RFC 4648) — é o alfabeto que os apps autenticadores leem no QR.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let valor = 0; let saida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}

function base32Decode(str) {
  const limpo = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let valor = 0; const bytes = [];
  for (const ch of limpo) {
    valor = (valor << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// O código de 6 dígitos para um segredo, numa janela de tempo. `desloc` recua
// (ou avança) janelas de 30s — é o que dá a tolerância de relógio abaixo.
function codigoTOTP(segredoB32, desloc = 0) {
  const passo = 30;
  const contador = Math.floor(Date.now() / 1000 / passo) + desloc;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', base32Decode(segredoB32)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16)
    | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

// Confere o código aceitando a janela atual e uma pra cada lado (±30s): cobre
// o relógio do celular adiantado ou atrasado sem abrir a porta de par em par.
// Comparação em tempo constante pra não vazar acerto parcial por timing.
function codigoConfere(segredoB32, informado) {
  const alvo = String(informado || '').replace(/\D/g, '');
  if (alvo.length !== 6) return false;
  for (const d of [0, -1, 1]) {
    const esperado = codigoTOTP(segredoB32, d);
    const a = Buffer.from(alvo); const b = Buffer.from(esperado);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Válvula de escape: ADMIN_2FA=0 nas variáveis do Render desliga a segunda
// etapa sem precisar do celular nem dos códigos de emergência.
//
// Existe porque o pior caso do 2FA não é o invasor entrar, é o DONO não entrar:
// celular perdido junto com os códigos guardados nele deixaria o painel
// trancado para sempre — sem venda para conferir, sem pedido para despachar, e
// sem nenhum jeito de destravar pela web. Quem mexe nas variáveis do Render já
// controla o serviço inteiro (pode trocar a própria ADMIN_PASSWORD), então isto
// não abre porta nova para ninguém de fora: só devolve a chave a quem é dono.
//
// Depois de entrar, o certo é desligar e religar o 2FA pela aba Segurança para
// cadastrar o aparelho novo, e então tirar a variável.
export const doisFatoresAtivo = () => process.env.ADMIN_2FA !== '0' && !!getSetting(KEY_SECRET, '');

function montarUri(segredo, nomeConta, emissor) {
  const label = encodeURIComponent(`${emissor}:${nomeConta}`);
  return `otpauth://totp/${label}?secret=${segredo}`
    + `&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}

// Passo 1: cria um segredo pendente e devolve o que a tela precisa mostrar —
// o texto pra digitar no app e a URI otpauth:// que vira QR Code.
export function iniciarDoisFatores(nomeConta = 'admin', emissor = 'Nation 47') {
  const segredo = base32Encode(crypto.randomBytes(20));
  setSetting(KEY_PEND, segredo);
  return { segredo, uri: montarUri(segredo, nomeConta, emissor) };
}

// O segredo pendente que já existe, para a tela poder ser recarregada sem
// trocar o QR embaixo de quem acabou de escanear. Gerar um novo a cada abertura
// da página era o caminho fácil e o errado: quem escaneasse e desse F5 ficaria
// com um app gerando código de um segredo que o servidor já tinha jogado fora.
export function pendenteDoisFatores(nomeConta = 'admin', emissor = 'Nation 47') {
  const segredo = getSetting(KEY_PEND, '');
  return segredo ? { segredo, uri: montarUri(segredo, nomeConta, emissor) } : null;
}

// Passo 2: o dono digita o primeiro código. Só aqui o 2FA passa a valer —
// e é aqui que nascem os códigos de emergência (mostrados UMA vez).
export function confirmarDoisFatores(codigo) {
  const pendente = getSetting(KEY_PEND, '');
  if (!pendente) return { ok: false, erro: 'Nada para confirmar. Comece de novo.' };
  if (!codigoConfere(pendente, codigo)) return { ok: false, erro: 'Código incorreto. Confira o horário do celular e tente de novo.' };
  setSetting(KEY_SECRET, pendente);
  setSetting(KEY_PEND, '');
  const backup = gerarCodigosBackup();
  return { ok: true, backup };
}

// Verificação no login: aceita o código do app OU um código de emergência.
// Código de emergência é de uso único — ao acertar, ele é riscado da lista.
export function verificarDoisFatores(codigo) {
  const segredo = getSetting(KEY_SECRET, '');
  if (!segredo) return true; // 2FA desligado: não há o que verificar
  if (codigoConfere(segredo, codigo)) return true;
  return consumirCodigoBackup(codigo);
}

export function desligarDoisFatores() {
  setSetting(KEY_SECRET, '');
  setSetting(KEY_PEND, '');
  setSetting(KEY_BACKUP, '');
}

// --- códigos de emergência ---
//
// Existem para o dia em que o celular do app se perde ou reseta. São 8 códigos,
// guardados só como HASH (SHA-256) — quem abrir o banco não os lê. Mostrados
// UMA vez, na ativação; use um e ele some.
const hashBackup = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');

function gerarCodigosBackup() {
  const codigos = [];
  for (let i = 0; i < 8; i++) {
    // 10 hex em dois blocos: fácil de ditar, difícil de adivinhar.
    const c = crypto.randomBytes(5).toString('hex');
    codigos.push(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  setSetting(KEY_BACKUP, JSON.stringify(codigos.map(hashBackup)));
  return codigos; // em claro só neste retorno — nunca mais
}

function consumirCodigoBackup(codigo) {
  const limpo = String(codigo || '').trim().toLowerCase();
  if (!/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(limpo)) return false;
  let lista;
  try { lista = JSON.parse(getSetting(KEY_BACKUP, '') || '[]'); } catch { return false; }
  const h = hashBackup(limpo);
  const i = lista.indexOf(h);
  if (i < 0) return false;
  lista.splice(i, 1);
  setSetting(KEY_BACKUP, JSON.stringify(lista));
  return true;
}

export function codigosBackupRestantes() {
  try { return (JSON.parse(getSetting(KEY_BACKUP, '') || '[]')).length; } catch { return 0; }
}

export default {
  doisFatoresAtivo, iniciarDoisFatores, pendenteDoisFatores, confirmarDoisFatores,
  verificarDoisFatores, desligarDoisFatores, codigosBackupRestantes,
};
