// Browser Supabase client for the TalentLoom backend project.
// Requests carry the Clerk session token (Supabase JWT template); the database
// verifies it via the third-party auth integration and applies RLS.
// Import like: import { supabase } from "@/integrations/supabase/app-client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { APP_SUPABASE_PUBLISHABLE_KEY, APP_SUPABASE_URL, createSupabaseFetch } from "./app-config";
import { getClerkToken } from "@/lib/clerk";

function createAppSupabaseClient() {
  return createClient<Database>(APP_SUPABASE_URL, APP_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(APP_SUPABASE_PUBLISHABLE_KEY) },
    // Clerk owns the session; supabase-js forwards this token on every call.
    // When signed out we return the publishable key, which the fetch shim
    // strips so the request runs as anonymous.
    accessToken: async () => (await getClerkToken()) ?? APP_SUPABASE_PUBLISHABLE_KEY,
  });
}

let _supabase: ReturnType<typeof createAppSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createAppSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createAppSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
