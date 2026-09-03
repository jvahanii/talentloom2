// Central configuration for the TalentLoom backend project.
// Publishable keys are safe to ship to the browser.
export const APP_SUPABASE_URL = "https://dfnotwbswxtrpricbjek.supabase.co";
export const APP_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VbMrb3Yw0mzsaQU6wctppg_Wqc7aoKL";

/** Server-side values (secrets); falls back to the public values above. */
export function serverSupabaseConfig() {
  return {
    url: process.env["EXT_SUPABASE_URL"] || APP_SUPABASE_URL,
    publishableKey:
      process.env["EXT_SUPABASE_PUBLISHABLE_KEY"] || APP_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env["EXT_SUPABASE_SERVICE_ROLE_KEY"] || "",
  };
}

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
