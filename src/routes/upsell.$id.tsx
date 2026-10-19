import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { brand } from "@/lib/brand";
import { Shell } from "@/components/checkout/OrderShell";

/** Upsell CGM desativado — segue direto para a confirmação. */
export const Route = createFileRoute("/upsell/$id")({
  head: () => ({
    meta: [{ title: `Pedido | ${brand.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/obrigado/$id", params: { id }, replace: true });
  }, [id, navigate]);
  return (
    <Shell>
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ck-brand)]" />
      </div>
    </Shell>
  );
}
