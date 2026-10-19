import { createFileRoute, notFound } from "@tanstack/react-router";
import { brl, linkWhats, porHandle } from "@/lib/produtos";
import { ProdutoCard } from "@/components/produto-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsFloat } from "@/components/whats-float";

export const Route = createFileRoute("/produto/$handle")({
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.produto.title} — Estilo de Artista` : "Produto — Estilo de Artista" },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.produto.title} por R$ ${brl(loaderData.produto.price)}. Frete grátis, compra segura e envio para todo o Brasil.`
          : "Tênis e streetwear com preço de loja.",
      },
      { property: "og:title", content: loaderData ? loaderData.produto.title : "Estilo de Artista" },
      {
        property: "og:description",
        content: loaderData ? `${loaderData.produto.title} — R$ ${brl(loaderData.produto.price)}` : "Sneakers e streetwear.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ params }) => {
    const produto = porHandle.get(params.handle);
    if (!produto) throw notFound();
    return { produto };
  },
  component: PaginaProduto,
});

const CONFIANCA = ["Frete grátis", "Garantia de 7 dias", "Envio com código de rastreio", "Compra segura"];

function PaginaProduto() {
  const { produto } = Route.useLoaderData();
  const parecidos = porHandle.size > 0
    ? [...porHandle.values()]
        .filter((p) => p.handle !== produto.handle && (p.brand === produto.brand || p.type === produto.type))
        .slice(0, 4)
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-14">
        <div className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
          <div className="tile overflow-hidden rounded-xl bg-muted">
            <img
              src={produto.img}
              alt={produto.title}
              width={800}
              height={800}
              className="aspect-square w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {produto.brand || produto.type} · {produto.type}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{produto.title}</h1>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="text-4xl font-extrabold">R$ {brl(produto.price)}</span>
              {produto.compare && produto.compare > produto.price && (
                <span className="text-xl text-promo line-through">R$ {brl(produto.compare)}</span>
              )}
            </p>

            {produto.sizes.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-bold uppercase tracking-widest">
                  {produto.sizeName ?? "Tamanho"}
                </h2>
                <TamOpcoes tamanhos={produto.sizes} />
              </div>
            )}

            <a
              href={linkWhats(
                `Olá! Quero pedir o ${produto.title}${
                  produto.sizeName && produto.sizes.length > 0
                    ? ` — ${produto.sizeName.toLowerCase()} a escolher`
                    : ""
                } (R$ ${brl(produto.price)}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center rounded-lg bg-foreground py-4 text-base font-bold text-background transition-colors hover:bg-volt hover:text-foreground"
            >
              Pedir pelo WhatsApp
            </a>

            <ul className="mt-6 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              {CONFIANCA.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-volt" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {parecidos.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-extrabold">Combina com você</h2>
            <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
              {parecidos.map((p) => (
                <ProdutoCard key={p.handle} produto={p} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}

import { useState } from "react";

function TamOpcoes({ tamanhos }: { tamanhos: string[] }) {
  const [tamanho, setTamanho] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Escolha o tamanho">
      {tamanhos.map((tam) => (
        <button
          key={tam}
          type="button"
          role="radio"
          aria-checked={tamanho === tam}
          onClick={() => setTamanho(tam)}
          className={`min-w-12 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-foreground ${
            tamanho === tam
              ? "border-foreground bg-foreground text-background"
              : "border-input hover:border-foreground"
          }`}
        >
          {tam}
        </button>
      ))}
    </div>
  );
}
