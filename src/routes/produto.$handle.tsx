import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import { HOME, money } from "@/lib/home";
import { brl, porHandle, PRECO_PAR } from "@/lib/produtos";

export const Route = createFileRoute("/produto/$handle")({
  head: ({ params }) => {
    const p = porHandle.get(params.handle);
    return {
      meta: [
        { title: p ? `${p.title} — Estilo de Artista` : "Produto — Estilo de Artista" },
        {
          name: "description",
          content: p
            ? `${p.title}. R$ ${brl(p.price)}. Frete para todo o Brasil.`
            : "Produto Estilo de Artista",
        },
      ],
    };
  },
  component: ProdutoPage,
});

function ProdutoPage() {
  const { handle } = Route.useParams();
  const produto = porHandle.get(handle);

  // Também aceita handles que só existem no snapshot da home (ex.: hero).
  const homeHit = useMemo(() => {
    const all = [
      ...(HOME.destaque?.products || []),
      ...HOME.sections.flatMap((s) => s.products),
    ];
    return all.find((p) => p.handle === handle) || null;
  }, [handle]);

  if (!produto && !homeHit) throw notFound();

  const title = produto?.title || homeHit!.title;
  const img = produto?.img || homeHit!.image;
  const price = produto?.price ?? homeHit!.variants[0]?.priceCents ?? PRECO_PAR;
  const compare = produto?.compare ?? homeHit!.variants[0]?.compareCents ?? null;
  const sizes = produto?.sizes?.length
    ? produto.sizes
    : (homeHit?.variants || []).map((v) => v.option).filter(Boolean);

  const [size, setSize] = useState(sizes[0] || "");

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap">
        <nav className="crumb">
          <Link to="/">Página inicial</Link> <i>›</i> <b>{title}</b>
        </nav>
        <div className="pdp">
          <div className="pdp-img">
            <img src={img} alt={title} width={900} height={900} />
          </div>
          <div>
            <h1>{title}</h1>
            <div className="price">
              {money(price)}
              {compare && compare > price ? <s>{money(compare)}</s> : null}
            </div>
            <div className="parc">
              à vista no <b>PIX</b>
            </div>
            {sizes.length > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 18, marginBottom: 8 }}>
                  Numeração
                </p>
                <div className="sizes">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={size === s ? "on" : undefined}
                      onClick={() => setSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <a
              className="btn"
              href={`https://estilo-de-artista.vercel.app/produto/${handle}`}
            >
              Comprar na loja
            </a>
            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Checkout e PIX na loja oficial.
            </p>
          </div>
        </div>
      </div>
      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}
