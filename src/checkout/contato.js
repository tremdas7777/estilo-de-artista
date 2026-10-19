import { getSetting, setSetting } from '../db.js';

// Contato da loja (WhatsApp + e-mail de atendimento). Mora no banco pra poder
// trocar pelo /admin sem redeploy — o padrão abaixo é só o que vale enquanto
// ninguém salvou nada. Como o mesmo código atende mais de uma loja (um serviço
// por loja no Render), o padrão também aceita variável de ambiente.
const KEY = 'contato_loja';

export function defaults() {
  return {
    email: process.env.LOJA_EMAIL || 'suporte@exemplo.com.br',
    // DDI + DDD + número, só dígitos. Vazio = loja sem WhatsApp: o botão
    // flutuante e as menções ao número somem sozinhos (melhor não ter WhatsApp
    // do que mandar o cliente pra um número errado).
    whatsapp: (process.env.LOJA_WHATSAPP || '5547997229918').replace(/\D/g, ''),
    // Texto que já vai escrito na conversa quando o cliente abre o WhatsApp
    // pelo botão da loja. Vazio = abre a conversa em branco.
    mensagem: process.env.LOJA_ZAP_MSG
      || 'Olá! Vim pelo site da loja e gostaria de mais informações.',
  };
}

// Link do botão: wa.me + a mensagem já digitada na conversa do cliente.
// Sem número não existe link (quem chama trata o vazio escondendo o botão).
export function linkWhatsapp(numero, mensagem) {
  const d = String(numero || '').replace(/\D/g, '');
  if (!d) return '';
  const txt = String(mensagem || '').trim();
  return `https://wa.me/${d}${txt ? `?text=${encodeURIComponent(txt)}` : ''}`;
}

// Aceita o número do jeito que a gente escreve — "(47) 99722-9918",
// "47 99722-9918", "+55 47 99722-9918" — e devolve sempre DDI+DDD+número em
// dígitos, que é o formato que o wa.me exige. Sem DDI, assume Brasil.
export function normalizarWhatsapp(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.slice(0, 15); // E.164 vai até 15 dígitos
}

// Número plausível pra WhatsApp brasileiro: 55 + DDD (11–99) + 8 ou 9 dígitos.
// Fora do Brasil só checamos o comprimento, pra não barrar um DDI diferente.
export function whatsappValido(d) {
  const n = String(d || '');
  if (!n) return true; // vazio é uma escolha válida: desliga o WhatsApp
  if (n.startsWith('55')) return /^55[1-9][1-9]\d{8,9}$/.test(n);
  return n.length >= 10 && n.length <= 15;
}

// 5547997229918 -> +55 47 99722-9918 (o jeito que o cliente lê na loja).
// Número que não casa com o padrão sai como veio, só em dígitos.
export function formatarWhatsapp(n) {
  const d = String(n || '').replace(/\D/g, '');
  const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : d;
}

export function getContato() {
  const d = defaults();
  const raw = getSetting(KEY, null);
  if (!raw) return d;
  try {
    const c = JSON.parse(raw);
    return {
      email: typeof c.email === 'string' && c.email.trim() ? c.email.trim() : d.email,
      // string vazia é intencional (loja sem WhatsApp), por isso o typeof em vez
      // do "||" — senão o padrão voltaria a aparecer depois de apagar o número.
      whatsapp: typeof c.whatsapp === 'string' ? c.whatsapp.replace(/\D/g, '') : d.whatsapp,
      // idem: apagar a mensagem no /admin é uma escolha (conversa em branco),
      // então string vazia salva tem que sobreviver ao reload.
      mensagem: typeof c.mensagem === 'string' ? c.mensagem : d.mensagem,
    };
  } catch {
    return d;
  }
}

export function saveContato(obj) {
  setSetting(KEY, JSON.stringify({
    email: String(obj?.email ?? '').trim().slice(0, 120),
    whatsapp: normalizarWhatsapp(obj?.whatsapp),
    // 400 caracteres é folga de sobra: a mensagem vai na URL do wa.me e
    // navegador antigo trunca link muito longo.
    mensagem: String(obj?.mensagem ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }));
}

export default {
  defaults, getContato, saveContato, normalizarWhatsapp, whatsappValido, formatarWhatsapp, linkWhatsapp,
};
