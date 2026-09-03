// Server middleware validating the bearer token against the TalentLoom backend project.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createSupabaseFetch, serverSupabaseConfig } from "./app-config";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { url, publishableKey } = serverSupabaseConfig();
    const request = getRequest();
    if (!request?.headers) throw new Error("Unauthorized: No request headers available");

    const authHeader = request.headers.get("authorization");
    if (!authHeader) throw new Error("Unauthorized: No authorization header provided");
    if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized: Only Bearer tokens are supported");

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.split(".").length !== 3) throw new Error("Unauthorized: Invalid token");

    const supabase = createClient<Database>(url, publishableKey, {
      global: {
        fetch: createSupabaseFetch(publishableKey),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) throw new Error("Unauthorized: Invalid token");

    return next({ context: { supabase, userId: data.claims.sub, claims: data.claims } });
  },
);
