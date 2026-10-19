import { INSTAGRAM, WHATSAPP, linkWhats } from "@/lib/produtos";

function zapFormatado(num: string): string {
  // 5547997229918 → (47) 99722-9918
  if (num.length < 12) return num;
  return `(${num.slice(2, 4)}) ${num.slice(4, 9)}-${num.slice(9)}`;
}

/** Rodapé preto com gbar, atendimento e PIX. */
export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="gbar" />
      <div className="foot-in">
        <img
          className="foot-logo"
          src="/assets/logo-estilo-de-artista.png"
          alt="Estilo de Artista"
          height={96}
        />
        <div className="foot-col">
          <h4>ATENDIMENTO AO CLIENTE</h4>
          <p>
            WhatsApp: <b>{zapFormatado(WHATSAPP)}</b>
          </p>
          <p>
            Instagram:{" "}
            <a className="foot-insta" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
              @estilo_de_artista_
            </a>
          </p>
          <p>
            <a
              className="foot-insta"
              href={linkWhats("Olá! Vim pelo site da loja e gostaria de mais informações.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar no WhatsApp
            </a>
          </p>
        </div>
        <div className="foot-col">
          <h4>FORMAS DE PAGAMENTO</h4>
          <p className="pix">PIX</p>
        </div>
      </div>
      <div className="foot-bt">© Estilo de Artista · Todos os direitos reservados</div>
    </footer>
  );
}
