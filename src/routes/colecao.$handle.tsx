import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ProdutoCard } from "@/components/produto-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import { getColecao } from "@/lib/api";
import { HOME } from "@/lib/home";

export const Route = createFileRoute("/colecao/$handle")({
  loader: async ({ params }) => {
    try {
      return await getColecao({
        data: { handle: params.handle, limit: 48, sort: "destaque" },
      });
    } catch {
      // Fallback: vitrine snapshot da home
      if (params.handle === "mais-vendidos" && HOME.destaque) {
        return {
          title: HOME.destaque.title,
          handle: "mais-vendidos",
          total: HOME.destaque.products.length,
          products: HOME.destaque.products,
        };
      }
      const section = HOME.sections.find((s) => s.handle === params.handle);
      if (section) {
        return {
          title: section.title,
          handle: section.handle,
          total: section.total,
          products: section.products,
        };
      }
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title
          ? `${loaderData.title} — Estilo de Artista`
          : "Coleção — Estilo de Artista",
      },
    ],
  }),
  component: ColecaoPage,
});

function ColecaoPage() {
  const data = Route.useLoaderData();

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap">
        <nav className="crumb">
          <Link to="/">Página inicial</Link> <i>›</i> <b>{data.title}</b>
        </nav>
        <h1 className="ctitle">{data.title}</h1>
        <p className="muted">
          {data.products.length} de {data.total} produtos
        </p>
        <div className="grid">
          {data.products.map((p) => (
            <ProdutoCard key={p.handle} produto={p} />
          ))}
        </div>
      </div>
      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}
