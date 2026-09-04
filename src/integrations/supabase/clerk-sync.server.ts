// Server-only: verify Clerk session tokens and provision/link profile rows.
import { createClerkClient, verifyToken } from "@clerk/backend";

export async function verifyClerkToken(token: string): Promise<string> {
  const secretKey = process.env["CLERK_SECRET_KEY"];
  const supabaseJwtSecret = process.env["EXT_SUPABASE_JWT_SECRET"];

  let payload: { sub?: string } | undefined;
  try {
    if (supabaseJwtSecret) {
      // Shared HS256: Clerk signs the Supabase JWT template with the Supabase JWT secret.
      payload = await verifyToken(token, { jwtKey: supabaseJwtSecret });
    } else if (secretKey) {
      // Default Clerk signing (RS256 or Clerk-managed HS256).
      payload = await verifyToken(token, { secretKey });
    } else {
      throw new Error("Missing CLERK_SECRET_KEY or EXT_SUPABASE_JWT_SECRET");
    }
  } catch {
    throw new Error("Unauthorized: Invalid token");
  }

  if (!payload?.sub) throw new Error("Unauthorized: Invalid token");
  return payload.sub;
}

interface ProfileRow {
  id: string;
  onboarding_completed_at: string | null;
  email?: string | null;
  full_name?: string | null;
}

/**
 * Finds (or creates) the profile row for a Clerk user.
 * Existing users are linked by email on first Clerk sign-in so their
 * organisations, applications and documents carry over.
 */
export async function provisionProfileForClerkUser(clerkUserId: string): Promise<ProfileRow> {
  const { supabaseAdmin } = await import("./app-admin.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any;
  };

  const { data: existing } = await admin
    .from("profiles")
    .select("id, onboarding_completed_at, email, full_name")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (existing) return existing as ProfileRow;

  const clerk = createClerkClient({ secretKey: process.env["CLERK_SECRET_KEY"]! });
  const cu = await clerk.users.getUser(clerkUserId);
  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    null;
  const fullName = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || null;

  // Link an existing profile (created before the Clerk migration) by email.
  if (email) {
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id, onboarding_completed_at, email, full_name")
      .ilike("email", email)
      .is("clerk_user_id", null)
      .maybeSingle();
    if (byEmail) {
      await admin
        .from("profiles")
        .update({ clerk_user_id: clerkUserId, avatar_url: cu.imageUrl ?? undefined })
        .eq("id", byEmail.id);
      return byEmail as ProfileRow;
    }
  }

  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      id: crypto.randomUUID(),
      clerk_user_id: clerkUserId,
      email,
      full_name: fullName,
      avatar_url: cu.imageUrl ?? null,
      onboarding_step: 1,
    })
    .select("id, onboarding_completed_at, email, full_name")
    .single();
  if (error) throw error;
  return created as ProfileRow;
}
