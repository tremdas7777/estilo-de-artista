/**
 * Resolve env do Supabase em Lovable / Vite / Node.
 *
 * No Lovable, o prefixo SUPABASE_* é reservado e só aparece ao conectar Cloud
 * ou o seu projeto Supabase (More → Cloud → Connect). Secrets manuais com esse
 * prefixo são bloqueados — use o connect ou os aliases ESTILO_SB_* abaixo.
 */
function first(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

const env = (k: string) => process.env[k];

const vite = (k: string) =>
  typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env[k] as string | undefined)
    : undefined;

export function supabaseUrl(): string | undefined {
  return first(
    vite("VITE_SUPABASE_URL"),
    env("SUPABASE_URL"),
    env("ESTILO_SB_URL"),
    env("VITE_SUPABASE_URL"),
  );
}

/** Anon / publishable (pode ir no browser). */
export function supabaseAnonKey(): string | undefined {
  return first(
    vite("VITE_SUPABASE_PUBLISHABLE_KEY"),
    vite("VITE_SUPABASE_ANON_KEY"),
    env("SUPABASE_PUBLISHABLE_KEY"),
    env("SUPABASE_ANON_KEY"),
    env("ESTILO_SB_ANON_KEY"),
    env("VITE_SUPABASE_PUBLISHABLE_KEY"),
  );
}

/** Service role — só servidor. Nunca use VITE_. */
export function supabaseServiceKey(): string | undefined {
  return first(env("SUPABASE_SERVICE_ROLE_KEY"), env("ESTILO_SB_SERVICE_ROLE_KEY"));
}
