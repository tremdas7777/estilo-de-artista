import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type RefObject } from "react";
import { IconSeta } from "@/components/icons";
import { ProdutoCard } from "@/components/produto-card";
import type { HomeDestaque, HomeProduct, HomeSection } from "@/lib/home";

function useRowScroll(rowRef: RefObject<HTMLDivElement | null>) {
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const sync = () => {
      setCanPrev(el.scrollLeft > 8);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [rowRef]);

  const scroll = (dir: -1 | 1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  return { canPrev, canNext, scroll };
}

function Row({ products, rowClass }: { products: HomeProduct[]; rowClass: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { canPrev, canNext, scroll } = useRowScroll(ref);

  return (
    <div className="rowwrap">
      <div className={rowClass} ref={ref}>
        {products.map((p) => (
          <ProdutoCard key={p.handle} produto={p} />
        ))}
      </div>
      <button
        type="button"
        className="rowbtn prev"
        aria-label="Anterior"
        hidden={!canPrev}
        onClick={() => scroll(-1)}
      >
        <IconSeta dir="prev" />
      </button>
      <button
        type="button"
        className="rowbtn next"
        aria-label="Próximo"
        hidden={!canNext}
        onClick={() => scroll(1)}
      >
        <IconSeta dir="next" />
      </button>
    </div>
  );
}

/** Fileira horizontal de produtos (Hocks Bold, Tesla Coil…). */
export function Vitrine({ section }: { section: HomeSection }) {
  return (
    <section className="feat">
      <div className="feat-hd">
        <h2>{section.title}</h2>
        <Link to="/colecao/$handle" params={{ handle: section.handle }}>
          Ver Todos <i>({section.total})</i>
        </Link>
      </div>
      <Row products={section.products} rowClass="row" />
    </section>
  );
}

/** Painel “Mais Vendidos” com texto à esquerda. */
export function Destaque({ destaque }: { destaque: HomeDestaque }) {
  return (
    <section className="hl">
      <div className="hl-in">
        <div className="hl-tx">
          <h2>{destaque.title}</h2>
          {destaque.subtitle ? <p>{destaque.subtitle}</p> : null}
          {destaque.href ? (
            <Link to="/colecao/$handle" params={{ handle: "mais-vendidos" }} className="hl-btn">
              {destaque.botao || "Ver todos"}
            </Link>
          ) : null}
        </div>
        <Row products={destaque.products} rowClass="hl-row" />
      </div>
    </section>
  );
}
