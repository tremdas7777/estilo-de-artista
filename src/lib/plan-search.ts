import { z } from "zod";
import { parseBundleId, type BundleId } from "@/lib/bundles";

const bundleParamSchema = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  z.enum(["30", "60", "90"]),
);

/** Query string dos planos (?plano=30|60|90). Aceita parâmetros legados. */
export const planSearchSchema = z.object({
  plano: bundleParamSchema.optional(),
  /** @deprecated use ?plano= */
  kit: bundleParamSchema.optional(),
  /** @deprecated mapeia 1→30, 2→60, 3→90 */
  unidades: z.enum(["1", "2", "3"]).optional(),
});

export type PlanSearch = z.infer<typeof planSearchSchema>;

export function bundleIdFromSearch(search: PlanSearch): BundleId {
  return parseBundleId(search.plano ?? search.kit ?? search.unidades) ?? "30";
}
