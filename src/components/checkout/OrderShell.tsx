import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { brand } from "@/lib/brand";
import { CheckoutFooter } from "./parts";

/** Layout das páginas pós-checkout (pedido, upsell, obrigado). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="ck flex min-h-screen flex-col bg-white text-foreground">
      <div className="h-1 w-full bg-gradient-to-r from-[var(--ck-brand-dark)] via-[var(--ck-brand)] to-[var(--ck-volt)]" />
      <header className="flex justify-center py-6 md:py-8">
        <Link to="/">
          <img src={brand.logoClaro} alt={brand.name} className="h-10 w-auto md:h-12" />
        </Link>
      </header>
      <main className="flex-1 pt-4">{children}</main>
      <CheckoutFooter />
    </div>
  );
}

export function Pill({ variant }: { variant: "waiting" | "approved" | "refused" }) {
  const map = {
    waiting: { text: "Aguardando pagamento", cls: "bg-[#fdf3d1] text-[#8a6a12]" },
    approved: { text: "Aprovado", cls: "bg-[var(--ck-badge)] text-[var(--ck-ok)]" },
    refused: { text: "Pagamento não aprovado", cls: "bg-red-100 text-red-700" },
  } as const;
  const v = map[variant];
  return (
    <span className={`inline-block rounded-full px-5 py-2 text-[13px] font-semibold ${v.cls}`}>
      {v.text}
    </span>
  );
}
