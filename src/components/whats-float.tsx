import { IconWhats } from "@/components/icons";
import { linkWhats } from "@/lib/produtos";

/** Botão flutuante do WhatsApp. */
export function WhatsFloat() {
  return (
    <a
      className="zap"
      href={linkWhats("Olá! Vim pelo site da Estilo de Artista.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
    >
      <IconWhats />
    </a>
  );
}
