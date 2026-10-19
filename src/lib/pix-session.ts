/** Sessão do Pix compartilhada entre /checkout e /pedido/$id (client-side). */
export type PixSession = {
  id: string;
  qrcode: string;
  /** Valor em centavos. */
  amount: number;
  email: string;
  name: string;
  bundleId: string;
  bundleName: string;
  sensors: number;
  months: number;
  productPrice: number;
  /** Order bumps aceitos no checkout (valor em reais). */
  bumps?: { name: string; price: number }[];
  /** Formato antigo (um só bump). */
  bump?: { name: string; price: number };
  /** Upsell pós-compra: id do pedido original. */
  isUpsell?: boolean;
  parentId?: string;
  /** Upsell: o que foi comprado nesta cobrança (kit/seguro, ou só "expresso"). */
  upsellItems?: string[];
  /** Pedido principal: cobranças pós-compra já pagas (ofertas e envio expresso). */
  upsellId?: string;
  expressId?: string;
  frete: number;
  discount: number;
  createdAt: number;
  phone?: string;
  cpf?: string;
  utm?: Record<string, string | null>;
  fbp?: string | null;
  fbc?: string | null;
  /** Pedido pago no cartão (sem código Pix). */
  method?: "pix" | "card";
  installments?: number;
  /** Token do cartão gerado pela HyperCash (expira em ~15 min). Só nesta aba, nunca no banco. */
  cardHash?: string;
};

const key = (id: string) => `pix:${id}`;

export function savePixSession(s: PixSession): void {
  try {
    sessionStorage.setItem(key(s.id), JSON.stringify(s));
  } catch {
    // storage indisponível — a tela /pedido cai no fallback
  }
}

export function loadPixSession(id: string): PixSession | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as PixSession) : null;
  } catch {
    return null;
  }
}
