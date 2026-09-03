// Service-role client for the TalentLoom backend project. Server-only.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createSupabaseFetch, serverSupabaseConfig } from "./app-config";

function createAdminClient() {
  const { url, serviceRoleKey } = serverSupabaseConfig();
  if (!serviceRoleKey) throw new Error("Missing EXT_SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, serviceRoleKey, {
    global: { fetch: createSupabaseFetch(serviceRoleKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _admin: ReturnType<typeof createAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createAdminClient>, {
  get(_, prop, receiver) {
    if (!_admin) _admin = createAdminClient();
    return Reflect.get(_admin, prop, receiver);
  },
});
