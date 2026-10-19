import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { criarPedido } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { HOME } from "@/lib/home";
import { money, PROMO } from "@/lib/promo";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Estilo de Artista" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [pix, setPix] = useState<{
    orderId: string;
    totalCents: number;
    pix: string;
    qrDataUrl: string;
  } | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro("");
    if (!cart.lines.length) {
      setErro("Carrinho vazio.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    // Campos no formato do POST /api/orders da loja oficial.
    const customer = {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      cpf: String(fd.get("cpf") || "").trim(),
      cep: String(fd.get("cep") || "").trim(),
      street: String(fd.get("street") || "").trim(),
      number: String(fd.get("number") || "").trim(),
      complement: String(fd.get("complement") || "").trim(),
      neighborhood: String(fd.get("neighborhood") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim().toUpperCase(),
    };
    setLoading(true);
    try {
      const res = await criarPedido({
        data: {
          items: cart.itemsForOrder(),
          customer,
          shippingId: "gratis",
        },
      });
      if (!res.orderId || !res.pix || !res.qrDataUrl) {
        throw new Error(res.error || "Resposta incompleta do PIX.");
      }
      setPix({
        orderId: res.orderId,
        totalCents: res.totalCents || cart.totalCents,
        pix: res.pix,
        qrDataUrl: res.qrDataUrl,
      });
      cart.clear();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao gerar PIX.");
    } finally {
      setLoading(false);
    }
  };

  if (pix) {
    return (
      <div className="loja">
        <SiteHeader menu={HOME.menu} />
        <div className="wrap ck">
          <h1>Pague com PIX</h1>
          <p className="muted">Pedido {pix.orderId}</p>
          <p className="total">{money(pix.totalCents)}</p>
          <img className="qr" src={pix.qrDataUrl} alt="QR Code PIX" width={280} height={280} />
          <label>
            Copia e cola
            <textarea readOnly value={pix.pix} rows={4} onFocus={(e) => e.target.select()} />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => void navigator.clipboard.writeText(pix.pix)}
          >
            Copiar código PIX
          </button>
          <Link to="/" className="back">
            Voltar à loja
          </Link>
        </div>
        <SiteFooter />
        <CkStyle />
      </div>
    );
  }

  if (!cart.lines.length) {
    return (
      <div className="loja">
        <SiteHeader menu={HOME.menu} />
        <div className="wrap ck">
          <h1>Checkout</h1>
          <p className="muted">Carrinho vazio.</p>
          <button type="button" className="btn" onClick={() => void navigate({ to: "/" })}>
            Ir à loja
          </button>
        </div>
        <SiteFooter />
        <CkStyle />
      </div>
    );
  }

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <div className="wrap ck">
        <h1>Checkout</h1>
        <div className="ckgrid">
          <form onSubmit={(e) => void onSubmit(e)} className="ckform">
            <h2>Seus dados</h2>
            <label>
              Nome completo
              <input name="name" required autoComplete="name" />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              WhatsApp
              <input name="phone" required autoComplete="tel" placeholder="11999999999" />
            </label>
            <label>
              CPF
              <input name="cpf" required inputMode="numeric" placeholder="00000000000" />
            </label>
            <h2>Entrega</h2>
            <label>
              CEP
              <input name="cep" required inputMode="numeric" autoComplete="postal-code" />
            </label>
            <label>
              Endereço
              <input name="street" required autoComplete="street-address" />
            </label>
            <div className="duo">
              <label>
                Número
                <input name="number" required />
              </label>
              <label>
                Complemento
                <input name="complement" />
              </label>
            </div>
            <label>
              Bairro
              <input name="neighborhood" required />
            </label>
            <div className="duo">
              <label>
                Cidade
                <input name="city" required autoComplete="address-level2" />
              </label>
              <label>
                UF
                <input name="state" required maxLength={2} autoComplete="address-level1" />
              </label>
            </div>
            {erro && <p className="erro">{erro}</p>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Gerando PIX…" : `Pagar ${money(cart.totalCents)} via PIX`}
            </button>
          </form>
          <aside className="cksum">
            <h2>Pedido</h2>
            {cart.lines.map((l) => (
              <div key={l.id} className="item">
                <img src={l.image} alt="" />
                <div>
                  <b>
                    {l.qty}× {l.title}
                  </b>
                  <span>{money(l.priceCents * l.qty)}</span>
                </div>
              </div>
            ))}
            <div className="row">
              <span>Subtotal</span>
              <span>{money(cart.subtotalCents)}</span>
            </div>
            {cart.discountCents > 0 && (
              <div className="row desc">
                <span>{PROMO.label}</span>
                <span>−{money(cart.discountCents)}</span>
              </div>
            )}
            <div className="row">
              <span>Frete</span>
              <span>Grátis</span>
            </div>
            <div className="row total">
              <span>Total</span>
              <span>{money(cart.totalCents)}</span>
            </div>
          </aside>
        </div>
      </div>
      <SiteFooter />
      <CkStyle />
    </div>
  );
}

function CkStyle() {
  return (
    <style>{`
      .ck h1{font-size:28px;font-weight:700;margin:8px 0 6px}
      .ck .total{font-size:28px;font-weight:800;margin:8px 0 18px}
      .ck .qr{display:block;margin:0 auto 16px;border-radius:12px;border:1px solid #eeecf2}
      .ck textarea{width:100%;font-size:12px;padding:10px;border-radius:10px;border:1px solid #e5e5e5;margin:6px 0 12px}
      .ckgrid{display:grid;gap:22px}
      @media(min-width:960px){.ckgrid{grid-template-columns:1.2fr .8fr}}
      .ckform,.cksum{background:#fff;border:1px solid #eeecf2;border-radius:16px;padding:20px}
      .ckform h2,.cksum h2{margin:0 0 14px;font-size:17px}
      .ckform label{display:block;font-size:13px;font-weight:600;margin:0 0 12px}
      .ckform input{display:block;width:100%;margin-top:6px;height:48px;padding:0 12px;border:1.5px solid #e5e5e5;border-radius:12px;font:inherit}
      .ckform .duo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .ckform .erro{color:#c2334d;font-size:14px;margin:0 0 10px}
      .ck .btn{display:block;width:100%;padding:15px;border:none;border-radius:999px;background:#070707;color:#fff;font-weight:700;cursor:pointer;text-align:center;text-decoration:none}
      .ck .btn:disabled{opacity:.5}
      .ck .back{display:block;text-align:center;margin-top:14px;color:#6e6a78}
      .cksum .item{display:flex;gap:10px;margin-bottom:12px}
      .cksum img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:#f5f5f5}
      .cksum .item b{display:block;font-size:13px;font-weight:600}
      .cksum .item span{font-size:13px;color:#6e6a78}
      .cksum .row{display:flex;justify-content:space-between;margin:8px 0;font-size:14px}
      .cksum .desc{color:#1e9e4f;font-weight:600}
      .cksum .total{font-weight:800;font-size:17px;margin-top:10px}
    `}</style>
  );
}
