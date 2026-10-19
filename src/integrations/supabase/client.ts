import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";
import { supabaseAnonKey, supabaseUrl } from "./env";

function createSupabaseClient() {
  const SUPABASE_URL = supabaseUrl();
  const SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey();

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL / VITE_SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY
        ? ["SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY"]
        : []),
    ];
    throw new Error(
      `Missing Supabase: ${missing.join(", ")}. Conecte o Supabase em More → Cloud ou preencha o .env (veja .env.example).`,
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
