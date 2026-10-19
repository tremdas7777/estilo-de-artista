import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Frete grátis em todos os pedidos desta loja. */
export function FreeShippingProgress({ className }: { className?: string; bundle?: unknown; subtotal?: number }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--ck-ok)] bg-[var(--ck-badge)]/40 px-4 py-3 text-[13px]",
        className,
      )}
    >
      <p className="flex items-center gap-2">
        <Truck className="h-4 w-4 shrink-0 text-[var(--ck-ok)]" />
        <span>
          Você ganhou <b className="text-[var(--ck-ok)]">FRETE GRÁTIS</b> para todo o Brasil
        </span>
      </p>
    </div>
  );
}
