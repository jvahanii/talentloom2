// Server middleware validating the Clerk session token and resolving the
// caller's TalentLoom profile (uuid) for RLS-scoped database access.
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
    if (!authHeader.startsWith("Bearer "))
      throw new Error("Unauthorized: Only Bearer tokens are supported");

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.split(".").length !== 3) throw new Error("Unauthorized: Invalid token");

    const { verifyClerkToken, provisionProfileForClerkUser } = await import("./clerk-sync.server");
    let clerkUserId: string;
    try {
      clerkUserId = await verifyClerkToken(token);
    } catch {
      throw new Error("Unauthorized: Invalid token");
    }

    // Auto-provision/link the profile so first sign-in works everywhere.
    const profile = await provisionProfileForClerkUser(clerkUserId);

    // RLS applies as this user: the database verifies the Clerk token via the
    // third-party auth integration, and policies map sub -> profiles.id.
    const supabase = createClient<Database>(url, publishableKey, {
      global: {
        fetch: createSupabaseFetch(publishableKey),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    return next({
      context: { supabase, userId: profile.id, clerkUserId, claims: { sub: clerkUserId } },
    });
  },
);
