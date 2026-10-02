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

  const { verifyClerkToken, provisionProfileForClerkUser } =
    await import("@/integrations/supabase/clerk-sync.server");
  const clerkUserId = await verifyClerkToken(token);
  const profile = await provisionProfileForClerkUser(clerkUserId);
  return {
    id: profile.id,
    email: profile.email ?? null,
    fullName: profile.full_name ?? null,
    onboardingCompleted: Boolean(profile.onboarding_completed_at),
  };
});

/**
 * Where the shared "Sign in" page sends someone afterwards: candidates (people
 * with their own applications or documents and no organisation) go to their
 * applications; everyone else goes to the recruiter app, which handles
 * onboarding and organisations.
 */
export const getSignInDestination = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");

  const { verifyClerkToken, provisionProfileForClerkUser } =
    await import("@/integrations/supabase/clerk-sync.server");
  const profile = await provisionProfileForClerkUser(await verifyClerkToken(token));

  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const [members, applications, documents] = await Promise.all([
    admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id),
    admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("applicant_user_id", profile.id),
    admin
      .from("candidate_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id),
  ]);
  const isRecruiter = (members.count ?? 0) > 0 || Boolean(profile.onboarding_completed_at);
  const isCandidate = (applications.count ?? 0) > 0 || (documents.count ?? 0) > 0;
  return {
    to: !isRecruiter && isCandidate ? ("/candidate/applications" as const) : ("/pipeline" as const),
  };
});
