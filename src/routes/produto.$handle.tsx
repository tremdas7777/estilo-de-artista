import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconDown, IconLock, IconShield, IconTag, IconTruck } from "@/components/icons";
import { ProdutoCard } from "@/components/produto-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import { getProduto, type ApiProdutoResposta, type ApiVariant } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { HOME } from "@/lib/home";
import { computeDiscount, itemElegivel, money, precoPromo } from "@/lib/promo";

export const Route = createFileRoute("/produto/$handle")({
  loader: async ({ params }) => {
    try {
      return await getProduto({ data: params.handle });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => {
    const title = loaderData?.product?.title;
    return {
      meta: [
        { title: title ? `${title} — Estilo de Artista` : "Produto — Estilo de Artista" },
        {
          name: "description",
          content: title
            ? `${title}. 1 par R$ 99 · 2 pares R$ 149. Frete grátis.`
            : "Produto Estilo de Artista",
        },
      ],
    };
  },
  component: ProdutoPage,
});

function ProdutoPage() {
  const data = Route.useLoaderData() as ApiProdutoResposta;
  const navigate = Route.useNavigate();
  const cart = useCart();
  const p = data.product;
  const cores = data.cores?.cores || [];
  const modelo = data.cores?.modelo || "";
  const imgs = p.images?.length ? p.images : p.image ? [p.image] : [];
  const vs = p.variants || [];
  const first = vs.find((v) => v.available) || vs[0] || null;

  const [vid, setVid] = useState(first?.id || "");
  const [slide, setSlide] = useState(0);
  const [coresAbertas, setCoresAbertas] = useState(false);
  const trilhoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVid(first?.id || "");
    setSlide(0);
  }, [p.handle, first?.id]);

  const selected: ApiVariant | null = vs.find((v) => v.id === vid) || first;
  const temEstoque = vs.some((v) => v.available);
  const temDe =
    !!selected?.compareCents && selected.compareCents > selected.priceCents;
  const off = temDe
    ? Math.round((1 - selected!.priceCents / selected!.compareCents!) * 100)
    : null;

  const promo = precoPromo();
  const elegivel = selected
    ? itemElegivel({ priceCents: selected.priceCents, qty: 1, handle: p.handle })
    : false;
  const desc2 = elegivel
    ? computeDiscount([
        {
          priceCents: promo.unitCents,
          qty: promo.minQty,
          handle: p.handle,
        },
      ]).discountCents
    : 0;

  const corAtual = cores.find((c) => c.atual) || cores[0];
  const coresVisiveis = coresAbertas ? cores : cores.slice(0, 11);
  const eCalcado = vs.some((v) => /^\d+$/.test(v.option || ""));

  const related = useMemo(
    () =>
      (data.related || []).map((r) => ({
        id: r.id,
        title: r.title,
        handle: r.handle,
        image: r.image,
        variants: r.variants,
      })),
    [data.related],
  );

  const irSlide = (i: number) => {
    const el = trilhoRef.current;
    if (!el) return;
    const n = Math.max(0, Math.min(imgs.length - 1, i));
    setSlide(n);
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const el = trilhoRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setSlide(i);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [p.handle]);

  const addCart = () => {
    if (!selected?.available) {
      alert("Escolha a numeração.");
      return;
    }
    cart.add(selected.id, 1);
  };

  const colecaoHandle =
    data.cores?.key ||
    (p.tags?.[1] || p.tags?.[0] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "-") ||
    "mais-vendidos";

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap">
        <nav className="crumb">
          <Link to="/">Página inicial</Link> <i>›</i>{" "}
          <Link to="/colecao/$handle" params={{ handle: colecaoHandle }}>
            {modelo || p.vendor || "Catálogo"}
          </Link>{" "}
          <i>›</i> <b>{p.title}</b>
        </nav>

        <div className="pdp" data-vid={vid} id="pdpbox">
          <div className="pdp-palco">
            <div className="pdp-stage" id="pdpStage">
              <div className="pdp-trilho" id="pdpTrilho" ref={trilhoRef}>
                {imgs.length ? (
                  imgs.map((src, i) => (
                    <div className="pdp-slide" key={src}>
                      <img
                        src={src}
                        alt={p.title}
                        className="veio"
                        fetchPriority={i === 0 ? "high" : undefined}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </div>
                  ))
                ) : (
                  <div className="pdp-slide" />
                )}
              </div>
              {imgs.length > 1 && (
                <span className="pdp-conta">
                  {slide + 1}/{imgs.length}
                </span>
              )}
              {imgs.length > 0 && (
                <button
                  className="pdp-zoom"
                  type="button"
                  aria-label="Ampliar foto"
                  onClick={() => window.open(imgs[slide] || imgs[0], "_blank")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
                  </svg>
                </button>
              )}
            </div>
            {imgs.length > 1 && (
              <div className="pdp-thumbs">
                {imgs.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={`pdp-thumb${i === slide ? " on" : ""}`}
                    onClick={() => irSlide(i)}
                  >
                    <img loading="lazy" src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pdp-info">
            {(p.vendor || modelo) && (
              <p className="pdp-marca">
                {p.vendor}
                {modelo && modelo !== p.vendor ? ` · ${modelo}` : ""}
              </p>
            )}
            <h1>{p.title}</h1>
            <p className="pdp-meta">
              Cód. {String(p.id).replace(/\D/g, "").slice(-8) || p.handle} ·{" "}
              {temEstoque ? (
                <span className="stock">Disponível</span>
              ) : (
                <span className="out">Indisponível no momento</span>
              )}
            </p>

            {selected && (
              <>
                <div className="pdp-preco">
                  <b>{money(selected.priceCents)}</b>
                  {temDe && <s>{money(selected.compareCents!)}</s>}
                  {off != null && (
                    <span className="off">
                      <IconDown />
                      {off}%
                    </span>
                  )}
                </div>
                <p className="pdp-pix">
                  à vista no <b>PIX</b>
                  {temDe
                    ? ` · você economiza ${money(selected.compareCents! - selected.priceCents)}`
                    : ""}
                </p>
              </>
            )}

            {elegivel && desc2 > 0 && (
              <div className="pdp-promo">
                <IconTag />
                <div>
                  <b>
                    Leve {promo.minQty} pares por {money(promo.duplaCents)}
                  </b>
                  <span>
                    Economize {money(desc2)} · escolha o 2º par no carrinho
                  </span>
                </div>
              </div>
            )}

            {cores.length > 1 && (
              <>
                <p className="pdp-lbl">
                  Cor: <span id="corNome">{corAtual?.cor || ""}</span>
                </p>
                <div className="pdp-cores">
                  {coresVisiveis.map((c) => (
                    <button
                      key={c.handle}
                      type="button"
                      className={`pdp-cor${c.atual ? " on" : ""}`}
                      title={c.cor}
                      onClick={() => {
                        if (!c.atual) {
                          void navigate({
                            to: "/produto/$handle",
                            params: { handle: c.handle },
                          });
                        }
                      }}
                    >
                      <img loading="lazy" src={c.thumb} alt={c.cor} />
                      <i>{c.cor}</i>
                    </button>
                  ))}
                  {!coresAbertas && cores.length > 11 && (
                    <button
                      className="pdp-cores-mais"
                      type="button"
                      onClick={() => setCoresAbertas(true)}
                    >
                      Ver as {cores.length} cores
                    </button>
                  )}
                </div>
              </>
            )}

            {vs.length > 1 && (
              <>
                <p className="pdp-lbl">
                  <span style={{ fontWeight: 700, color: "#0b0a0f" }}>
                    Numeração: <b>{selected?.option || "—"}</b>
                  </span>
                  {eCalcado && (
                    <a href="#medidas" id="openMedidas">
                      Tabela de medidas
                    </a>
                  )}
                </p>
                <div className="sizes">
                  {vs.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`sz${vid === v.id ? " on" : ""}`}
                      disabled={!v.available}
                      onClick={() => setVid(v.id)}
                    >
                      {v.option || "Único"}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              className="buy"
              type="button"
              disabled={!selected?.available}
              onClick={addCart}
            >
              ADICIONAR AO CARRINHO
              <i className="sac-ar" aria-hidden="true">
                →
              </i>
            </button>

            <div className="pdp-trust">
              <div>
                <IconTruck /> Frete grátis para todo o Brasil
              </div>
              <div>
                <IconShield /> Pagamento via PIX · ambiente seguro
              </div>
              <div>
                <IconLock /> Troca ou devolução sem letra miúda
              </div>
            </div>
          </div>
        </div>

        {eCalcado && (
          <div className="pcard desc" id="medidas">
            <h2>Tabela de medidas</h2>
            <div className="medidas">
              <img
                src="/assets/tabela-medidas.png"
                width={900}
                height={900}
                loading="lazy"
                alt="Tabela de medidas: numeração com comprimento do pé em centímetros"
              />
              <div className="medidas-tx">
                <p>
                  Meça o pé <b>descalço</b>, do calcanhar à ponta do maior dedo, com o pé apoiado no
                  chão.
                </p>
                <p>
                  Compare com a coluna <b>comprimento do pé</b>. Na dúvida entre duas numerações,
                  escolha a <b>maior</b>.
                </p>
                <p className="medidas-zoom">Toque na tabela para ampliar.</p>
              </div>
            </div>
          </div>
        )}

        {related.length > 0 && (
          <section className="feat" style={{ paddingTop: 40 }}>
            <div className="feat-hd">
              <h2>Você também pode gostar</h2>
            </div>
            <div className="rowwrap">
              <div className="row">
                {related.map((r) => (
                  <ProdutoCard key={r.handle} produto={r} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
      <SiteFooter />
      <WhatsFloat />
    </div>
  );
}
