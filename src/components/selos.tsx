import { IconLock, IconShield, IconTag, IconTruck } from "@/components/icons";
import { precoDupla, precoPar } from "@/lib/home";

/** Faixa de confiança logo abaixo do hero. */
export function Selos() {
  return (
    <section className="icons">
      <div className="ic">
        <div className="ic-i">
          <IconTag />
        </div>
        <div>
          <b>1 par R$ {precoPar()}</b>
          <span>2 pares R$ {precoDupla()}</span>
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
