import logoAsset from "@/assets/logo-estilo-de-artista.png.asset.json";
import { INSTAGRAM, WHATSAPP, linkWhats } from "@/lib/produtos";

const CONFIANCA = ["Garantia de 7 dias", "Compra segura", "Enviamos com código de rastreio"];

/** Rodapé preto: contato, confiança e a marca. */
export function SiteFooter() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-3">
        <div>
          <img src={logoAsset.url} alt="Estilo de Artista" width={180} height={163} className="h-12 w-auto" />
          <p className="mt-4 max-w-xs text-sm text-background/70">
            Mais que tênis é atitude. Sneakers e streetwear com preço de loja, direto para a sua rua.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-volt">Fale com a loja</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={linkWhats("Olá! Vim pelo site da loja e gostaria de mais informações.")}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-volt"
              >
                WhatsApp ({`(${WHATSAPP.slice(2, 4)}) ${WHATSAPP.slice(4, 9)}-${WHATSAPP.slice(9)}`})
              </a>
            </li>
            <li>
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="hover:text-volt">
                Instagram @estilo_de_artista_
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-volt">Compra tranquila</h3>
          <ul className="mt-4 space-y-2 text-sm text-background/80">
            {CONFIANCA.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>Envio para todo o Brasil</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-background/60">
        © 2026 Estilo de Artista · Todos os direitos reservados
      </div>
    </footer>
  );
}
