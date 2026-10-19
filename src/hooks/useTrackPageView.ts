import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { trackEvent } from "@/lib/tracking";

export function useTrackPageView() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith("/admin")) return;
    trackEvent({
      event_type: pathname === "/produto" ? "product_view" : "page_view",
      path: pathname,
    });
  }, [pathname]);
}
