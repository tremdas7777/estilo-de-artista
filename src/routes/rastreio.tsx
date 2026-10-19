import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { HOME } from "@/lib/home";
import { brand } from "@/lib/brand";
import { trackByCpf, type RastreioStatus } from "@/lib/rastreio.functions";

export const Route = createFileRoute("/rastreio")({
  head: () => ({
    meta: [
      { title: `Rastrear Pedido | ${brand.name}` },
      {
        name: "description",
        content: `Acompanhe a entrega do seu pedido ${brand.name} pelo CPF do titular.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function formatCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

const STEPS: { key: RastreioStatus; title: string; sub: string }[] = [
  { key: "pedido_recebido", title: "Pedido recebido", sub: "Processando no centro" },
  { key: "postado", title: "Postado", sub: "Despachado pela transportadora" },
  { key: "em_transito", title: "Em trânsito", sub: "A caminho da sua cidade" },
  { key: "saiu_entrega", title: "Saiu para entrega", sub: "Com o entregador" },
  { key: "entregue", title: "Entregue", sub: "Pedido finalizado" },
];

function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} dias`;
}

function Page() {
  const [cpf, setCpf] = useState("");
  const trackFn = useServerFn(trackByCpf);
  const mutation = useMutation({
    mutationFn: (cpfValue: string) => trackFn({ data: { cpf: cpfValue } }),
  });

  const result = mutation.data;
  const currentIdx = result ? STEPS.findIndex((s) => s.key === result.status) : -1;

  return (
    <div className="loja">
      <SiteHeader menu={HOME.menu} />
      <section className="wrap" style={{ padding: "48px 16px 80px", maxWidth: 640, margin: "0 auto" }}>
        <p className="muted" style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Rastreio
        </p>
        <h1 style={{ fontSize: 32, margin: "8px 0 12px" }}>Acompanhe o seu pedido</h1>
        <p className="muted">Informe o CPF do titular do pedido para consultar o status da entrega.</p>

        <form
          style={{ marginTop: 28, display: "flex", gap: 12, alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(cpf);
          }}
        >
          <input
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            style={{
              flex: 1,
              height: 48,
              border: "1.5px solid var(--line)",
              borderRadius: 12,
              padding: "0 14px",
              font: "inherit",
            }}
          />
          <button type="submit" className="btn" disabled={mutation.isPending} style={{ width: "auto", padding: "0 20px" }}>
            {mutation.isPending ? "Buscando..." : "Rastrear"}
          </button>
        </form>

        {mutation.isError && (
          <p role="alert" style={{ marginTop: 16, color: "#c2334d", fontSize: 14 }}>
            {(mutation.error as Error).message}
          </p>
        )}

        {result && (
          <div style={{ marginTop: 40 }}>
            <p className="muted" style={{ fontSize: 12 }}>
              Pedido {result.pedido}
            </p>
            <h2 style={{ fontSize: 22, margin: "8px 0" }}>
              {STEPS[currentIdx]?.title ?? "Pedido recebido"}
            </h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 24 }}>
              Atualizado {formatRelative(result.data_atualizacao)}
            </p>
            {result.tracking_code && (
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "#fafafa",
                }}
              >
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Código de rastreio
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "8px 0" }}>{result.tracking_code}</div>
                {result.tracking_url && (
                  <a href={result.tracking_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", fontWeight: 600, fontSize: 13 }}>
                    Acompanhar na transportadora →
                  </a>
                )}
              </div>
            )}
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {STEPS.map((step, i) => {
                const done = i <= currentIdx;
                return (
                  <li
                    key={step.key}
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      padding: 16,
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      opacity: done ? 1 : 0.45,
                    }}
                  >
                    <span style={{ fontWeight: 800, color: done ? "var(--brand)" : "inherit" }}>0{i + 1}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{step.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{done ? step.sub : "Aguardando"}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}
