// Browser Supabase client for the TalentLoom backend project.
// Import like: import { supabase } from "@/integrations/supabase/app-client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  APP_SUPABASE_PUBLISHABLE_KEY,
  APP_SUPABASE_URL,
  createSupabaseFetch,
} from "./app-config";

function createAppSupabaseClient() {
  return createClient<Database>(APP_SUPABASE_URL, APP_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(APP_SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: typeof window !== "undefined",
    },
  });
}

let _supabase: ReturnType<typeof createAppSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createAppSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createAppSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
