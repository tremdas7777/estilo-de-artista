import { createFileRoute, redirect } from "@tanstack/react-router";

/** Compatibilidade com pedidos antigos; ofertas pós-compra permanecem desativadas. */
export const Route = createFileRoute("/expresso/$id")({
  head: () => ({
    meta: [
      { title: "Envio do pedido — Estilo de Artista" },
      { name: "description", content: "Confirmação do envio do seu pedido Estilo de Artista." },
      { property: "og:title", content: "Envio do pedido — Estilo de Artista" },
      { property: "og:description", content: "Confirmação do envio do seu pedido Estilo de Artista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/obrigado/$id", params: { id: params.id }, replace: true });
  },
});