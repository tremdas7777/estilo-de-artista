import { Link } from "@tanstack/react-router";
import { IconDown } from "@/components/icons";
import { firstPrice, money, offPercent, type HomeProduct } from "@/lib/home";

/** Card da vitrine — foto 3:4, selo ↓%, preço e “à vista no PIX”. */
export function ProdutoCard({ produto }: { produto: HomeProduct }) {
  const first = firstPrice(produto);
  const off = offPercent(produto);
  const temDe = first?.compareCents && first.compareCents > first.priceCents;
  const handle = (produto.handle || "").trim();
  if (!handle) return null;

  return (
    <Link to="/produto/$handle" params={{ handle }} className="prod">
      <span className="ph" style={{ backgroundImage: `url(${produto.image})` }}>
        {off != null && (
          <span className="off">
            <IconDown />
            {off}%
          </span>
        )}
        <img src={produto.image} alt={produto.title} loading="lazy" decoding="async" />
      </span>
      <span className="ttl">
        <h3>{produto.title}</h3>
      </span>
      <span className="price">
        {first ? money(first.priceCents) : null}
        {temDe ? <s>{money(first!.compareCents!)}</s> : null}
      </span>
      <span className="parc">
        à vista no <b>PIX</b>
      </span>
    </Link>
  );
}
