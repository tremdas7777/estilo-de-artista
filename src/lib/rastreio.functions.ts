import { createServerFn } from "@tanstack/react-start";

function normalizeCpf(input: string): string {
  return (input || "").replace(/\D/g, "").slice(0, 11);
}

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  return true;
}

export type RastreioStatus =
  | "pedido_recebido"
  | "postado"
  | "em_transito"
  | "saiu_entrega"
  | "entregue";

export function computeStatus(dataCriacao: string): RastreioStatus {
  const start = new Date(dataCriacao).getTime();
  const days = (Date.now() - start) / (1000 * 60 * 60 * 24);
  if (days >= 21) return "entregue";
  if (days >= 18) return "saiu_entrega";
  if (days >= 7) return "em_transito";
  if (days >= 3) return "postado";
  return "pedido_recebido";
}

export const trackByCpf = createServerFn({ method: "POST" })
  .inputValidator((input: { cpf: string }) => input)
  .handler(async ({ data }) => {
    const cpf = normalizeCpf(data.cpf);
    if (!isValidCpf(cpf)) {
      throw new Error("CPF inválido. Digite os 11 números.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pedido pago mais recente desse CPF — de onde vêm o código e o link reais da transportadora (Rotasync).
    const { data: order } = await supabaseAdmin
      .from("pix_orders")
      .select("id, created_at, report_result")
      .filter("customer->>cpf", "eq", cpf)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const rastro = (order?.report_result as
      | { rastro?: { ok?: boolean; trackingCode?: string; trackingUrl?: string } }
      | null)?.rastro;
    const trackingCode = rastro?.ok ? rastro.trackingCode : undefined;
    const trackingUrl = rastro?.ok ? rastro.trackingUrl : undefined;

    // Lookup by codigo_rastreio = CPF
    const { data: existing } = await supabaseAdmin
      .from("rastreios")
      .select("*")
      .eq("codigo_rastreio", cpf)
      .maybeSingle();

    let row = existing;
    if (!row) {
      const pedido = "AID" + cpf.slice(-6) + Math.floor(Math.random() * 90 + 10);
      const { data: inserted, error } = await supabaseAdmin
        .from("rastreios")
        .insert({
          pedido,
          nome: "Cliente",
          email: "",
          codigo_rastreio: cpf,
          status: "pedido_recebido",
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      row = inserted;
    }

    const status = computeStatus(row.data_criacao);

    // Persist updated status if changed
    if (status !== row.status) {
      await supabaseAdmin
        .from("rastreios")
        .update({ status, data_atualizacao: new Date().toISOString() })
        .eq("id", row.id);
      row.status = status;
    }

    return {
      pedido: row.pedido,
      status,
      data_criacao: row.data_criacao,
      data_atualizacao: row.data_atualizacao,
      tracking_code: trackingCode ?? null,
      tracking_url: trackingUrl ?? null,
    };
  });
