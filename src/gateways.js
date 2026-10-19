import config from './config.js';
import { getSetting, setSetting } from './db.js';
import { createPayment as paysharkCreate } from './payshark/client.js';
import { createPayment as pixgateCreate } from './pixgate/client.js';
import { createPayment as solutionCreate } from './solution/client.js';
import { createPayment as umbrellaCreate } from './umbrella/client.js';
import { createPayment as coreonCreate } from './coreon/client.js';

// Registro dos gateways disponíveis. Interface unificada: createPayment(args)
// -> { transactionId, pixCode, valueCents, status }. Cada um tem seu webhook
// próprio em /webhooks/<id> (formatos diferentes).
export const GATEWAYS = {
  coreon: {
    id: 'coreon',
    name: 'Coreon Pay',
    create: coreonCreate,
    // Duas chaves obrigatórias: sem o secret toda chamada volta 401.
    hasKey: () => !!(config.coreon.apiKey && config.coreon.apiSecret),
    // A Coreon não aceita URL de postback por cobrança — o endereço tem que
    // ser cadastrado no painel dela. O /admin mostra a URL cheia por isso.
    webhookNoPainel: true,
  },
  umbrella: {
    id: 'umbrella',
    name: 'UmbrellaPag',
    create: umbrellaCreate,
    hasKey: () => !!config.umbrella.apiKey,
  },
  solution: {
    id: 'solution',
    name: 'Solution Payments',
    create: solutionCreate,
    hasKey: () => !!config.solution.apiKey,
  },
  payshark: {
    id: 'payshark',
    name: 'PayShark',
    create: paysharkCreate,
    hasKey: () => !!config.payshark.apiKey,
  },
  pixgate: {
    id: 'pixgate',
    name: 'PixGate',
    create: pixgateCreate,
    hasKey: () => !!config.pixgate.apiKey,
  },
};

const SETTING_KEY = 'active_gateway';
// Último recurso: usado se o banco (ou o DEFAULT_GATEWAY) apontar pra um id inexistente.
const FALLBACK = 'umbrella';

// Id do gateway ativo. Ordem: escolha salva no /admin > DEFAULT_GATEWAY > FALLBACK.
//
// A escolha do /admin é sempre respeitada (o painel já avisa quando está sem
// chave). Já o DEFAULT_GATEWAY sem chave configurada seria só erro de env var
// derrubando o checkout inteiro — nesse caso pulamos pro primeiro gateway que
// tenha chave, em vez de deixar todo pedido falhar.
export function activeGatewayId() {
  const chosen = getSetting(SETTING_KEY, null);
  if (chosen && GATEWAYS[chosen]) return chosen;

  const def = GATEWAYS[config.gatewayDefault] ? config.gatewayDefault : FALLBACK;
  if (GATEWAYS[def].hasKey()) return def;

  const withKey = Object.values(GATEWAYS).find((g) => g.hasKey());
  if (withKey) {
    console.warn(`[gateways] ${def} está sem chave — usando ${withKey.id} no lugar`);
    return withKey.id;
  }
  return def; // ninguém tem chave: mantém o default e deixa o erro estourar claro
}

export function activeGateway() {
  return GATEWAYS[activeGatewayId()];
}

export function setActiveGateway(id) {
  if (!GATEWAYS[id]) throw new Error(`Gateway inválido: ${id}`);
  setSetting(SETTING_KEY, id);
}

// Cria a cobrança PIX pelo gateway ativo.
export async function createPayment(args) {
  return activeGateway().create(args);
}

export default { GATEWAYS, activeGatewayId, activeGateway, setActiveGateway, createPayment };
