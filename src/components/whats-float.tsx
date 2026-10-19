import { linkWhats } from "@/lib/produtos";

/** Botão flutuante de WhatsApp, igual ao do checkout original. */
export function WhatsFloat() {
  return (
    <a
      href={linkWhats("Olá! Vim pelo site da loja e gostaria de mais informações.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a loja no WhatsApp"
      className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-7" aria-hidden="true">
        <path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.2L2 22l4.9-1.6A9.9 9.9 0 1 0 12.04 2Zm5.8 14c-.24.68-1.4 1.3-1.93 1.35-.53.06-1.03.26-2.9-.6-2.27-1.06-3.7-3.44-3.81-3.6-.11-.17-.9-1.26-.86-2.4.04-1.13.63-1.67.85-1.9.22-.23.48-.28.64-.28h.46c.15 0 .35-.06.54.42.2.5.68 1.75.74 1.87.06.13.1.28.01.45-.09.17-.5.72-.68.95-.11.14-.25.28-.08.57.17.28.75 1.26 1.6 2.03.98.88 1.68 1.13 1.94 1.25.26.11.4.09.55-.06.17-.17.6-.72.77-.96.17-.25.34-.2.57-.11.23.08 1.45.72 1.7.85.25.13.42.2.48.3.06.12.06.66-.18 1.32Z" />
      </svg>
    </a>
  );
}
