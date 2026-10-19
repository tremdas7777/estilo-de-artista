import type { ReactNode, InputHTMLAttributes } from "react";
import { Check, Lock, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("text-[var(--ck-pix)]", className)} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 7.6 6.9h1.1c.8 0 1.5.3 2 .8L12 9l1.3-1.3c.5-.5 1.2-.8 2-.8h1.1L12 2.5Zm-6.1 6L2.5 12l3.4 3.4h2.2c.4 0 .8-.2 1.1-.5L11 13.1a1.6 1.6 0 0 0-2.2-2.2L7.1 9c-.3-.3-.7-.5-1.1-.5Zm12.2 0h-2.2c-.4 0-.8.2-1.1.5l-1.8 1.8a1.6 1.6 0 0 0 2.2 2.2l1.8 1.8c.3.3.7.5 1.1.5h.1l3.4-3.4-3.5-3.4ZM12 15l-1.3 1.3c-.5.5-1.2.8-2 .8H7.6l4.4 4.4 4.4-4.4h-1.1c-.8 0-1.5-.3-2-.8L12 15Z"/>
    </svg>
  );
}

export const PRODUCT_IMG = brand.logoClaro;

export function Card({ children, done, muted, className }: { children: ReactNode; done?: boolean; muted?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 md:p-[26px]",
        done ? "border-[var(--ck-ok)] bg-[var(--ck-ok)]/[0.03]" : muted ? "border-transparent bg-muted/60" : "border-border ck-surface shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, step, onEdit, sub, muted }: { title: string; step?: string; onEdit?: () => void; sub?: string; muted?: boolean }) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-lg font-semibold tracking-tight", muted && "text-muted-foreground")}>{title}</h2>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Editar <SquarePen className="h-4 w-4" />
          </button>
        ) : (
          step && <span className={cn("text-xs tabular-nums text-muted-foreground", muted && "opacity-70")}>{step}</span>
        )}
      </div>
      {sub && <p className={cn("mt-1 text-[13px] text-muted-foreground", muted && "opacity-70")}>{sub}</p>}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; ok?: boolean; prefix?: string; wrap?: string };
export function Field({ label, ok, prefix, wrap, className, ...rest }: FieldProps) {
  const filled = Boolean(rest.value);
  return (
    <label className={cn("block", wrap)}>
      <span className="mb-2 block text-[13px] font-medium">{label}</span>
      <span className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-muted-foreground">{prefix}</span>}
        <input
          {...rest}
          className={cn(
            "h-[46px] w-full rounded-lg border px-3 text-base md:text-[13px] outline-none focus-visible:border-[var(--ck-brand)] focus-visible:ring-1 focus-visible:ring-[var(--ck-brand)]",
            filled ? "border-[var(--ck-brand)]/25 bg-[var(--ck-field)]" : "border-border ck-surface",
            prefix && "pl-12",
            className,
          )}
        />
        {ok && <Check className="absolute right-3 h-4 w-4 text-[var(--ck-ok)]" />}
      </span>
    </label>
  );
}

export function GreenButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--ck-cta)] text-base font-bold text-white hover:brightness-95 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function CheckoutFooter() {
  return (
    <footer className="mt-auto bg-[var(--ck-footer)] px-4 py-8 text-center text-[13px] text-white">
      <div className="mx-auto mb-4 h-1 w-24 rounded-full bg-gradient-to-r from-[var(--ck-brand)] via-[var(--ck-volt)] to-[var(--ck-brand)]" />
      <p className="font-semibold tracking-tight">{brand.name} · Todos os direitos reservados</p>
      <p className="mt-2 opacity-80">
        © {new Date().getFullYear()}
        {brand.cnpj ? ` · CNPJ: ${brand.cnpj}` : ""} · {brand.email}
      </p>
      <p className="mt-3 text-sm opacity-90">Formas de pagamento:</p>
      <div className="mt-2 flex justify-center gap-2">
        {["Master", "VISA", "AMEX"].map((b) => (
          <span key={b} className="flex h-6 w-9 items-center justify-center rounded-sm bg-white text-[8px] font-bold text-foreground">
            {b}
          </span>
        ))}
        <span className="flex h-6 w-9 items-center justify-center rounded-sm bg-white">
          <PixIcon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2 opacity-90">
        <Lock className="h-5 w-5" />
        <span className="text-left text-xs leading-tight">
          <b>PAGAMENTO</b>
          <br />
          100% SEGURO
        </span>
      </div>
    </footer>
  );
}
