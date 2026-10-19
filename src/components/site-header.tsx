import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { IconCart, IconSearch } from "@/components/icons";
import type { HomeMenuItem } from "@/lib/home";

interface Props {
  menu: HomeMenuItem[];
  /** Home: topo transparente sobre o hero. */
  overHero?: boolean;
}

/** Header sticky: Menu + logo dupla + busca + carrinho. */
export function SiteHeader({ menu, overHero = false }: Props) {
  const [solido, setSolido] = useState(!overHero);
  const [drawer, setDrawer] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    const medir = () => {
      const hdr = document.querySelector(".hdr");
      if (!hdr) return;
      const h = Math.round(hdr.getBoundingClientRect().height);
      if (h) document.documentElement.style.setProperty("--hdr-h", `${h}px`);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [buscaAberta]);

  useEffect(() => {
    if (!overHero) return;
    let raf = 0;
    const ver = () => {
      raf = 0;
      setSolido(window.scrollY > 28);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(ver);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    ver();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [overHero]);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = String(fd.get("q") || "").trim();
    void navigate({ to: "/", search: q ? { q } : {} });
    setBuscaAberta(false);
    setDrawer(false);
  };

  return (
    <>
      <header className={`hdr${overHero ? " hdr--hero" : ""}${solido ? " solido" : ""}`}>
        <button type="button" className="burger" aria-label="Menu" onClick={() => setDrawer(true)}>
          <span className="bars">
            <i />
            <i />
            <i />
          </span>
          <b>Menu</b>
        </button>

        <Link to="/" className="logo" aria-label="Estilo de Artista — início">
          <img
            className="marca-escura"
            src="/assets/logo-estilo-de-artista.png"
            alt="Estilo de Artista"
            height={84}
          />
          <img
            className="marca-clara"
            src="/assets/logo-estilo-de-artista-fundo-claro.png"
            alt=""
            height={84}
            aria-hidden="true"
          />
        </Link>

        <form
          className={`searchwrap${buscaAberta ? " on" : ""}`}
          onSubmit={onSearch}
          role="search"
        >
          <input
            name="q"
            className="search"
            type="search"
            placeholder="O que está buscando?"
            autoComplete="off"
            aria-label="Buscar"
          />
          <button className="sbtn" type="submit" aria-label="Buscar">
            <IconSearch />
          </button>
        </form>

        <div className="acts">
          <button
            type="button"
            className="ico"
            aria-label="Buscar"
            aria-expanded={buscaAberta}
            onClick={() => setBuscaAberta((v) => !v)}
          >
            <IconSearch />
          </button>
          <button type="button" className="ico bag" aria-label="Abrir o carrinho">
            <IconCart />
            <b>0</b>
            <span>Carrinho</span>
          </button>
        </div>
      </header>

      <div className={`drawer${drawer ? " on" : ""}`} id="drawer">
        <div className="drawer-in">
          <div className="drawer-hd">
            <span>Menu</span>
            <button type="button" aria-label="Fechar" onClick={() => setDrawer(false)}>
              &times;
            </button>
          </div>
          <div id="drawernav">
            {menu.map((item) =>
              item.children?.length ? (
                <div key={item.handle} className={`dn${abertos[item.handle] ? " open" : ""}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setAbertos((prev) => ({ ...prev, [item.handle]: !prev[item.handle] }))
                    }
                  >
                    {item.title} <span className="ar">›</span>
                  </button>
                  <div className="dsub">
                    <Link
                      to="/colecao/$handle"
                      params={{ handle: item.handle }}
                      onClick={() => setDrawer(false)}
                    >
                      Ver tudo
                    </Link>
                    {item.children.map((c) => (
                      <Link
                        key={c.handle}
                        to="/colecao/$handle"
                        params={{ handle: c.handle }}
                        onClick={() => setDrawer(false)}
                      >
                        {c.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={item.handle} className="dn">
                  <Link
                    to="/colecao/$handle"
                    params={{ handle: item.handle }}
                    onClick={() => setDrawer(false)}
                  >
                    {item.title}
                  </Link>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
      <div
        className={`scrim${drawer ? " on" : ""}`}
        id="scrim"
        onClick={() => setDrawer(false)}
        aria-hidden="true"
      />
    </>
  );
}
