import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getVariants, type ApiVariantDetalhe } from "@/lib/api";
import { computeDiscount, PROMO } from "@/lib/promo";

const STORAGE_KEY = "cart";

/** Formato da Vercel: { [variantId]: qty } */
type CartMap = Record<string, number>;

export interface CartLine extends ApiVariantDetalhe {
  qty: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  promoApplies: boolean;
  eligibleQty: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (variantId: string, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  itemsForOrder: () => Array<{ variantId: string; qty: number }>;
  refreshing: boolean;
}

const Ctx = createContext<CartCtx | null>(null);

function readMap(): CartMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CartMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: CartMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<CartMap>({});
  const [details, setDetails] = useState<Record<string, ApiVariantDetalhe>>({});
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMap(readMap());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeMap(map);
  }, [map, hydrated]);

  const ids = useMemo(
    () => Object.keys(map).filter((id) => (map[id] || 0) > 0),
    [map],
  );

  useEffect(() => {
    if (!ids.length) {
      setDetails({});
      return;
    }
    let cancelled = false;
    setRefreshing(true);
    void getVariants({ data: { ids } })
      .then((list) => {
        if (cancelled) return;
        const next: Record<string, ApiVariantDetalhe> = {};
        for (const v of list) next[v.id] = v;
        setDetails(next);
      })
      .catch((e) => console.error("[cart] variants", e))
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ids.join(",")]);

  const lines: CartLine[] = useMemo(() => {
    return ids
      .map((id) => {
        const d = details[id];
        if (!d) return null;
        return { ...d, qty: map[id] || 0 };
      })
      .filter((x): x is CartLine => !!x && x.qty > 0);
  }, [ids, details, map]);

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const promoItems = lines.map((l) => ({
    priceCents: l.priceCents,
    qty: l.qty,
    handle: l.handle || "",
  }));
  const { discountCents, applies } = computeDiscount(promoItems);
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const eligibleQty = promoItems
    .filter((it) => it.priceCents === PROMO.eligiblePriceCents)
    .reduce((s, it) => s + it.qty, 0);

  const add = useCallback((variantId: string, qty = 1) => {
    setMap((prev) => ({
      ...prev,
      [variantId]: (prev[variantId] || 0) + qty,
    }));
    setOpen(true);
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    setMap((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[variantId];
      else next[variantId] = qty;
      return next;
    });
  }, []);

  const remove = useCallback((variantId: string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, []);

  const clear = useCallback(() => setMap({}), []);

  const itemsForOrder = useCallback(
    () => ids.map((id) => ({ variantId: id, qty: map[id] || 0 })).filter((i) => i.qty > 0),
    [ids, map],
  );

  const value: CartCtx = {
    lines,
    count,
    subtotalCents,
    discountCents,
    totalCents,
    promoApplies: applies,
    eligibleQty,
    open,
    setOpen,
    add,
    setQty,
    remove,
    clear,
    itemsForOrder,
    refreshing,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart fora do CartProvider");
  return ctx;
}
