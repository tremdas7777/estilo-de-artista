import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseServiceKey, supabaseUrl } from "./env";

function createSupabaseAdminClient() {
  const SUPABASE_URL = supabaseUrl();
  const SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(
      `Missing Supabase server: ${missing.join(", ")}. Conecte o projeto em More → Cloud (ou Secrets ESTILO_SB_*).`,
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy(
  {} as ReturnType<typeof createSupabaseAdminClient>,
  {
    get(_, prop, receiver) {
      if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
      return Reflect.get(_supabaseAdmin, prop, receiver);
    },
  },
);
