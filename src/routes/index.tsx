import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Hero } from "@/components/hero";
import { Selos } from "@/components/selos";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Destaque, Vitrine } from "@/components/vitrine";
import { WhatsFloat } from "@/components/whats-float";
import { ProdutoCard } from "@/components/produto-card";
import { HOME, type HomeProduct } from "@/lib/home";
import { PRODUTOS, semAcento } from "@/lib/produtos";

type LojaSearch = {
  q?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => {
    const q = search["q"];
    return typeof q === "string" ? { q } : {};
  },
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
  const { q } = Route.useSearch();
  const secoes = HOME.sections;
  const corte = Math.ceil(secoes.length / 2);

  const busca = useMemo(() => {
    if (!q?.trim()) return null as HomeProduct[] | null;
    const termo = semAcento(q);
    return PRODUTOS.filter(
      (p) =>
        semAcento(p.title).includes(termo) ||
        semAcento(p.brand).includes(termo) ||
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
  }, [q]);

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} overHero />
      <Hero />
      <Selos />

      {busca ? (
        <main className="wrap">
          <h1 className="ctitle">Resultados para “{q}”</h1>
          <p className="muted" style={{ marginBottom: 8 }}>
            {busca.length} produto{busca.length === 1 ? "" : "s"}
          </p>
          {busca.length === 0 ? (
            <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
              Nada encontrado — tenta outro termo.
            </p>
          ) : (
            <div className="grid">
              {busca.map((p) => (
                <ProdutoCard key={p.handle} produto={p} />
              ))}
            </div>
          )}
        </main>
      ) : (
        <>
          <div id="feats">
            {HOME.destaque ? <Destaque destaque={HOME.destaque} /> : null}
            {secoes.slice(0, corte).map((s) => (
              <Vitrine key={s.handle} section={s} />
            ))}
          </div>

          <section className="insta" style={{ background: "#fff", padding: "38px 0 44px" }}>
            <div
              className="insta-in"
              style={{
                maxWidth: 1240,
                margin: "0 auto",
                padding: "0 16px",
                display: "grid",
                gap: 26,
                alignItems: "center",
              }}
            >
              <a
                href="https://www.instagram.com/estilo_de_artista_/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", borderRadius: 20, overflow: "hidden" }}
              >
                <img
                  src="/assets/banner-instagram.webp"
                  alt="Siga Estilo de Artista no Instagram"
                  width={1200}
                  height={1200}
                  loading="lazy"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </a>
            </div>
          </section>

          <div id="feats2">
            {secoes.slice(corte).map((s) => (
              <Vitrine key={s.handle} section={s} />
            ))}
          </div>

          <section className="about">
            <div className="about-in">
              <div className="about-img">
                <img
                  src="/assets/loja-fachada.webp"
                  width={1200}
                  height={724}
                  loading="lazy"
                  alt="Parede de tênis com o letreiro Estilo de Artista"
                />
              </div>
              <div className="about-tx">
                <h2>Quem é Estilo de Artista</h2>
                <p>
                  Estilo de Artista nasceu de uma ideia simples: tênis que a rua respeita, chegando
                  na sua casa sem enrolação.
                </p>
                <p>
                  A gente é focado. Não vende de tudo — vende{" "}
                  <strong>TN, Tesla, Hocks, Vans e Puma</strong> e os modelos que realmente importam
                  pra quem entende do assunto. Cada par que entra no catálogo passa por curadoria.
                  Se a gente não usaria, não vende.
                </p>
                <p>
                  <strong>Rastreio desde o primeiro dia.</strong> Comprou, recebeu o código. Dá pra
                  acompanhar o pedido do envio até a sua porta.
                </p>
                <p>
                  <strong>Deu errado, a gente resolve.</strong> Tamanho não serviu, chegou diferente
                  do que você esperava, veio com defeito? Troca ou devolução — sem discussão e sem
                  letra miúda.
                </p>
                <p>
                  <strong>Atendimento com gente de verdade.</strong> WhatsApp respondido por pessoa,
                  não por robô. Se bater dúvida antes de comprar, chama.
                </p>
                <p>
                  <strong>Estilo de Artista — o par certo, na sua porta.</strong>
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}
