import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import bannerDesktop from "@/assets/banner-principal-desktop.webp.asset.json";
import bannerMobile from "@/assets/banner-principal-mobile.webp.asset.json";
import { Catalogo } from "@/components/catalogo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import {
  PRECO_DUPLA,
  PRECO_PAR,
  PRODUTOS,
  brl,
  marcasComQtde,
  semAcento,
} from "@/lib/produtos";

type LojaSearch = {
  tipo?: string;
  marca?: string;
  q?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => ({
    tipo: typeof search.tipo === "string" ? search.tipo : undefined,
    marca: typeof search.marca === "string" ? search.marca : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Estilo de Artista — O par certo, na sua porta" },
      {
        name: "description",
        content:
          "Sneakers e streetwear com preço de loja. 1 par R$ 99 · 2 pares R$ 149. Frete para todo o Brasil.",
      },
      { property: "og:title", content: "Estilo de Artista" },
      {
        property: "og:description",
        content: "Sneakers e streetwear. 1 par R$ 99 · 2 pares R$ 149.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LojaHome,
});

function LojaHome() {
  const { tipo, marca, q } = Route.useSearch();
  const navigate = Route.useNavigate();

  const filtrados = useMemo(() => {
    const termo = q ? semAcento(q) : "";
    return PRODUTOS.filter((p) => {
      if (tipo && p.type !== tipo) return false;
      if (marca && p.brand !== marca) return false;
      if (!termo) return true;
      return (
        semAcento(p.title).includes(termo) ||
        semAcento(p.brand).includes(termo) ||
        semAcento(p.type).includes(termo)
      );
    });
  }, [tipo, marca, q]);

  const marcas = marcasComQtde().slice(0, 12);
  const filtroKey = `${tipo ?? ""}|${marca ?? ""}|${q ?? ""}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden bg-foreground text-background">
        <picture>
          <source media="(min-width: 768px)" srcSet={bannerDesktop.url} />
          <img
            src={bannerMobile.url}
            alt="Estilo de Artista — coleção"
            width={1600}
            height={900}
            className="max-h-[52vh] w-full object-cover opacity-90 md:max-h-[58vh]"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-8 md:pb-12">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-volt">Estilo de Artista</p>
          <h1 className="mt-2 max-w-xl text-4xl font-extrabold leading-none md:text-6xl">
            Seu estilo.
            <br />
            Suas regras.
          </h1>
          <p className="mt-3 max-w-md text-sm text-background/80 md:text-base">
            1 par R$ {brl(PRECO_PAR)} · 2 pares R$ {brl(PRECO_DUPLA)}. Frete para todo o Brasil.
          </p>
        </div>
      </section>

      <div className="border-b border-border bg-volt px-4 py-3 text-center text-sm font-bold text-foreground">
        PROMO · leve 2 pares por R$ {brl(PRECO_DUPLA)}
      </div>

      <main id="catalogo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-extrabold">Vitrine</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {PRODUTOS.length} produtos · filtre por marca ou categoria
            </p>
          </div>
          <label className="block w-full md:max-w-xs">
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              defaultValue={q ?? ""}
              placeholder="Buscar tênis, marca…"
              className="w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-foreground"
              onChange={(e) => {
                const value = e.target.value.trim();
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    q: value || undefined,
                  }),
                  replace: true,
                });
              }}
            />
          </label>
        </div>

        <div className="scrollbar-none mt-6 flex gap-2 overflow-x-auto pb-1">
          <FiltroChip
            ativo={!marca}
            onClick={() =>
              void navigate({
                search: (prev) => ({ ...prev, marca: undefined }),
              })
            }
          >
            Todas as marcas
          </FiltroChip>
          {marcas.map((m) => (
            <FiltroChip
              key={m.nome}
              ativo={marca === m.nome}
              onClick={() =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    marca: prev.marca === m.nome ? undefined : m.nome,
                  }),
                })
              }
            >
              {m.nome} ({m.qtde})
            </FiltroChip>
          ))}
        </div>

        <div className="mt-8">
          <Catalogo key={filtroKey} produtos={filtrados} filtro={filtroKey} totalGeral={PRODUTOS.length} />
        </div>
      </main>

      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}

function FiltroChip({
  children,
  ativo,
  onClick,
}: {
  children: ReactNode;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        ativo
          ? "bg-foreground text-background"
          : "bg-muted text-foreground hover:bg-foreground/10"
      }`}
    >
      {children}
    </button>
  );
}
