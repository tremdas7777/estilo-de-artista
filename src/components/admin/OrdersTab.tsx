import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
} from "lucide-react";
import { getAdminOrders, type AdminOrder } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface OrdersTabProps {
  password: string;
}

const PERIODS = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1 ano" },
] as const;

const STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "paid", label: "Pagos" },
  { key: "pending", label: "Aguardando" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

// No banco, "paid" só é gravado depois da confirmação do gateway (reportPaidOnce).
const isPaid = (o: AdminOrder) => o.status === "paid";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

const fmtCpf = (v: string) =>
  v.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 11
    ? d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
    : d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
};

/** Aba de pedidos Pix: lista, filtros, busca, detalhes completos e exportação CSV. */
export function OrdersTab({ password }: OrdersTabProps) {
  const fetchOrders = useServerFn(getAdminOrders);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchOrders({ data: { password, days } });
      setOrders(r.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, days]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return orders.filter((o) => {
      if (status === "paid" && !isPaid(o)) return false;
      if (status === "pending" && isPaid(o)) return false;
      if (!q) return true;
      const c = o.customer ?? ({} as AdminOrder["customer"]);
      return (
        o.id.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (c.cpf?.includes(qDigits) || c.phone?.includes(qDigits)))
      );
    });
  }, [orders, status, query]);

  const stats = useMemo(() => {
    const paid = orders.filter(isPaid);
    const revenue = paid.reduce((s, o) => s + o.amount_cents, 0);
    return {
      total: orders.length,
      paid: paid.length,
      pending: orders.length - paid.length,
      revenue,
      ticket: paid.length ? Math.round(revenue / paid.length) : 0,
      conv: orders.length ? Math.round((paid.length / orders.length) * 100) : 0,
    };
  }, [orders]);

  const exportCsv = () => {
    const header = [
      "Data",
      "ID",
      "Status",
      "Nome",
      "Email",
      "Telefone",
      "CPF",
      "Endereço",
      "Plano",
      "Frete",
      "Valor",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "Pago em",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filtered.map((o) => {
      const c = o.customer ?? ({} as AdminOrder["customer"]);
      const u = o.utm ?? {};
      return [
        fmtDate(o.created_at),
        o.id,
        statusLabel(o.status),
        c.name,
        c.email,
        c.phone,
        c.cpf,
        c.endereco,
        o.bundle_name,
        c.frete?.name,
        (o.amount_cents / 100).toFixed(2).replace(".", ","),
        u.utm_source,
        u.utm_medium,
        u.utm_campaign,
        u.utm_content,
        u.utm_term,
        isPaid(o) ? fmtDate(o.paid_reported_at ?? o.updated_at) : "",
      ]
        .map(esc)
        .join(";");
    });
    const blob = new Blob(["﻿" + [header.map(esc).join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={days === p.days ? "default" : "outline"}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat icon={<Receipt className="w-5 h-5" />} label="Pedidos" value={stats.total} />
        <Stat
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Pagos"
          value={stats.paid}
          helper={`${stats.conv}% de aprovação`}
        />
        <Stat icon={<Clock className="w-5 h-5" />} label="Aguardando" value={stats.pending} />
        <Stat
          icon={<DollarSign className="w-5 h-5" />}
          label="Faturamento"
          value={brl(stats.revenue)}
          helper="somente pagos"
        />
        <Stat
          icon={<DollarSign className="w-5 h-5" />}
          label="Ticket médio"
          value={brl(stats.ticket)}
        />
      </div>

      {/* Busca + status */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, e-mail, CPF, telefone ou ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={status === s.key ? "default" : "outline"}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto max-h-[700px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Plano</th>
                <th className="px-4 py-2 font-medium">Frete</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Origem</th>
                <th className="px-4 py-2 font-medium">UTMify</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelected(o)}
                >
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {fmtDate(o.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{o.customer?.name}</div>
                    <div className="text-xs text-muted-foreground">{o.customer?.email}</div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {o.customer?.phone ? fmtPhone(o.customer.phone) : "—"}
                  </td>
                  <td className="px-4 py-2">{o.bundle_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {o.customer?.frete?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                    {brl(o.amount_cents)}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {o.utm?.utm_source ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <UtmifyBadge order={o} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <OrderDialog order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function OrderDialog({ order: o, onClose }: { order: AdminOrder | null; onClose: () => void }) {
  if (!o) return null;
  const c = o.customer ?? ({} as AdminOrder["customer"]);
  const utmEntries = Object.entries(o.utm ?? {}).filter(([, v]) => v);
  const whats = c.phone ? `https://wa.me/55${c.phone.replace(/\D/g, "")}` : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Pedido <span className="font-mono text-sm text-muted-foreground">{o.id}</span>
            <StatusBadge status={o.status} />
          </DialogTitle>
        </DialogHeader>

        <Section title="Cliente">
          <Row label="Nome" value={c.name} />
          <Row label="E-mail" value={c.email} />
          <Row
            label="Telefone"
            value={
              c.phone ? (
                <span>
                  {fmtPhone(c.phone)}
                  {whats && (
                    <a
                      href={whats}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-xs text-green-700 underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </span>
              ) : null
            }
          />
          <Row label="CPF" value={c.cpf ? fmtCpf(c.cpf) : null} />
          <Row label="Endereço" value={c.endereco} />
        </Section>

        {c.qrcode && <PixCode code={c.qrcode} paid={isPaid(o)} />}

        <Section title="Pedido">
          <Row label="Plano" value={`${o.bundle_name} (${o.bundle_id})`} />
          <Row
            label="Frete"
            value={
              c.frete
                ? `${c.frete.name} — ${c.frete.price ? brl(Math.round(c.frete.price * 100)) : "Grátis"}`
                : null
            }
          />
          <Row label="Valor total" value={brl(o.amount_cents)} />
          <Row
            label="Pagamento"
            value={
              c.method === "card"
                ? `Cartão${c.card?.brand ? ` ${c.card.brand}` : ""}${c.card?.lastDigits ? ` final ${c.card.lastDigits}` : ""} — ${c.installments ?? 1}x`
                : `Pix${c.discount ? ` (desconto ${brl(Math.round(c.discount * 100))})` : ""}`
            }
          />
          <Row label="Criado em" value={fmtDate(o.created_at)} />
          <Row
            label="Pago em"
            value={isPaid(o) ? fmtDate(o.paid_reported_at ?? o.updated_at) : null}
          />
          <Row label="Atualizado em" value={fmtDate(o.updated_at)} />
        </Section>

        <Section title="Origem / UTM">
          {utmEntries.length === 0 && <p className="text-sm text-muted-foreground">Sem UTMs.</p>}
          {utmEntries.map(([k, v]) => (
            <Row key={k} label={k} value={v} />
          ))}
          <Row label="URL" value={o.url} />
        </Section>

        <Section title="Técnico">
          <Row label="IP" value={o.ip} />
          <Row label="User agent" value={o.ua} />
          <Row label="fbp" value={o.fbp} />
          <Row label="fbc" value={o.fbc} />
          <Row
            label="Reportado (UTMify/Meta)"
            value={o.paid_reported_at ? fmtDate(o.paid_reported_at) : null}
          />
          {o.report_result != null && (
            <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-x-auto">
              {JSON.stringify(o.report_result, null, 2)}
            </pre>
          )}
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value || "—"}</dd>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-display tabular-nums">{value}</div>
      {helper && <div className="text-xs text-muted-foreground mt-1">{helper}</div>}
    </Card>
  );
}

function statusLabel(status: string) {
  if (status === "paid") return "Pago";
  if (status === "waiting_payment" || status === "pending") return "Aguardando";
  if (status === "expired") return "Expirado";
  if (status === "refunded") return "Reembolsado";
  return status;
}

function StatusBadge({ status }: { status: string }) {
  const paid = status === "paid";
  const cls = paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Resultado do envio à UTMify para este pedido (pago ou, se não pago, o aviso de pendente). */
function UtmifyBadge({ order: o }: { order: AdminOrder }) {
  const rr = (o.report_result ?? {}) as Record<
    string,
    { ok?: boolean; status?: number; error?: string } | undefined
  >;
  const r = isPaid(o) ? rr["utmify"] : rr["utmifyPending"];
  if (!r) return <span className="text-xs text-muted-foreground">—</span>;
  if (r.ok)
    return (
      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        ✓ enviado
      </span>
    );
  return (
    <span
      title={`${r.status ?? ""} ${r.error ?? ""}`.trim()}
      className="cursor-help rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
    >
      ✗{" "}
      {r.error === "Token não configurado"
        ? "sem token"
        : `recusado${r.status ? ` (${r.status})` : ""}`}
    </span>
  );
}

/** Pix copia e cola gerado para o pedido, com botão de copiar (para reenviar ao cliente). */
function PixCode({ code, paid }: { code: string; paid: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // área de transferência indisponível
    }
  };
  return (
    <div className="border-t pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pix copia e cola
        </h3>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? "Copiado!" : "Copiar código"}
        </Button>
      </div>
      <p className="max-h-24 overflow-y-auto break-all rounded bg-muted p-3 font-mono text-xs">
        {code}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {paid
          ? "Este Pix já foi pago."
          : "O código vale por 30 minutos depois de gerado. Depois disso, o cliente precisa gerar um novo."}
      </p>
    </div>
  );
}
