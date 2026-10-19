import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  deleteHypercashKeys,
  getHypercashKeys,
  saveHypercashKeys,
  testHypercashSecret,
} from "./hypercash.server";

const pw = z.object({ password: z.string().min(1).max(200) });

function assertAdmin(password: string) {
  if (password !== process.env["ADMIN_PASSWORD"]) throw new Error("Não autorizado");
}

function mask(token: string): string {
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export const getHypercashStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    const k = await getHypercashKeys();
    return {
      secret: k.secret ? mask(k.secret) : null,
      public: k.public ? mask(k.public) : null,
    };
  });

export const saveHypercashKeysFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    pw
      .extend({
        secret: z.string().trim().min(10).max(500).optional(),
        public: z.string().trim().min(10).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await saveHypercashKeys({ secret: data.secret, public: data.public });
    return { ok: true };
  });

export const deleteHypercashKeysFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    await deleteHypercashKeys();
    return { ok: true };
  });

/** Valida a chave secreta sem gerar cobrança nenhuma. */
export const testHypercashFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pw.parse(d))
  .handler(async ({ data }) => {
    assertAdmin(data.password);
    return testHypercashSecret();
  });
