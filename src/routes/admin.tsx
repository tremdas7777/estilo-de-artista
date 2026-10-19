import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminFunnel, verifyAdminPassword } from "@/lib/admin.functions";
import { getSiteSettings, setWhatsappEnabled } from "@/lib/site-settings.functions";
import { UtmifyCard } from "@/components/admin/UtmifyCard";
import { HypercashCard } from "@/components/admin/HypercashCard";
import { PixGatewayCard } from "@/components/admin/PixGatewayCard";
import { MetaPixelCard } from "@/components/admin/MetaPixelCard";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { AbandonedTab } from "@/components/admin/AbandonedTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Eye,
  ShoppingBag,
  CreditCard,
  Activity,
  Loader2,
  Users,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin · Estilo de Artista" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AdminPage,
});

/** Só senha (ADMIN_PASSWORD) — sem e-mail / Supabase Auth. */
const STORAGE_KEY = "estilo_admin_pwd";

type FunnelEvent = {
  id: string;
  session_id: string;
  event_type: string;
  path: string | null;
  bundle_id: string | null;
  bundle_name: string | null;
  value: number | null;
  referrer: string | null;
  utm_source: string | null;
  metadata?: { step?: string; source?: string } | null;
  created_at: string;
};

type Funnel = {
  visited: number;
  viewedProduct: number;
  checkout: number;
  totalEvents: number;
  totalSessions: number;
  onlineNow: number;
  windowMinutes: number;
  onlineMinutes: number;
};

const TIME_WINDOWS = [
  { key: "15m", label: "15min", minutes: 15 },
  { key: "1h", label: "1h", minutes: 60 },
  { key: "6h", label: "6h", minutes: 60 * 6 },
  { key: "24h", label: "24h", minutes: 60 * 24 },
  { key: "7d", label: "7d", minutes: 60 * 24 * 7 },
  { key: "30d", label: "30d", minutes: 60 * 24 * 30 },
] as const;

function windowLabel(minutes: number) {
  const opt = TIME_WINDOWS.find((w) => w.minutes === minutes);
  if (opt) return opt.label;
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}

function AdminPage() {
  const verify = useServerFn(verifyAdminPassword);
  const fetchFunnel = useServerFn(getAdminFunnel);

  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const [events, setEvents] = useState<FunnelEvent[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState<number>(60 * 24);
  const onlineMinutes = 3;

  // Reabre a sessão da aba se a senha ainda for válida (sem login de usuário).
  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      verify({ data: { password: stored } })
        .then((r) => {
          if (r.ok) {
            setPassword(stored);
            setAuthed(true);
          } else {
            sessionStorage.removeItem(STORAGE_KEY);
          }
          setChecking(false);
        })
        .catch(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, [verify]);

  // Fetch data + realtime subscription
  useEffect(() => {
    if (!authed || !password) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const r = await fetchFunnel({ data: { password, windowMinutes, onlineMinutes } });
        if (!cancelled) {
          setEvents(r.recent as FunnelEvent[]);
          setFunnel(r.funnel);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    // Realtime opcional — acesso ao painel é só por senha, sem Auth.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel("funnel_events_live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "funnel_events" },
          (payload) => {
            const ev = payload.new as FunnelEvent;
            setEvents((prev) => [ev, ...prev].slice(0, 100));
            void load();
          },
        )
        .subscribe();
    } catch {
      /* sem cliente realtime */
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [authed, password, fetchFunnel, windowMinutes]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await verify({ data: { password } });
      if (r.ok) {
        sessionStorage.setItem(STORAGE_KEY, password);
        setAuthed(true);
      } else if ("error" in r && r.error === "ADMIN_PASSWORD not set") {
        setError("Defina ADMIN_PASSWORD no ambiente do servidor.");
      } else {
        setError("Senha incorreta");
      }
    } catch {
      setError("Erro ao verificar senha");
    }
  };

  // WhatsApp toggle
  const fetchSettings = useServerFn(getSiteSettings);
  const saveWhatsapp = useServerFn(setWhatsappEnabled);
  const [whatsappEnabled, setWhatsappEnabledState] = useState<boolean | null>(null);
  const [savingWa, setSavingWa] = useState(false);

  useEffect(() => {
    if (!authed) return;
    fetchSettings()
      .then((s) => {
        setWhatsappEnabledState(s.whatsappEnabled);
      })
      .catch(() => {});
  }, [authed, fetchSettings]);

  const toggleWhatsapp = async () => {
    if (whatsappEnabled === null) return;
    setSavingWa(true);
    try {
      const next = !whatsappEnabled;
      const r = await saveWhatsapp({ data: { password, enabled: next } });
      setWhatsappEnabledState(r.enabled);
    } finally {
      setSavingWa(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm p-8">
          <h1 className="text-2xl font-display mb-2">Admin Estilo de Artista</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Digite a senha do painel. Não usa e-mail nem conta de usuário.
          </p>
          <form onSubmit={handleUnlock} className="space-y-4">
            <Input
              type="password"
              name="admin-password"
              placeholder="Senha do painel"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Acessar painel
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container-edge py-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl">Painel Admin</h1>
            <p className="text-sm text-muted-foreground">
              Últimas {windowLabel(windowMinutes)} · atualização em tempo real
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
        </div>
      </header>

      <main className="container-edge py-8">
        <Tabs defaultValue="funil">
          <TabsList className="mb-8">
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="abandonados">Checkouts abandonados</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos">
            <OrdersTab password={password} />
          </TabsContent>

          <TabsContent value="abandonados">
            <AbandonedTab password={password} />
          </TabsContent>

          <TabsContent value="funil" className="space-y-8">
            {/* Site settings */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Configurações da loja
              </h2>
              <Card className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Botão de WhatsApp</div>
                    <div className="text-xs text-muted-foreground">
                      Quando desativado, o botão e o número somem do site.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {whatsappEnabled === null ? "…" : whatsappEnabled ? "Ativo" : "Desativado"}
                  </span>
                  <Button
                    size="sm"
                    variant={whatsappEnabled ? "destructive" : "default"}
                    disabled={savingWa || whatsappEnabled === null}
                    onClick={toggleWhatsapp}
                  >
                    {savingWa ? "Salvando…" : whatsappEnabled ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </Card>
              <PixGatewayCard password={password} />
              <HypercashCard password={password} />
              <UtmifyCard password={password} />
              <MetaPixelCard password={password} />
            </section>

            {/* Time filters */}

            <section>
              <div className="flex flex-wrap gap-2">
                {TIME_WINDOWS.map((w) => (
                  <Button
                    key={w.key}
                    type="button"
                    variant={windowMinutes === w.minutes ? "default" : "outline"}
                    size="sm"
                    onClick={() => setWindowMinutes(w.minutes)}
                  >
                    {w.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Online agora = sessões com atividade nos últimos {onlineMinutes} min.
              </p>
            </section>

            {/* Funnel */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Funil (sessões únicas)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="Online agora"
                  value={funnel?.onlineNow ?? 0}
                  helper={`últimos ${onlineMinutes} min`}
                />
                <StatCard
                  icon={<Activity className="w-5 h-5" />}
                  label="Visitantes"
                  value={funnel?.visited ?? 0}
                />
                <StatCard
                  icon={<Eye className="w-5 h-5" />}
                  label="Viram produto"
                  value={funnel?.viewedProduct ?? 0}
                  percent={pct(funnel?.viewedProduct, funnel?.visited)}
                />
                <StatCard
                  icon={<ShoppingBag className="w-5 h-5" />}
                  label="Clicaram checkout"
                  value={funnel?.checkout ?? 0}
                  percent={pct(funnel?.checkout, funnel?.visited)}
                />
                <StatCard
                  icon={<CreditCard className="w-5 h-5" />}
                  label="Conv. final"
                  value={`${pct(funnel?.checkout, funnel?.visited)}%`}
                />
              </div>
            </section>

            {/* Live events */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Eventos recentes ({events.length})
                </h2>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left">
                        <th className="px-4 py-2 font-medium">Hora</th>
                        <th className="px-4 py-2 font-medium">Evento</th>
                        <th className="px-4 py-2 font-medium">Sessão</th>
                        <th className="px-4 py-2 font-medium">Caminho</th>
                        <th className="px-4 py-2 font-medium">Plano</th>
                        <th className="px-4 py-2 font-medium">Valor</th>
                        <th className="px-4 py-2 font-medium">UTM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(e.created_at).toLocaleTimeString("pt-BR")}
                          </td>
                          <td className="px-4 py-2">
                            <EventBadge type={e.event_type} step={e.metadata?.step} />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {e.session_id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{e.path}</td>
                          <td className="px-4 py-2">{e.bundle_name ?? "—"}</td>
                          <td className="px-4 py-2 tabular-nums">
                            {e.value ? `R$ ${e.value.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {e.utm_source ?? "—"}
                          </td>
                        </tr>
                      ))}
                      {events.length === 0 && !loading && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                            Nenhum evento ainda. Navegue no site para gerar dados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function pct(part?: number, total?: number) {
  if (!total || !part) return 0;
  return Math.round((part / total) * 100);
}

function StatCard({
  icon,
  label,
  value,
  percent,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  percent?: number;
  helper?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-display tabular-nums">{value}</div>
      {percent !== undefined && (
        <div className="text-xs text-muted-foreground mt-1">{percent}% dos visitantes</div>
      )}
      {helper && percent === undefined && (
        <div className="text-xs text-muted-foreground mt-1">{helper}</div>
      )}
    </Card>
  );
}

const CHECKOUT_STEP_LABEL: Record<string, string> = {
  checkout: "Checkout: entrou",
  dados: "Checkout: dados",
  entrega: "Checkout: entrega",
  pix: "Checkout: Pix gerado",
};

function EventBadge({ type, step }: { type: string; step?: string | undefined }) {
  const map: Record<string, { label: string; cls: string }> = {
    page_view: { label: "Visita", cls: "bg-blue-100 text-blue-800" },
    product_view: { label: "Produto", cls: "bg-purple-100 text-purple-800" },
    checkout_click: { label: "Checkout", cls: "bg-green-100 text-green-800" },
    // Etapas do checkout (usadas na aba "Checkouts abandonados").
    checkout_step: {
      label: CHECKOUT_STEP_LABEL[step ?? ""] ?? "Checkout: etapa",
      cls: step === "pix" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
    },
  };
  const m = map[type] ?? { label: type, cls: "bg-gray-100 text-gray-800" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
