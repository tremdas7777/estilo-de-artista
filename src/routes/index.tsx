import { createFileRoute } from "@tanstack/react-router";
import atelie from "@/assets/atelie.jpg";
import obra1 from "@/assets/obra-1.jpg";
import obra2 from "@/assets/obra-2.jpg";
import obra3 from "@/assets/obra-3.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ateliê Luz — Obras originais e prints de artista" },
      { name: "description", content: "Pinturas originais e prints assinados, feitos à mão no ateliê. Peças únicas para a sua parede." },
      { property: "og:title", content: "Ateliê Luz — Obras originais e prints" },
      { property: "og:description", content: "Pinturas originais e prints assinados, feitos à mão no ateliê." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface Obra {
  id: string;
  titulo: string;
  tecnica: string;
  medida: string;
  preco: string;
  img: string;
  vendida?: boolean;
}

const OBRAS: Obra[] = [
  { id: "1", titulo: "Terra Quente", tecnica: "Óleo sobre tela", medida: "80 × 100 cm", preco: "R$ 4.800", img: obra1 },
  { id: "2", titulo: "Folhas de Outono", tecnica: "Aquarela · print assinado", medida: "40 × 50 cm", preco: "R$ 380", img: obra2 },
  { id: "3", titulo: "Mulher e Mar", tecnica: "Óleo sobre tela", medida: "60 × 75 cm", preco: "R$ 3.900", img: obra3, vendida: true },
];

// Número fictício — substituir pelo WhatsApp real do artista.
const WHATSAPP = "5571999999999";
const linkWhats = (o: Obra) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Olá! Tenho interesse na obra "${o.titulo}" (${o.preco}).`)}`;

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl italic">Ateliê Luz</span>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <a href="#obras" className="hover:text-foreground">Obras</a>
          <a href="#sobre" className="hover:text-foreground">Sobre</a>
          <a href="#contato" className="hover:text-foreground">Contato</a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-8 md:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-primary">Obras originais · feitas à mão</p>
          <h1 className="text-5xl font-light leading-[1.05] md:text-7xl">
            Cor, textura e <em className="text-primary">silêncio</em> para a sua parede.
          </h1>
          <a href="#obras" className="mt-8 inline-block border-b-2 border-primary pb-1 font-medium">
            Ver coleção →
          </a>
        </div>
        <img src={atelie} alt="Ateliê com telas e pincéis sob luz natural" width={1600} height={1008} className="aspect-[4/3] w-full object-cover" />
      </section>

      <section id="obras" className="bg-card py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 flex items-end justify-between">
            <h2 className="text-4xl font-light">Coleção</h2>
            <span className="text-sm text-muted-foreground">{OBRAS.length} obras</span>
          </div>
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
            {OBRAS.map((o) => (
              <article key={o.id} className="group">
                <div className="overflow-hidden bg-muted p-6">
                  <img src={o.img} alt={o.titulo} width={768} height={960} loading="lazy"
                    className="aspect-[4/5] w-full object-cover shadow-lg transition-transform duration-500 group-hover:scale-[1.03]" />
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl">{o.titulo}</h3>
                    <p className="text-sm text-muted-foreground">{o.tecnica} · {o.medida}</p>
                  </div>
                  <p className="whitespace-nowrap font-medium">{o.vendida ? "Vendida" : o.preco}</p>
                </div>
                {!o.vendida && (
                  <a href={linkWhats(o)} target="_blank" rel="noopener noreferrer"
                    className="mt-4 block bg-primary py-3 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                    Quero esta obra
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="sobre" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-4xl font-light">Sobre a artista</h2>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Cada peça nasce devagar, entre camadas de tinta e luz da manhã. Trabalho com óleo e aquarela,
          buscando a memória das cores da terra e do mar. Todas as obras acompanham certificado de autenticidade.
        </p>
      </section>

      <footer id="contato" className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <span className="font-display text-lg italic text-foreground">Ateliê Luz</span>
          <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">Fale pelo WhatsApp</a>
          <span>© 2026 · Envio para todo o Brasil</span>
        </div>
      </footer>
    </div>
  );
}
