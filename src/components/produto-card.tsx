import { Link } from "@tanstack/react-router";
import type { Produto } from "@/lib/produtos";
import { brl } from "@/lib/produtos";

/** Card de produto da vitrine: foto, título, marca e preço com o "de" riscado. */
export function ProdutoCard({ produto }: { produto: Produto }) {
  return (
    <Link
      to="/produto/$handle"
      params={{ handle: produto.handle }}
      className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
    >
      <div className="tile overflow-hidden rounded-lg bg-muted">
        <img
          src={produto.img}
          alt={produto.title}
          width={600}
          height={600}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {produto.brand || produto.type}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug">
          {produto.title}
        </h3>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold">R$ {brl(produto.price)}</span>
          {produto.compare && produto.compare > produto.price && (
            <span className="text-sm text-promo line-through">R$ {brl(produto.compare)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
