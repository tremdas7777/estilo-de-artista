import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CartLine } from "@/lib/cart";
import { money } from "@/lib/promo";
import { brl } from "./parts";
import { FreeShippingProgress } from "./FreeShippingProgress";

type Props = {
  lines: CartLine[];
  subtotalCents: number;
  discountCents: number;
  frete: number;
  promoLabel?: string;
};

const totalOf = ({ subtotalCents, discountCents, frete }: Props) =>
  Math.max(0, subtotalCents - discountCents) / 100 + frete;

function Body(p: Props) {
  const total = totalOf(p);
  return (
    <>
      <FreeShippingProgress className="mb-5" />
      <div className="space-y-2 text-[13px]">
        <div className="flex justify-between">
          <span>Produtos</span>
          <span>{money(p.subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Frete</span>
          <span className="text-[var(--ck-ok)]">{p.frete ? brl(p.frete) : "Grátis"}</span>
        </div>
        {p.discountCents > 0 && (
          <div className="flex justify-between">
            <span>{p.promoLabel || "Desconto"}</span>
            <span className="text-[var(--ck-ok)]">-{money(p.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{brl(total)}</span>
        </div>
      </div>
      {p.lines.map((l) => (
        <div key={l.id} className="mt-6 flex gap-3 border-t border-border pt-6 first:border-0 first:pt-0">
          <img
            src={l.image}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-md border border-border object-cover bg-muted"
          />
          <div className="flex-1 text-[13px]">
            <p className="font-medium leading-snug">{l.title}</p>
            <p className="mt-1 text-muted-foreground">
              {l.qty} {l.qty > 1 ? "pares" : "par"}
              {l.cor ? ` · ${l.cor}` : ""}
            </p>
          </div>
          <span className="text-[13px]">{money(l.priceCents * l.qty)}</span>
        </div>
      ))}
    </>
  );
}

export function SummaryDesktop(p: Props) {
  return (
    <aside className="hidden h-fit rounded-lg border border-border p-6 lg:block">
      <h2 className="mb-6 text-[15px]">Resumo do pedido</h2>
      <Body {...p} />
    </aside>
  );
}

export function SummaryMobile(p: Props) {
  const [open, setOpen] = useState(false);
  const n = p.lines.reduce((s, l) => s + l.qty, 0);
  return (
    <div className="border-y border-border bg-muted/60 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3"
      >
        <span className="text-[13px]">
          Resumo do pedido ({n} {n === 1 ? "item" : "itens"})
        </span>
        <span className="flex items-center gap-2 text-lg font-medium">
          {brl(totalOf(p))}{" "}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="ck-surface px-5 py-5">
          <Body {...p} />
        </div>
      )}
    </div>
  );
}
