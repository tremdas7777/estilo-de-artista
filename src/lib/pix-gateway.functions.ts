import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPixGatewayState, PIX_GATEWAYS, savePixGateway } from "./pix-gateway.server";
import {
  deletePixgateKey,
  getPixgateKeySource,
  savePixgateKey,
  testPixgateKey,
} from "./pixgate.server";
import {
  deleteUmbrellaKey,
  getUmbrellaKeySource,
  saveUmbrellaKey,
  testUmbrellaKey,
} from "./umbrella.server";
import {
  deleteSagacePayKey,
  getSagacePayKeySource,
  saveSagacePayKey,
  testSagacePayKey,
} from "./sagacepay.server";
import {
  deletePaySharkKey,
  getPaySharkKeySource,
  savePaySharkKey,
  testPaySharkKey,
} from "./payshark.server";

const pw = z.object({ password: z.string().min(1).max(200) });

function assertAdmin(password: string) {
  if (password !== process.env["ADMIN_PASSWORD"]) throw new Error("Não autorizado");
}

function mask(token: string): string {
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

/** Gateway escolhido, gateway em uso e chaves de cada gateway do Pix (mascaradas). */
export const getPixGatewayStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    const [state, pixgate, umbrella, sagacepay, payshark] = await Promise.all([
      getPixGatewayState(),
      getPixgateKeySource(),
      getUmbrellaKeySource(),
      getSagacePayKeySource(),
      getPaySharkKeySource(),
    ]);
    return {
      ...state,
      keys: {
        pixgate: { key: pixgate.key ? mask(pixgate.key) : null, source: pixgate.source },
        umbrella: { key: umbrella.key ? mask(umbrella.key) : null, source: umbrella.source },
        sagacepay: { key: sagacepay.key ? mask(sagacepay.key) : null, source: sagacepay.source },
        payshark: { key: payshark.key ? mask(payshark.key) : null, source: payshark.source },
      },
    };
  });

export const setPixGatewayFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.extend({ gateway: z.enum(PIX_GATEWAYS) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await savePixGateway(data.gateway);
    return { ok: true };
  });

export const savePixgateKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.extend({ key: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await savePixgateKey(data.key);
    return { ok: true };
  });

export const deletePixgateKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await deletePixgateKey();
    return { ok: true };
  });

export const saveUmbrellaKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.extend({ key: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await saveUmbrellaKey(data.key);
    return { ok: true };
  });

export const deleteUmbrellaKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await deleteUmbrellaKey();
    return { ok: true };
  });

/** Valida a chave da Umbrella sem gerar cobrança nenhuma. */
export const testUmbrellaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    return testUmbrellaKey();
  });

/** Valida a chave da PixGate sem gerar cobrança nenhuma. */
export const testPixgateFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    return testPixgateKey();
  });

export const saveSagacePayKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.extend({ key: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await saveSagacePayKey(data.key);
    return { ok: true };
  });

export const deleteSagacePayKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await deleteSagacePayKey();
    return { ok: true };
  });

/** Valida a chave da SagacePay sem gerar cobrança nenhuma. */
export const testSagacePayFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    return testSagacePayKey();
  });

export const savePaySharkKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.extend({ key: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await savePaySharkKey(data.key);
    return { ok: true };
  });

export const deletePaySharkKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await deletePaySharkKey();
    return { ok: true };
  });

/** Valida a chave da PayShark sem gerar cobrança nenhuma. */
export const testPaySharkFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    return testPaySharkKey();
  });
