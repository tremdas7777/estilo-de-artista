// Cidade e operadora a partir do IP, para o diário de acesso ao painel.
//
// Só roda quando o dono APERTA O BOTÃO na aba Segurança. Nunca automático, e
// essa escolha é deliberada: consultar sozinho significaria mandar para um
// serviço de terceiro todo IP que aparece no diário — inclusive o do próprio
// dono, toda vez que ele abre a tela. Sob demanda, sai daqui só o IP que ele
// decidiu investigar, e uma única vez (o resultado fica no banco).
//
// O que isto responde é "esse acesso partiu de onde?", e serve para uma coisa:
// reconhecer o que é seu. NÃO identifica pessoa — num IP de celular, o mesmo
// endereço é compartilhado por milhares de assinantes ao mesmo tempo, e só a
// operadora sabe quem estava com ele, mediante ordem judicial.
//
// A precisão é de cidade, e olhe lá: costuma acertar a região metropolitana e
// errar o município. Serve para separar "minha cidade" de "outro país", não
// para apontar bairro.

// ipwho.is: HTTPS, sem cadastro, sem chave. Se um dia sair do ar ou passar a
// cobrar, é só esta função que muda — o resto do sistema fala com o formato
// normalizado do `consultar()`.
const URL_BASE = 'https://ipwho.is/';

// Endereço de rede local ou reservado não tem cidade nenhuma para consultar, e
// mandá-lo para fora seria pedir informação sobre um endereço que não existe na
// internet pública. Acontece de verdade: rodando na sua máquina, o IP é ::1.
export function ehLocal(ip) {
  const s = String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');
  if (!s) return true;
  if (s === '::1' || s === 'localhost' || s === 'sem-ip') return true;
  if (/^127\./.test(s)) return true;
  if (/^10\./.test(s)) return true;
  if (/^192\.168\./.test(s)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  if (/^f[cd]/.test(s)) return true; // IPv6 privado (fc00::/7)
  return false;
}

// Devolve `{ ip, cidade, regiao, pais, operadora }` ou null se não deu.
// NUNCA lança: é chamada de dentro de uma tela do painel, e uma consulta que
// falhou não pode impedir o dono de ver o próprio diário de acesso.
export async function consultar(ip) {
  if (ehLocal(ip)) {
    return { ip, cidade: 'rede local', regiao: null, pais: null, operadora: null };
  }
  try {
    // Timeout curto: são até 40 IPs em sequência atrás de um clique, e o dono
    // está olhando a tela. Um serviço lento não pode segurar a página.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${URL_BASE}${encodeURIComponent(ip)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.success === false) return null;
    return {
      ip,
      cidade: j.city || null,
      regiao: j.region || null,
      pais: j.country || null,
      // `isp` é quem vende a conexão (Vivo, Claro); `org` costuma ser o mesmo,
      // mas em IP de datacenter traz o nome do provedor de nuvem — e é
      // justamente esse o caso que interessa notar (ver `ehDatacenter`).
      operadora: (j.connection && (j.connection.isp || j.connection.org)) || null,
    };
  } catch {
    return null; // rede fora, timeout, JSON quebrado: some em silêncio
  }
}

// Sinal que vale mais que a cidade: acesso ao painel saindo de um DATACENTER.
//
// Dono de loja entra pelo celular ou pela casa — pela operadora de telefonia ou
// pelo provedor de internet dele. Ninguém administra a própria loja de dentro
// da Amazon, da DigitalOcean ou de um serviço de VPN. Quando aparece um desses
// num acesso que deu certo, é quase sempre uma das duas coisas: robô que achou
// a senha, ou alguém escondendo de onde está falando.
const NUVEM = /amazon|aws|google cloud|microsoft|azure|digitalocean|linode|vultr|hetzner|ovh|oracle cloud|contabo|scaleway|choopa|leaseweb|m247|datacamp|nordvpn|expressvpn|surfshark|private internet|mullvad|cloudflare|tor exit|colocation|data ?cent/i;

export const ehDatacenter = (operadora) => NUVEM.test(String(operadora || ''));

// Texto curto para a tabela: "São Paulo · Vivo".
export function resumo(g) {
  if (!g) return '';
  const lugar = [g.cidade, g.regiao].filter(Boolean).join(', ');
  const partes = [];
  if (lugar) partes.push(lugar);
  if (g.pais && g.pais !== 'Brazil') partes.push(g.pais);
  if (g.operadora) partes.push(g.operadora);
  return partes.join(' · ');
}

export default { consultar, ehLocal, ehDatacenter, resumo };
