import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsFloat } from "@/components/whats-float";
import { useCart } from "@/lib/cart";
import { HOME } from "@/lib/home";
import { money, PROMO } from "@/lib/promo";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [{ title: "Carrinho — Estilo de Artista" }] }),
  component: CarrinhoPage,
});

function CarrinhoPage() {
  const cart = useCart();

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap cartpg">
        <h1>Carrinho</h1>
        {cart.lines.length === 0 ? (
          <p className="muted">
            Seu carrinho está vazio.{" "}
            <Link to="/" style={{ textDecoration: "underline" }}>
              Voltar à loja
            </Link>
          </p>
        ) : (
          <div className="cartgrid">
            <div className="citems">
              {cart.lines.map((l) => (
                <div className="cline" key={l.id}>
                  <div className="cprod">
                    <img src={l.image} alt="" />
                    <div>
                      <Link to="/produto/$handle" params={{ handle: l.handle || l.productId }}>
                        <span className="nm">{l.title}</span>
                      </Link>
                      <div className="pr">
                        <b>{money(l.priceCents)}</b>
                      </div>
                    </div>
                  </div>
                  <div className="cqty">
                    <button type="button" onClick={() => cart.setQty(l.id, l.qty - 1)}>
                      −
                    </button>
                    <span>{l.qty}</span>
                    <button type="button" onClick={() => cart.setQty(l.id, l.qty + 1)}>
                      +
                    </button>
                    <button type="button" className="rm" onClick={() => cart.remove(l.id)}>
                      Remover
                    </button>
                  </div>
                  <div className="ctot">{money(l.priceCents * l.qty)}</div>
                </div>
              ))}
            </div>
            <aside className="csum">
              <h2>Resumo</h2>
              <div className="row">
                <span>Subtotal</span>
                <span>{money(cart.subtotalCents)}</span>
              </div>
              {cart.discountCents > 0 && (
                <div className="row desc">
                  <span>Desconto {PROMO.label}</span>
                  <span>−{money(cart.discountCents)}</span>
                </div>
              )}
              <div className="row total">
                <span>Total</span>
                <span>{money(cart.totalCents)}</span>
              </div>
              <p className="frete">Frete grátis · Pagamento via PIX</p>
              <Link to="/checkout" className="btn">
                Finalizar compra
              </Link>
              {!cart.promoApplies && cart.eligibleQty === 1 && (
                <p className="dica">
                  Adicione mais 1 par elegível e pague R$ 149 nos 2 — o desconto aplica sozinho.
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
      <SiteFooter />
      <WhatsFloat />
      <style>{`
        .cartpg h1{font-size:28px;font-weight:700;margin:10px 0 22px}
        .cartgrid{display:grid;gap:20px}
        @media(min-width:1000px){.cartgrid{grid-template-columns:1fr 340px;align-items:start}}
        .citems{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:0 18px}
        .cline{display:grid;gap:12px;padding:18px 0;border-bottom:1px solid #f2f1f5}
        .cline:last-child{border-bottom:none}
        @media(min-width:760px){.cline{grid-template-columns:1fr 140px 100px;align-items:center}}
        .cprod{display:flex;gap:14px;align-items:center}
        .cprod img{width:84px;height:84px;border-radius:10px;object-fit:cover;background:#f5f5f5}
        .cprod .nm{font-size:14.5px;font-weight:500;color:#0b0a0f}
        .cprod .pr b{font-size:15px}
        .cqty{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .cqty button{width:32px;height:32px;border:1px solid #e5e5e5;border-radius:8px;background:#fff;cursor:pointer}
        .cqty .rm{width:auto;border:none;text-decoration:underline;color:#8b8794}
        .ctot{font-weight:700;text-align:right}
        .csum{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:20px}
        .csum h2{margin:0 0 14px;font-size:18px}
        .csum .row{display:flex;justify-content:space-between;margin:8px 0;font-size:14px}
        .csum .desc{color:#1e9e4f;font-weight:600}
        .csum .total{font-size:18px;font-weight:800;margin-top:10px}
        .csum .frete{font-size:12.5px;color:#1e9e4f;margin:8px 0 16px}
        .csum .btn{display:block;text-align:center;background:#070707;color:#fff;padding:14px;border-radius:999px;font-weight:700}
        .csum .dica{font-size:13px;color:#bc0552;margin-top:12px;line-height:1.4}
      `}</style>
    </div>
  );
}
