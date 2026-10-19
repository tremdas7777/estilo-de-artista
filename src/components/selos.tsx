import { IconLock, IconShield, IconTag, IconTruck } from "@/components/icons";
import { precoPromo } from "@/lib/promo";

/** Faixa de confiança logo abaixo do hero. */
export function Selos() {
  const promo = precoPromo();
  return (
    <section className="icons">
      <div className="ic">
        <div className="ic-i">
          <IconTag />
        </div>
        <div>
          <b>1 par R$ {promo.unit}</b>
          <span>
            {promo.minQty} pares R$ {promo.dupla}
          </span>
        </div>
      </div>
      <div className="ic">
        <div className="ic-i">
          <IconTruck />
        </div>
        <div>
          <b>Frete grátis</b>
          <span>Para todo o Brasil</span>
        </div>
      </div>
      <div className="ic">
        <div className="ic-i">
          <IconShield />
        </div>
        <div>
          <b>Você escolhe</b>
          <span>Modelo, cor e numeração</span>
        </div>
      </div>
      <div className="ic">
        <div className="ic-i">
          <IconLock />
        </div>
        <div>
          <b>Pagamento via PIX</b>
          <span>Ambiente seguro</span>
        </div>
      </div>
    </section>
  );
}
