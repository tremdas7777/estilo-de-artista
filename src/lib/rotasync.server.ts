// Envio de pedidos pagos para a Rotasync (RASTREIO_API_URL / RASTREIO_API_KEY).
// Somente servidor — a chave nunca vai para o navegador.
// Doc (exemplo do usuário): POST {RASTREIO_API_URL}/api/v1/orders
//   Authorization: Bearer <chave>
//   Idempotency-Key: "<external_id>-pago"
//   Body: external_id, number, payment_status "paid",
//         customer {name,email,phone},
//         shipping_address {street,number,district,city,state,postal_code},
//         items [{name,quantity}]

const DEFAULT_API = "https://rotasync.online";

export type RotasyncAddress = {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipcode: string;
};

export type RotasyncOrder = {
  transactionId: string;
  customer: { name: string; email: string; phone: string; document: string };
  address: RotasyncAddress;
  products: { name: string; quantity: number; price: number }[];
};

export type RotasyncResult = {
  ok: boolean;
  status?: number;
  trackingCode?: string;
  trackingUrl?: string;
  duplicate?: boolean;
  error?: string;
  details?: unknown;
};

const digits = (v: string) => (v ?? "").replace(/\D/g, "");
const cut = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CEP no formato 01001-000. */
function formatZip(zipcode: string): string {
  const d = digits(zipcode).slice(0, 8);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Monta o corpo exatamente no formato da API da Rotasync. */
function buildBody(o: RotasyncOrder) {
  const email = o.customer.email.trim().toLowerCase();
  const phone = digits(o.customer.phone);
  const externalId = o.transactionId.replace(/[^\w.-]/g, "-").slice(0, 50);
  return {
    external_id: externalId,
    number: externalId,
    payment_status: "paid" as const,
    customer: {
      name: cut(o.customer.name, 255),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      phone: phone.length >= 10 && phone.length <= 13 ? phone : "",
    },
    shipping_address: {
      street: cut(o.address.street, 255),
      number: cut(o.address.number, 20),
      ...(o.address.complement?.trim() ? { complement: cut(o.address.complement, 255) } : {}),
      district: cut(o.address.neighborhood, 255),
      city: cut(o.address.city, 255),
      state: o.address.state.trim().toUpperCase().slice(0, 2),
      postal_code: formatZip(o.address.zipcode),
    },
    items: o.products.map((p) => ({
      name: cut(p.name, 255),
      quantity: Math.max(1, Math.min(9999, Math.round(p.quantity))),
    })),
  };
}

/** O código/link de rastreio podem vir em vários formatos de resposta — tenta os mais comuns. */
function pickTracking(json: unknown): { trackingCode?: string; trackingUrl?: string } {
  const j = json as
    | {
        tracking_code?: string;
        tracking_url?: string;
        code?: string;
        data?: { tracking_code?: string; tracking_url?: string; code?: string };
        order?: { tracking_code?: string; tracking_url?: string };
      }
    | null;
  return {
    trackingCode:
      j?.tracking_code ?? j?.data?.tracking_code ?? j?.order?.tracking_code ?? j?.data?.code ?? j?.code,
    trackingUrl: j?.tracking_url ?? j?.data?.tracking_url ?? j?.order?.tracking_url,
  };
}

/**
 * Envia o pedido pago. Não retenta erros definitivos (401/402/403/413/415/422);
 * retenta uma vez em erro de rede e em 429/5xx.
 */
export async function sendRotasyncOrder(o: RotasyncOrder): Promise<RotasyncResult> {
  const base = (process.env["RASTREIO_API_URL"] ?? DEFAULT_API).replace(/\/+$/, "");
  const key = process.env["RASTREIO_API_KEY"];
  if (!key) return { ok: false, error: "RASTREIO_API_KEY não configurada" };
  const body = JSON.stringify(buildBody(o));

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}/api/v1/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          // Idempotência: a mesma chave sempre identifica o mesmo pedido pago.
          "Idempotency-Key": `${JSON.parse(body).external_id}-pago`,
        },
        body,
      });
    } catch (e) {
      console.error("Rotasync network error", e);
      if (attempt === 0) {
        await sleep(3000);
        continue;
      }
      return { ok: false, error: "Falha de conexão" };
    }
    const json = (await res.json().catch(() => null)) as unknown;

    if (res.status >= 200 && res.status < 300) {
      return {
        ok: true,
        status: res.status,
        ...pickTracking(json),
        duplicate: res.status !== 201,
      };
    }

    const err = {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}`,
      details: json ?? undefined,
    };
    if (res.status === 422) {
      // Logar o corpo inteiro: costuma dizer exatamente qual campo falhou.
      console.error("Rotasync 422", o.transactionId, JSON.stringify(json));
      return err;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 1) {
      console.error(
        "Rotasync error",
        o.transactionId,
        res.status,
        JSON.stringify(json)?.slice(0, 500),
      );
      return err;
    }
    const retryAfter = Number(res.headers.get("Retry-After"));
    await sleep(
      Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000, 10_000),
    );
  }
  return { ok: false, error: "Sem resposta" };
}
