// Pixel do Meta no navegador + espelho no servidor (Conversions API) com deduplicação por event_id.
import { trackMetaEvent } from "./meta.functions";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Pixel principal, inicializado já no <head> pelo código oficial do Meta (ver __root.tsx). */
export const META_PIXEL_ID = "2456602311535795";

const inited = new Set<string>();
const pending: Array<() => void> = [];

function fbqReady() {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

/** Pixel já criado pelo código do <head>? Então os eventos podem sair na hora, na ordem certa. */
function syncFromHead() {
  if (fbqReady() && (window as unknown as { __metaHeadPixel?: string }).__metaHeadPixel) {
    inited.add((window as unknown as { __metaHeadPixel: string }).__metaHeadPixel);
  }
}

/**
 * Garante o pixel carregado. O principal já vem do <head>; se o /admin tiver outro ID, ele é
 * inicializado junto. Nunca chama "init" duas vezes para o mesmo ID (evita duplicar eventos).
 */
export function loadMetaPixel(pixelId: string) {
  if (typeof window === "undefined") return;
  syncFromHead();
  if (!fbqReady()) {
    // Fallback (código do <head> bloqueado): cria o fbq padrão do Meta.
    const n = function (...args: unknown[]) {
      const self = n as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
      if (self.callMethod) self.callMethod(...args);
      else self.queue.push(args);
    } as unknown as Fbq & { push: unknown; loaded: boolean; version: string; queue: unknown[] };
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  if (!inited.has(pixelId)) {
    window.fbq!("init", pixelId);
    inited.add(pixelId);
  }
  flush();
}

/** Página que já recebeu o PageView: os outros eventos só saem depois dele, na mesma página. */
let pageViewPath: string | null = null;
const lastEvent = { key: "", at: 0 };

function flush() {
  if (!isMetaReady()) return;
  const queued = pending.splice(0);
  queued.forEach((fn) => fn());
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** fbc a partir do fbclid da URL quando o cookie ainda não existe. */
function getFbc(): string | null {
  const c = cookie("_fbc");
  if (c) return c;
  const id = new URLSearchParams(window.location.search).get("fbclid");
  return id ? `fb.1.${Date.now()}.${id}` : null;
}

export type MetaBrowserEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo";

export function metaTrack(
  eventName: MetaBrowserEvent,
  data?: { value?: number; contentName?: string },
  /** Para PageView: caminho da rota nova. Espera o navegador atualizar o endereço antes de enviar. */
  routePath?: string,
  tries = 40,
) {
  if (typeof window === "undefined") return;
  if (
    eventName === "PageView" &&
    routePath &&
    window.location.pathname !== routePath &&
    tries > 0
  ) {
    setTimeout(() => metaTrack(eventName, data, routePath, tries - 1), 25);
    return;
  }
  syncFromHead();
  const path = window.location.pathname;
  // Sem pixel ainda, ou evento antes do PageView desta página: espera na fila (ordem garantida).
  if (!isMetaReady() || (eventName !== "PageView" && pageViewPath !== path)) {
    pending.push(() => metaTrack(eventName, data));
    return;
  }
  if (eventName === "PageView") {
    if (pageViewPath === path) return; // um PageView por página
    pageViewPath = path;
  } else {
    // Mesmo evento com os mesmos dados na mesma página em menos de 1,5 s = repetição: ignora.
    const key = `${eventName}|${path}|${data?.value ?? ""}|${data?.contentName ?? ""}`;
    const now = Date.now();
    if (lastEvent.key === key && now - lastEvent.at < 1500) return;
    lastEvent.key = key;
    lastEvent.at = now;
  }
  const eventId = `${eventName}-${crypto.randomUUID()}`;
  const custom =
    data?.value !== undefined
      ? {
          value: data.value,
          currency: "BRL",
          content_name: data.contentName,
          content_type: "product",
        }
      : {};
  window.fbq?.("track", eventName, custom, { eventID: eventId });
  if (eventName === "PageView") flush();
  void trackMetaEvent({
    data: {
      eventName,
      eventId,
      url: window.location.href,
      fbp: cookie("_fbp"),
      fbc: getFbc(),
      value: data?.value,
      contentName: data?.contentName,
    },
  }).catch(() => undefined);
}

/**
 * Purchase no navegador com o mesmo event_id usado no servidor (id do pedido).
 * Upsell pago (kit/seguro, envio expresso) vai como evento próprio "Upsell", igual ao servidor:
 * não conta como nova compra da campanha.
 */
export function metaPurchaseBrowser(
  orderId: string,
  value: number,
  contentName?: string,
  upsell = false,
) {
  if (typeof window === "undefined") return;
  syncFromHead();
  if (!isMetaReady()) {
    pending.push(() => metaPurchaseBrowser(orderId, value, contentName, upsell));
    return;
  }
  // Uma compra por pedido neste navegador (recarregar a página não reenvia).
  const key = `meta-${upsell ? "upsell" : "purchase"}-${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // sem armazenamento: o event_id igual ao do servidor ainda evita duplicar no Meta
  }
  const data = { value, currency: "BRL", content_name: contentName, content_type: "product" };
  if (upsell) window.fbq?.("trackCustom", "Upsell", data, { eventID: `upsell-${orderId}` });
  else window.fbq?.("track", "Purchase", data, { eventID: `purchase-${orderId}` });
}

export function getMetaCookies() {
  if (typeof window === "undefined") return { fbp: null, fbc: null };
  return { fbp: cookie("_fbp"), fbc: getFbc() };
}

/** Estado de inicialização (para hooks aguardarem o pixel). */
export function isMetaReady() {
  return fbqReady() && inited.size > 0;
}
