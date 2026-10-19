import { useState } from "react";
import type { Produto } from "@/lib/produtos";
import { ProdutoCard } from "@/components/produto-card";

interface Props {
  produtos: Produto[];
  /** Filtro atual — quando muda, a paginação volta ao início (via key do pai). */
  filtro: string;
  totalGeral: number;
}

/** Grade do catálogo com paginação de 24 em 24 ("Mostrar mais"). */
export function Catalogo({ produtos, filtro, totalGeral }: Props) {
  const [limite, setLimite] = useState(24);
  const visiveis = produtos.slice(0, limite);

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {produtos.length === totalGeral
          ? `${produtos.length} produtos`
          : `${produtos.length} de ${totalGeral} produtos`}
      </p>
      {produtos.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Nada encontrado nessa combinação — tenta outra marca ou categoria.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((p) => (
            <ProdutoCard key={p.handle} produto={p} />
          ))}
        </div>
      )}
      {produtos.length > limite && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setLimite((l) => l + 24)}
            className="rounded-lg bg-foreground px-8 py-3 font-bold text-background transition-colors hover:bg-volt hover:text-foreground"
          >
            Mostrar mais ({produtos.length - limite})
          </button>
        </div>
      )}
    </div>
  );
}
