import { Link } from "@tanstack/react-router";
import { IconDown } from "@/components/icons";
import { firstPrice, money, offPercent, type HomeProduct } from "@/lib/home";

/** Card da vitrine — foto 3:4, selo ↓%, preço e “à vista no PIX”. */
export function ProdutoCard({ produto }: { produto: HomeProduct }) {
  const first = firstPrice(produto);
  const off = offPercent(produto);
  const temDe = first?.compareCents && first.compareCents > first.priceCents;

  return (
    <div className="prod">
      <Link
        to="/produto/$handle"
        params={{ handle: produto.handle }}
        className="ph"
        style={{ backgroundImage: `url(${produto.image})` }}
      >
        {off != null && (
          <span className="off">
            <IconDown />
            {off}%
          </span>
        )}
        <img src={produto.image} alt={produto.title} loading="lazy" decoding="async" />
      </Link>
      <Link to="/produto/$handle" params={{ handle: produto.handle }} className="ttl">
        <h3>{produto.title}</h3>
      </Link>
      <div className="price">
        {first ? money(first.priceCents) : null}
        {temDe ? <s>{money(first!.compareCents!)}</s> : null}
      </div>
      <div className="parc">
        à vista no <b>PIX</b>
      </div>
    </div>
  );
}
