import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Ensures a profile row exists for the signed-in Clerk user (creating or
 * email-linking it) and returns the profile id + onboarding state.
 */
export const ensureMyProfile = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");

  const { verifyClerkToken, provisionProfileForClerkUser } = await import(
    "@/integrations/supabase/clerk-sync.server"
  );
  const clerkUserId = await verifyClerkToken(token);
  const profile = await provisionProfileForClerkUser(clerkUserId);
  return {
    id: profile.id,
    email: profile.email ?? null,
    fullName: profile.full_name ?? null,
    onboardingCompleted: Boolean(profile.onboarding_completed_at),
  };
});
