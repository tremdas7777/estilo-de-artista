import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteUtmifyTokenFn,
  getUtmifyStatus,
  saveUtmifyTokenFn,
  sendUtmifyTest,
} from "@/lib/utmify.functions";

export interface UtmifyCardProps {
  password: string;
}

/** Integração UTMify: token salvo no banco, com troca, exclusão e venda de teste. */
export function UtmifyCard({ password }: UtmifyCardProps) {
  const statusFn = useServerFn(getUtmifyStatus);
  const testFn = useServerFn(sendUtmifyTest);
  const saveFn = useServerFn(saveUtmifyTokenFn);
  const deleteFn = useServerFn(deleteUtmifyTokenFn);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () =>
    statusFn({ data: { password } })
      .then((r) => {
        setConfigured(r.configured);
        setMaskedToken(r.maskedToken);
      })
      .catch(() => setConfigured(false));

  useEffect(() => {
    if (!password) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const save = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await saveFn({ data: { password, token: token.trim() } });
      setToken("");
      setMsg("Token salvo.");
      refresh();
    } catch {
      setMsg("Falhou ao salvar o token.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setMsg(null);
    try {
      await deleteFn({ data: { password } });
      setMsg("Token apagado. As vendas não serão mais enviadas à UTMify.");
      refresh();
    } catch {
      setMsg("Falhou ao apagar o token.");
    } finally {
      setDeleting(false);
    }
  };

  const runTest = async (status: "paid" | "waiting_payment") => {
    setTesting(true);
    setMsg(null);
    try {
      const r = await testFn({ data: { password, status } });
      setMsg(
        r.ok
          ? `Conexão OK: a UTMify aceitou o formato de pedido ${status === "paid" ? "pago" : "pendente"}. (Enviado como teste — não entra nas vendas.)`
          : `A UTMify recusou (HTTP ${r.status ?? "?"}): ${r.error ?? "sem detalhes"}`,
      );
    } catch {
      setMsg("Falhou ao enviar o teste.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="mt-3 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-5 h-5 text-muted-foreground" aria-hidden />
        <div>
          <div className="font-medium">Integração UTMify</div>
          <div className="text-xs text-muted-foreground">
            Cada Pix gerado (pendente) e cada pagamento aprovado é enviado à UTMify com as UTMs do
            cliente.
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="password"
          placeholder={
            configured ? "Token salvo — cole um novo para trocar" : "Cole o token da UTMify"
          }
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!token.trim() || saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!configured || deleting}
            onClick={remove}
          >
            {deleting ? "Apagando…" : "Apagar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!configured || testing}
            onClick={() => runTest("paid")}
          >
            {testing ? "Testando…" : "Testar conexão (pago)"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!configured || testing}
            onClick={() => runTest("waiting_payment")}
          >
            {testing ? "Testando…" : "Testar conexão (pendente)"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          {configured === null ? "…" : configured ? "Conectada" : "Sem token"}
        </span>
        {maskedToken && (
          <span className="font-mono text-muted-foreground">Token atual: {maskedToken}</span>
        )}
        {msg && <span className="text-foreground">{msg}</span>}
      </div>
    </Card>
  );
}
