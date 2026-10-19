import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ProdutoCard } from "@/components/produto-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import { HOME, type HomeProduct } from "@/lib/home";
import { PRODUTOS, semAcento } from "@/lib/produtos";

export const Route = createFileRoute("/colecao/$handle")({
  head: ({ params }) => ({
    meta: [{ title: `Coleção — Estilo de Artista` }, { name: "description", content: params.handle }],
  }),
  component: ColecaoPage,
});

function produtosDaColecao(handle: string): { title: string; products: HomeProduct[]; total: number } {
  if (handle === "mais-vendidos" && HOME.destaque) {
    return {
      title: HOME.destaque.title,
      products: HOME.destaque.products,
      total: HOME.destaque.products.length,
    };
  }

  const section = HOME.sections.find((s) => s.handle === handle);
  if (section) {
    // Expande com o catálogo local: mesmos títulos / prefixo da vitrine.
    const termo = semAcento(section.title);
    const extra = PRODUTOS.filter(
      (p) =>
        semAcento(p.title).includes(termo) ||
        semAcento(p.brand).includes(termo.split(" ")[0] || ""),
    ).map(
      (p): HomeProduct => ({
        id: p.handle,
        title: p.title,
        handle: p.handle,
        image: p.img,
        variants: [
          {
            id: `${p.handle}::base`,
            option: p.sizes[0] || "",
            priceCents: p.price,
            compareCents: p.compare,
            available: true,
          },
        ],
      }),
    );
    const seen = new Set(section.products.map((p) => p.handle));
    const merged = [...section.products];
    for (const p of extra) {
      if (!seen.has(p.handle)) {
        seen.add(p.handle);
        merged.push(p);
      }
    }
    return { title: section.title, products: merged, total: section.total || merged.length };
  }

  // Menu: filtra por marca/tag aproximada
  const item = flattenMenu(HOME.menu).find((m) => m.handle === handle);
  const label = item?.title || handle;
  const termo = semAcento(label);
  const products = PRODUTOS.filter(
    (p) =>
      semAcento(p.brand) === termo ||
      semAcento(p.title).includes(termo) ||
      semAcento(p.type).includes(termo),
  ).map(
    (p): HomeProduct => ({
      id: p.handle,
      title: p.title,
      handle: p.handle,
      image: p.img,
      variants: [
        {
          id: `${p.handle}::base`,
          option: p.sizes[0] || "",
          priceCents: p.price,
          compareCents: p.compare,
          available: true,
        },
      ],
    }),
  );
  return { title: label, products, total: products.length };
}

function flattenMenu(items: typeof HOME.menu) {
  const out: typeof HOME.menu = [];
  for (const i of items) {
    out.push(i);
    if (i.children?.length) out.push(...flattenMenu(i.children));
  }
  return out;
}

function ColecaoPage() {
  const { handle } = Route.useParams();
  const data = useMemo(() => produtosDaColecao(handle), [handle]);

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap">
        <nav className="crumb">
          <Link to="/">Página inicial</Link> <i>›</i> <b>{data.title}</b>
        </nav>
        <h1 className="ctitle">{data.title}</h1>
        <p className="muted">{data.products.length} produtos</p>
        {data.products.length === 0 ? (
          <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
            Coleção vazia por enquanto.
          </p>
        ) : (
          <div className="grid">
            {data.products.map((p) => (
              <ProdutoCard key={p.handle} produto={p} />
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}
