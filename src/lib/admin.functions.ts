import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return { ok: false, error: "ADMIN_PASSWORD not set" };
    return { ok: data.password === expected };
  });

export const getAdminFunnel = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        password: z.string().min(1).max(200),
        windowMinutes: z
          .number()
          .int()
          .min(5)
          .max(60 * 24 * 30)
          .default(60 * 24),
        onlineMinutes: z.number().int().min(1).max(60).default(3),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.password !== process.env.ADMIN_PASSWORD) {
      throw new Error("Unauthorized");
    }

    const since = new Date(Date.now() - data.windowMinutes * 60 * 1000).toISOString();
    const onlineSince = new Date(Date.now() - data.onlineMinutes * 60 * 1000).toISOString();

    const [{ data: recent }, { data: all }] = await Promise.all([
      supabaseAdmin
        .from("funnel_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("funnel_events")
        .select("session_id,event_type,created_at")
        .gte("created_at", since),
    ]);

    const events = all ?? [];
    const sessions = new Map<string, Set<string>>();
    const lastSeenBySession = new Map<string, string>();
    for (const e of events) {
      if (!sessions.has(e.session_id)) sessions.set(e.session_id, new Set());
      sessions.get(e.session_id)!.add(e.event_type);
      const prev = lastSeenBySession.get(e.session_id);
      if (!prev || new Date(e.created_at).getTime() > new Date(prev).getTime()) {
        lastSeenBySession.set(e.session_id, e.created_at);
      }
    }

    let visited = 0,
      viewedProduct = 0,
      checkout = 0;
    for (const types of sessions.values()) {
      if (types.has("page_view") || types.has("product_view")) visited++;
      if (types.has("product_view")) viewedProduct++;
      if (types.has("checkout_click")) checkout++;
    }

    let onlineNow = 0;
    for (const lastSeen of lastSeenBySession.values()) {
      if (lastSeen >= onlineSince) onlineNow++;
    }

    return {
      recent: recent ?? [],
      funnel: {
        visited,
        viewedProduct,
        checkout,
        totalEvents: events.length,
        totalSessions: sessions.size,
        onlineNow,
        windowMinutes: data.windowMinutes,
        onlineMinutes: data.onlineMinutes,
      },
    };
  });

/**
 * Início do período no horário de Brasília (UTC−3, sem horário de verão).
 * "Hoje" (1 dia) = desde a meia-noite de hoje; N dias = desde a meia-noite de N−1 dias atrás.
 */
export function periodStart(days: number, now = Date.now()): string {
  const BRT = 3 * 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const midnightBrt = Math.floor((now - BRT) / DAY) * DAY + BRT;
  return new Date(midnightBrt - (days - 1) * DAY).toISOString();
}

export type AdminOrder = {
  id: string;
  status: string;
  amount_cents: number;
  customer: {
    name: string;
    email: string;
    phone: string;
    cpf: string;
    endereco?: string;
    frete?: { id: string; name: string; price: number };
    qrcode?: string;
    method?: "pix" | "card";
    installments?: number;
    card?: { brand?: string; lastDigits?: string };
    discount?: number;
  };
  bundle_id: string;
  bundle_name: string;
  utm: Record<string, string | null> | null;
  fbp: string | null;
  fbc: string | null;
  ip: string | null;
  ua: string | null;
  url: string | null;
  paid_reported_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report_result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export const getAdminOrders = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        password: z.string().min(1).max(200),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ orders: AdminOrder[] }> => {
    if (data.password !== process.env.ADMIN_PASSWORD) {
      throw new Error("Unauthorized");
    }
    const since = periodStart(data.days);
    // Tabela pix_orders ainda não presente nos tipos gerados.
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: rows, error } = await db
      .from("pix_orders")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return { orders: (rows ?? []) as AdminOrder[] };
  });

export type AbandonStep = "checkout" | "dados" | "entrega" | "pix";

export type AbandonedCheckout = {
  sessionId: string;
  step: AbandonStep;
  /** Pix gerado há menos de 35 min — ainda pode ser pago. */
  pixPending: boolean;
  firstAt: string;
  lastAt: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  plano: string | null;
  value: number | null;
  cidade: string | null;
  uf: string | null;
  bump: boolean;
  /** Nomes dos order bumps marcados (eventos antigos só têm `bump`). */
  bumps: string[];
  pixId: string | null;
  utmSource: string | null;
};

const STEP_ORDER: AbandonStep[] = ["checkout", "dados", "entrega", "pix"];

/** Agrupa os eventos "checkout_step" por sessão (etapa mais avançada + contato mais recente). Função pura. */
export function groupCheckoutEvents(
  events: {
    session_id: string;
    created_at: string;
    bundle_name: string | null;
    value: number | string | null;
    utm_source: string | null;
    metadata: unknown;
  }[],
): Map<string, AbandonedCheckout> {
  // Junta os eventos por sessão: etapa mais avançada + dados de contato mais recentes.
  const bySession = new Map<string, AbandonedCheckout>();
  for (const e of events ?? []) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const step = String(m["step"] ?? "") as AbandonStep;
    if (!STEP_ORDER.includes(step)) continue;
    const cur =
      bySession.get(e.session_id) ??
      ({
        sessionId: e.session_id,
        step,
        pixPending: false,
        firstAt: e.created_at,
        lastAt: e.created_at,
        name: null,
        email: null,
        phone: null,
        plano: null,
        value: null,
        cidade: null,
        uf: null,
        bump: false,
        bumps: [],
        pixId: null,
        utmSource: null,
      } satisfies AbandonedCheckout);
    if (STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(cur.step)) cur.step = step;
    cur.lastAt = e.created_at;
    const str = (k: string) =>
      typeof m[k] === "string" && (m[k] as string).trim() ? (m[k] as string).trim() : null;
    cur.name = str("name") ?? cur.name;
    cur.email = str("email")?.toLowerCase() ?? cur.email;
    cur.phone = str("phone") ?? cur.phone;
    cur.cidade = str("cidade") ?? cur.cidade;
    cur.uf = str("uf") ?? cur.uf;
    cur.pixId = str("pixId") ?? cur.pixId;
    if (typeof m["bump"] === "boolean") {
      cur.bump = m["bump"] as boolean;
      cur.bumps = Array.isArray(m["bumps"])
        ? (m["bumps"] as unknown[]).filter((b): b is string => typeof b === "string")
        : cur.bump
          ? ["VIVI Cap"]
          : [];
    }
    cur.plano = e.bundle_name ?? cur.plano;
    cur.value = e.value != null ? Number(e.value) : cur.value;
    cur.utmSource = e.utm_source ?? cur.utmSource;
    bySession.set(e.session_id, cur);
  }

  return bySession;
}

/** Checkouts iniciados e não pagos, com a etapa em que a pessoa parou. */
export const getAbandonedCheckouts = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        password: z.string().min(1).max(200),
        days: z.number().int().min(1).max(90).default(7),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{ funnel: Record<AbandonStep | "pago", number>; rows: AbandonedCheckout[] }> => {
      if (data.password !== process.env.ADMIN_PASSWORD) throw new Error("Unauthorized");
      const since = periodStart(data.days);

      const { data: events, error } = await supabaseAdmin
        .from("funnel_events")
        .select("session_id,created_at,bundle_name,value,utm_source,metadata")
        .eq("event_type", "checkout_step")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw new Error(error.message);

      const bySession = groupCheckoutEvents(events ?? []);
      const sessions = [...bySession.values()];
      const db = supabaseAdmin as unknown as { from: (t: string) => any };

      // Pix desses checkouts que foram pagos.
      const pixIds = sessions.map((s) => s.pixId).filter((v): v is string => !!v);
      const paidPix = new Set<string>();
      for (let i = 0; i < pixIds.length; i += 200) {
        const { data: orders } = await db
          .from("pix_orders")
          .select("id,status")
          .in("id", pixIds.slice(i, i + 200));
        for (const o of orders ?? []) if (o.status === "paid") paidPix.add(o.id);
      }
      // Quem pagou em outra sessão (mesmo e-mail) também não conta como abandono.
      const { data: paidOrders } = await db
        .from("pix_orders")
        .select("customer")
        .eq("status", "paid")
        .gte("created_at", since)
        .limit(5000);
      const paidEmails = new Set<string>(
        (paidOrders ?? [])
          .map((o: { customer?: { email?: string } }) =>
            String(o.customer?.email ?? "").toLowerCase(),
          )
          .filter(Boolean),
      );

      const funnel = { checkout: 0, dados: 0, entrega: 0, pix: 0, pago: 0 };
      const rows: AbandonedCheckout[] = [];
      const now = Date.now();
      for (const s of sessions) {
        const idx = STEP_ORDER.indexOf(s.step);
        funnel.checkout++;
        if (idx >= 1) funnel.dados++;
        if (idx >= 2) funnel.entrega++;
        if (idx >= 3) funnel.pix++;
        const paid = (s.pixId && paidPix.has(s.pixId)) || (s.email && paidEmails.has(s.email));
        if (paid) {
          funnel.pago++;
          continue;
        }
        s.pixPending = s.step === "pix" && now - new Date(s.lastAt).getTime() < 35 * 60 * 1000;
        rows.push(s);
      }
      rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
      return { funnel, rows: rows.slice(0, 1000) };
    },
  );
