import { waitUntil } from '@vercel/functions';

// Trabalho que continua DEPOIS de a resposta sair.
//
// O checkout faz isso em vários pontos, e de propósito: o webhook responde 200
// na hora e só então marca o pedido como pago; a venda confirmada dispara
// Pixel, UTMify, push e e-mail sem segurar o gateway esperando.
//
// Num servidor comum isso funciona sozinho, porque o processo continua vivo.
// Na Vercel não: assim que a resposta sai, a instância pode ser CONGELADA, e o
// que estava rodando para no meio — o gateway recebe o 200, e o pedido nunca
// fica pago. `waitUntil` é o aviso para a plataforma manter a instância de pé
// até a promessa terminar.
//
// Fora da Vercel (local, Render) o waitUntil não acha contexto nenhum e não faz
// nada, que é o comportamento certo: lá o processo já continua vivo.
//
// Regra para quem mexer no código: TODA promessa disparada sem `await` que
// precise terminar passa por aqui. Esquecer não dá erro — só perde o trabalho,
// às vezes, em produção, sem log.
export function emSegundoPlano(promessa, rotulo = '') {
  const segura = Promise.resolve(promessa).catch((e) => {
    console.error(`[segundo plano]${rotulo ? ` ${rotulo}:` : ''}`, e?.message || e);
  });
  try {
    waitUntil(segura);
  } catch { /* sem contexto de requisição: o processo continua vivo sozinho */ }
  return segura;
}

export default { emSegundoPlano };
