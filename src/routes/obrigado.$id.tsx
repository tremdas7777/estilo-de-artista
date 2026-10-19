import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Mail, PackageCheck, Truck } from "lucide-react";
import { loadPixSession, type PixSession } from "@/lib/pix-session";
import { brl } from "@/components/checkout/parts";
import { Pill, Shell } from "@/components/checkout/OrderShell";

export const Route = createFileRoute("/obrigado/$id")({
  head: () => ({
    meta: [{ title: "Pedido confirmado | Estilo de Artista" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

/** Página de obrigado — no fim do pós-compra (ofertas e envio expresso), comprando algo ou não. */
function Page() {
  const { id } = Route.useParams();
  // Lido só no navegador (sessionStorage) para não divergir da renderização do servidor.
  const [sessions, setSessions] = useState<{ main: PixSession | null; extras: PixSession[] }>({
    main: null,
    extras: [],
  });

  useEffect(() => {
    const s = loadPixSession(id);
    const main = s?.isUpsell ? (s.parentId ? loadPixSession(s.parentId) : null) : s;
    // Compras do pós-compra já pagas: ofertas (kit/seguro) e envio expresso.
    const extras = main
      ? [main.upsellId, main.expressId]
          .map((x) => (x ? loadPixSession(x) : null))
          .filter((x): x is PixSession => !!x)
      : s?.isUpsell
        ? [s]
        : [];
    setSessions({ main, extras });
  }, [id]);

  const { main, extras } = sessions;
  const extra = extras.length > 0;
  const email = main?.email ?? extras[0]?.email;

  return (
    <Shell>
      <div className="mx-auto max-w-[560px] px-4 pb-20 text-center">
        <div className="mt-2">
          <Pill variant="approved" />
        </div>
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ck-ok)] text-white">
          <Check className="h-9 w-9" />
        </div>
        <h1 className="mt-5 text-[28px] font-bold tracking-tight">
          {extra ? "Compra adicional confirmada!" : "Pedido confirmado!"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {extra
            ? "Obrigado pela confiança! Sua compra adicional foi incluída no seu pedido."
            : "Obrigado pela compra! Seu pedido já está sendo preparado."}
          {email && (
            <>
              {" "}
              Os detalhes foram enviados para <b className="text-foreground">{email}</b>.
            </>
          )}
        </p>

        {(main || extra) && (
          <div className="mt-8 rounded-lg border border-border bg-white p-6 text-left">
            <h2 className="mb-4 text-[15px] font-semibold">Resumo da compra</h2>
            <div className="space-y-4 text-[13px]">
              {main && (
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {main.bundleName} — Monitoramento Contínuo de Glicose
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {main.months} {main.months > 1 ? "Meses" : "Mês"} · {main.sensors} Sensores
                    </p>
                    {(main.bumps ?? (main.bump ? [main.bump] : [])).map((b) => (
                      <p key={b.name} className="mt-0.5 text-muted-foreground">
                        + {b.name}
                      </p>
                    ))}
                  </div>
                  <span className="shrink-0">{brl(main.amount / 100)}</span>
                </div>
              )}
              {extras.map((x) => (
                <div key={x.id} className="flex justify-between gap-3 border-t border-border pt-4">
                  <div>
                    <p className="font-medium">{x.bundleName}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {x.sensors > 0
                        ? `${x.sensors} Sensores · enviado junto`
                        : "Incluído no seu pedido"}
                    </p>
                  </div>
                  <span className="shrink-0">{brl(x.amount / 100)}</span>
                </div>
              ))}
              {main && extra && (
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                  <span>Total pago</span>
                  <span>{brl((main.amount + extras.reduce((t, x) => t + x.amount, 0)) / 100)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-lg bg-muted/60 p-6 text-left">
          <h2 className="text-[15px] font-semibold">Próximos passos</h2>
          <ol className="mt-4 space-y-4 text-[13.5px]">
            {[
              { icon: Mail, text: "Você recebe a confirmação do pedido no seu e-mail." },
              { icon: PackageCheck, text: "Separamos e embalamos tudo em um único envio." },
              { icon: Truck, text: "Assim que for despachado, você recebe o código de rastreio." },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ck-green)] text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>

        <Link
          to="/rastreio"
          className="mt-8 inline-block rounded-lg bg-[var(--ck-green)] px-8 py-3.5 text-[15px] font-semibold text-white transition hover:opacity-90"
        >
          Acompanhar meu pedido
        </Link>
        <p className="mt-2 text-[12px] text-muted-foreground">Pedido nº {id}</p>
      </div>
    </Shell>
  );
}
