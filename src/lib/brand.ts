/** Identidade da loja Estilo de Artista (checkout + admin + e-mails). */
export const brand = {
  name: "Estilo de Artista",
  nameShort: "Estilo de Artista",
  domain: "estilo-de-artista.vercel.app",
  email: "suporte@estilodeartista.com.br",
  whatsapp: "5547997229918",
  instagram: "https://www.instagram.com/estilo_de_artista_/",
  cnpj: "",
  logoPublic: "/assets/logo-estilo-de-artista.png",
  logoClaro: "/assets/logo-estilo-de-artista-fundo-claro.png",
  /** Cores do checkout — alinhadas à vitrine. */
  colors: {
    ink: "#070707",
    volt: "#d5e607",
    brand: "#f10769",
    brandDark: "#bc0552",
    soft: "#4b5563",
    line: "#e5e5e5",
    ok: "#1e9e4f",
    pix: "#32BCAD",
    footer: "#0b0a0f",
    field: "#fafafa",
  },
} as const;

export default brand;
