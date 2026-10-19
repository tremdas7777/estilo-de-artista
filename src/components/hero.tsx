import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { HERO_HANDLE, HERO_TITULO, LOJA_NOME, precoDupla } from "@/lib/home";

/** Hero preto com headline, oferta e par Tesla Coil Pro. */
export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const palco = palcoRef.current;
    if (!video || !palco) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      video.src = "/assets/hero-tesla-coil-pro-preto-refletivo.mp4";
      void video.play().then(() => {
        video.classList.add("on");
        palco.classList.add("filmando");
      }).catch(() => {
        /* foto permanece */
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
      },
      { threshold: 0.2 },
    );
    io.observe(palco);
    return () => io.disconnect();
  }, []);

  return (
    <section className="hero" id="hero">
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-luz" aria-hidden="true" />
      <div className="hero-in">
        <div className="hero-tx">
          <span className="hero-eyebrow">{LOJA_NOME}</span>
          <h1 className="hero-h1">
            <span>
              <i style={{ ["--i" as string]: 0 }}>Seu estilo.</i>
            </span>
            <span>
              <i style={{ ["--i" as string]: 1 }}>Suas regras.</i>
            </span>
          </h1>
        </div>

        <div className="hero-prod" id="heroProd">
          <div className="hero-palco" id="heroPalco" ref={palcoRef}>
            <picture>
              <source
                media="(min-width:900px)"
                srcSet="/assets/hero-tesla-coil-pro-preto-refletivo.webp"
              />
              <img
                src="/assets/hero-tesla-coil-pro-preto-refletivo-700.webp"
                width={1200}
                height={1200}
                fetchPriority="high"
                decoding="async"
                alt={`${HERO_TITULO} em foto de estúdio`}
              />
            </picture>
            <video
              ref={videoRef}
              className="hero-video"
              muted
              playsInline
              loop
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
            />
            <span className="hero-sombra" aria-hidden="true" />
          </div>
        </div>

        <p className="hero-of">
          <span className="n">
            2 pares por <b>R$&nbsp;{precoDupla()}</b>
          </span>
          <span className="f">Frete grátis</span>
        </p>

        <div className="hero-acao">
          <Link to="/colecao/$handle" params={{ handle: "mais-vendidos" }} className="hero-cta">
            ESCOLHER MEUS PARES
            <i className="sac-ar" aria-hidden="true">
              →
            </i>
          </Link>
          <Link to="/produto/$handle" params={{ handle: HERO_HANDLE }} className="hero-tag">
            Ver o {HERO_TITULO}
          </Link>
        </div>
      </div>
    </section>
  );
}
