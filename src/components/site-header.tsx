import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo-estilo-de-artista.png.asset.json";
import { TIPOS } from "@/lib/produtos";

/** Topo preto da loja com a logo oficial e as categorias. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-foreground/95 text-background backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="shrink-0" aria-label="Estilo de Artista — início">
          <img src={logoAsset.url} alt="Estilo de Artista" width={132} height={120} className="h-9 w-auto" />
        </Link>
        <nav aria-label="Categorias" className="scrollbar-none flex gap-1 overflow-x-auto text-sm">
          {TIPOS.map((tipo) => (
            <Link
              key={tipo}
              to="/"
              search={{ tipo, marca: undefined }}
              className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-volt"
              activeProps={{ className: "bg-volt text-foreground" }}
            >
              {tipo === "Tênis" ? "Tênis" : `${tipo}s`}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
