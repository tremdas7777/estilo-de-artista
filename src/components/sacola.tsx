import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCombo, getComboModelo } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { money, precoPromo, PROMO } from "@/lib/promo";

/** Carrinho lateral — totais com a mesma promo da Vercel (2 pares). */
export function Sacola() {
  const cart = useCart();
  const promo = precoPromo();
  const [passo, setPasso] = useState<"cart" | "modelos" | "cores">("cart");
  const [modelos, setModelos] = useState<
    Array<{ key: string; title: string; marca: string; image: string; cores: number }>
  >([]);
  const [modeloKey, setModeloKey] = useState("");
  const [cores, setCores] = useState<
    Array<{
      handle: string;
      title: string;
      cor: string;
      image: string;
      variants: Array<{ id: string; option: string; available: boolean; priceCents: number }>;
    }>
  >([]);
  const [corIdx, setCorIdx] = useState(0);
  const [sizeId, setSizeId] = useState("");

  useEffect(() => {
    if (!cart.open) {
      setPasso("cart");
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cart.open]);

  const faltaSegundo =
    cart.eligibleQty > 0 && cart.eligibleQty < PROMO.minQty && !cart.promoApplies;

  const abrirSegundo = async () => {
    setPasso("modelos");
    try {
      const d = await getCombo();
      setModelos(d.modelos || []);
    } catch (e) {
      console.error(e);
    }
  };

  const escolherModelo = async (key: string) => {
    setModeloKey(key);
    setPasso("cores");
    try {
      const d = await getComboModelo({ data: { key } });
      setCores(d.cores || []);
      setCorIdx(0);
      const first = d.cores?.[0]?.variants?.find((v) => v.available) || d.cores?.[0]?.variants?.[0];
      setSizeId(first?.id || "");
    } catch (e) {
      console.error(e);
    }
  };

  const addSegundo = () => {
    if (!sizeId) return;
    cart.add(sizeId, 1);
    setPasso("cart");
  };

  const corAtual = cores[corIdx];

  return (
    <>
      <div
        className={`sac-scrim${cart.open ? " on" : ""}`}
        onClick={() => cart.setOpen(false)}
        aria-hidden={!cart.open}
      />
      <aside
        className={`sac${cart.open ? " on" : ""}`}
        id="sacDrawer"
        role="dialog"
        aria-modal="true"
        aria-label="Seu carrinho"
        aria-hidden={!cart.open}
      >
        <div className="sac-hd">
          <h2>Seu carrinho</h2>
          <span className="n" hidden={!cart.count}>
            {cart.count}
          </span>
          <button
            className="sac-x"
            type="button"
            aria-label="Fechar o carrinho"
            onClick={() => cart.setOpen(false)}
          >
            &times;
          </button>
        </div>

        {passo === "cart" ? (
          <>
            <div className="sac-body">
              {cart.lines.length === 0 ? (
                <div className="sac-vazio">
                  <p>
                    <b>Carrinho vazio</b>
                  </p>
                  <p>Escolha um par e volte aqui.</p>
                  <button type="button" className="sac-cta" onClick={() => cart.setOpen(false)}>
                    Continuar comprando
                  </button>
                </div>
              ) : (
                <ul className="sac-lista">
                  {cart.lines.map((l) => (
                    <li key={l.id} className="sac-linha">
                      <img src={l.image} alt="" width={72} height={72} />
                      <div className="sac-info">
                        <b>{l.title}</b>
                        {(l.modelo || l.cor) && (
                          <i>
                            {[l.modelo, l.cor].filter(Boolean).join(" · ")}
                          </i>
                        )}
                        <div className="sac-preco">{money(l.priceCents)}</div>
                        <div className="sac-qtd">
                          <button type="button" onClick={() => cart.setQty(l.id, l.qty - 1)}>
                            −
                          </button>
                          <span>{l.qty}</span>
                          <button type="button" onClick={() => cart.setQty(l.id, l.qty + 1)}>
                            +
                          </button>
                          <button type="button" className="sac-rm" onClick={() => cart.remove(l.id)}>
                            Remover
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {faltaSegundo && (
                <div className="sac-of">
                  <b>Leve {promo.minQty} pares por R$ {promo.dupla}</b>
                  <span>Economize R$ {promo.economia} — escolha o 2º par agora</span>
                  <button type="button" onClick={() => void abrirSegundo()}>
                    Escolher 2º par
                  </button>
                </div>
              )}

              {cart.promoApplies && (
                <div className="sac-of on">
                  <b>Promo {PROMO.label} aplicada</b>
                  <span>Você economiza {money(cart.discountCents)}</span>
                </div>
              )}
            </div>

            {cart.lines.length > 0 && (
              <div className="sac-ft">
                <div className="sac-totais">
                  <div>
                    <span>Subtotal</span>
                    <span>{money(cart.subtotalCents)}</span>
                  </div>
                  {cart.discountCents > 0 && (
                    <div className="desc">
                      <span>Desconto {PROMO.label}</span>
                      <span>−{money(cart.discountCents)}</span>
                    </div>
                  )}
                  <div className="total">
                    <span>Total</span>
                    <span>{money(cart.totalCents)}</span>
                  </div>
                  <p className="frete">Frete grátis para todo o Brasil</p>
                </div>
                <Link
                  to="/checkout"
                  className="sac-cta"
                  onClick={() => cart.setOpen(false)}
                >
                  Finalizar compra
                </Link>
                <Link to="/carrinho" className="sac-link" onClick={() => cart.setOpen(false)}>
                  Ver carrinho
                </Link>
              </div>
            )}
          </>
        ) : null}

        {passo !== "cart" && (
          <div className="sac-sel on">
            <div className="sac-sel-hd">
              <button type="button" onClick={() => setPasso(passo === "cores" ? "modelos" : "cart")}>
                ←
              </button>
              <div className="tt">
                <b>{passo === "modelos" ? "Escolha o modelo" : corAtual?.title || "Escolha a cor"}</b>
                <i>
                  {passo === "modelos"
                    ? `2º par · leve por R$ ${promo.dupla}`
                    : "Escolha cor e numeração"}
                </i>
              </div>
            </div>
            <div className="sac-sel-body">
              {passo === "modelos" && (
                <div className="sac-modelos">
                  {modelos.map((m) => (
                    <button key={m.key} type="button" onClick={() => void escolherModelo(m.key)}>
                      <img src={m.image} alt="" />
                      <span>
                        <b>{m.title}</b>
                        <i>
                          {m.marca} · {m.cores} cores
                        </i>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {passo === "cores" && corAtual && (
                <div className="sac-cor-passo">
                  <div className="sac-cores-row">
                    {cores.map((c, i) => (
                      <button
                        key={c.handle}
                        type="button"
                        className={i === corIdx ? "on" : undefined}
                        onClick={() => {
                          setCorIdx(i);
                          const first =
                            c.variants.find((v) => v.available) || c.variants[0];
                          setSizeId(first?.id || "");
                        }}
                      >
                        <img src={c.image} alt={c.cor} />
                        <i>{c.cor}</i>
                      </button>
                    ))}
                  </div>
                  <p className="sac-sz-lbl">Numeração</p>
                  <div className="sizes">
                    {corAtual.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`sz${sizeId === v.id ? " on" : ""}`}
                        disabled={!v.available}
                        onClick={() => setSizeId(v.id)}
                      >
                        {v.option}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="sac-cta" disabled={!sizeId} onClick={addSegundo}>
                    Adicionar 2º par
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <style>{`
        .sac-scrim{position:fixed;inset:0;background:rgba(11,10,15,.45);z-index:90;opacity:0;visibility:hidden;transition:.22s}
        .sac-scrim.on{opacity:1;visibility:visible}
        .sac{position:fixed;top:0;right:0;bottom:0;width:min(100vw,420px);background:#fff;z-index:95;
          transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1);display:flex;flex-direction:column;
          box-shadow:-18px 0 40px -24px rgba(11,10,15,.5);color:#0b0a0f}
        .sac.on{transform:none}
        .sac-hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eeecf2}
        .sac-hd h2{margin:0;font-size:18px;font-weight:700;flex:1}
        .sac-hd .n{background:#0b0a0f;color:#fff;min-width:22px;height:22px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:800}
        .sac-x{background:none;border:none;font-size:28px;cursor:pointer;line-height:1;color:#0b0a0f}
        .sac-body{flex:1;overflow:auto;padding:14px 16px}
        .sac-vazio{text-align:center;padding:40px 10px;color:#6e6a78}
        .sac-vazio b{display:block;color:#0b0a0f;font-size:18px;margin-bottom:6px}
        .sac-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
        .sac-linha{display:flex;gap:12px}
        .sac-linha img{width:72px;height:72px;object-fit:cover;border-radius:10px;background:#f5f5f5;flex:none}
        .sac-info{min-width:0;flex:1}
        .sac-info b{display:block;font-size:14px;font-weight:600;line-height:1.3}
        .sac-info i{display:block;font-style:normal;font-size:12px;color:#8b8794;margin-top:2px}
        .sac-preco{font-weight:700;margin-top:4px;font-size:14px}
        .sac-qtd{display:flex;align-items:center;gap:8px;margin-top:8px}
        .sac-qtd button{width:28px;height:28px;border:1px solid #e5e5e5;border-radius:8px;background:#fff;cursor:pointer}
        .sac-rm{width:auto!important;border:none!important;color:#8b8794;font-size:12px;text-decoration:underline}
        .sac-of{margin-top:16px;padding:14px;border-radius:14px;border:1.5px solid #f10769;background:#fee6f0}
        .sac-of.on{border-color:#1e9e4f;background:#eefaf2}
        .sac-of b{display:block;font-size:14px}
        .sac-of span{display:block;font-size:12.5px;color:#bc0552;margin:4px 0 10px}
        .sac-of.on span{color:#188542}
        .sac-of button,.sac-cta{display:block;width:100%;padding:14px 18px;border:none;border-radius:999px;background:#070707;color:#fff;
          font-weight:700;font-size:14px;cursor:pointer;text-align:center;text-decoration:none}
        .sac-of button{margin-top:4px}
        .sac-ft{border-top:1px solid #eeecf2;padding:14px 16px 18px}
        .sac-totais{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:14px}
        .sac-totais>div{display:flex;justify-content:space-between}
        .sac-totais .desc{color:#1e9e4f;font-weight:600}
        .sac-totais .total{font-size:17px;font-weight:800;margin-top:4px}
        .sac-totais .frete{margin:4px 0 0;font-size:12px;color:#1e9e4f}
        .sac-link{display:block;text-align:center;margin-top:10px;font-size:13px;color:#6e6a78}
        .sac-sel{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;z-index:2}
        .sac-sel-hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #eeecf2}
        .sac-sel-hd button{border:none;background:none;font-size:20px;cursor:pointer}
        .sac-sel-hd .tt b{display:block;font-size:15px}
        .sac-sel-hd .tt i{display:block;font-style:normal;font-size:12px;color:#8b8794}
        .sac-sel-body{flex:1;overflow:auto;padding:14px}
        .sac-modelos{display:flex;flex-direction:column;gap:8px}
        .sac-modelos button{display:flex;gap:12px;align-items:center;padding:10px;border:1px solid #eeecf2;border-radius:12px;background:#fff;cursor:pointer;text-align:left}
        .sac-modelos img{width:56px;height:56px;object-fit:cover;border-radius:8px;background:#f5f5f5}
        .sac-modelos b{display:block;font-size:14px}
        .sac-modelos i{display:block;font-style:normal;font-size:12px;color:#8b8794}
        .sac-cores-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;margin-bottom:14px}
        .sac-cores-row button{border:2px solid #e5e5e5;border-radius:10px;padding:4px;background:#fff;cursor:pointer}
        .sac-cores-row button.on{border-color:#0b0a0f}
        .sac-cores-row img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
        .sac-cores-row i{display:block;font-style:normal;font-size:10px;text-align:center;margin-top:2px}
        .sac-sz-lbl{font-size:13px;font-weight:700;margin:0 0 8px}
        .sac-cor-passo .sizes{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
        .sac-cor-passo .sz{min-width:44px;height:40px;border:1.5px solid #e5e5e5;border-radius:10px;background:#fff;cursor:pointer;font-weight:600}
        .sac-cor-passo .sz.on{border-color:#0b0a0f;background:#0b0a0f;color:#fff}
        .sac-cor-passo .sz:disabled{opacity:.35}
      `}</style>
    </>
  );
}
