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
 * Where the shared "Sign in" page sends someone afterwards:
 * 1. people in an organisation (or superusers) go to the recruiter app, which
 *    opens the organisation they last used;
 * 2. otherwise people with Pulse surveys (their own, co-owned, or invited to
 *    answer) go to Pulse surveys;
 * 3. otherwise existing accounts go to the job board to explore open roles;
 * 4. brand-new accounts, and people part-way through setting up an
 *    organisation, go to onboarding (via the recruiter app).
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
  const email = (profile.email ?? "").trim();
  const count = { count: "exact", head: true } as const;
  const none = Promise.resolve({ count: 0 });
  const [members, superuser, ownSurveys, invitedSurveys, coOwnedSurveys, details] = await Promise.all([
    admin.from("organization_members").select("id", count).eq("user_id", profile.id),
    admin.from("app_superusers").select("profile_id", count).eq("profile_id", profile.id),
    admin.from("pulse_surveys").select("id", count).eq("owner_id", profile.id),
    email ? admin.from("pulse_respondents").select("id", count).ilike("email", email) : none,
    email ? admin.from("pulse_survey_owners").select("survey_id", count).ilike("email", email) : none,
    admin.from("profiles").select("created_at, onboarding_step").eq("id", profile.id).maybeSingle(),
  ]);

  if ((members.count ?? 0) > 0 || (superuser.count ?? 0) > 0) return { to: "/pipeline" as const };
  if ((ownSurveys.count ?? 0) + (invitedSurveys.count ?? 0) + (coOwnedSurveys.count ?? 0) > 0) {
    return { to: "/surveys" as const };
  }

  // Nothing yet. A brand-new account is asked how it will use Talentloom, and
  // someone who already started setting up an organisation carries on there.
  const createdAt = details.data?.created_at ? new Date(details.data.created_at as string).getTime() : 0;
  const isNew = Date.now() - createdAt < 10 * 60 * 1000;
  const midSetup = !profile.onboarding_completed_at && ((details.data?.onboarding_step as number | null) ?? 1) > 1;
  if (isNew || midSetup) return { to: "/pipeline" as const };

  return { to: "/apply" as const };
});
