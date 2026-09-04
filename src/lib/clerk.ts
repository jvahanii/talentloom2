// Clerk client helpers for TalentLoom.
// The publishable key is public by design (safe to ship to the browser).
export const CLERK_PUBLISHABLE_KEY: string =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ??
  "pk_test_PASTE_YOUR_CLERK_PUBLISHABLE_KEY";

// Name of the JWT template created in the Clerk dashboard for Supabase.
export const CLERK_JWT_TEMPLATE = "supabase";

interface ClerkLike {
  loaded?: boolean;
  session?: { getToken: (opts?: { template?: string }) => Promise<string | null> } | null;
  signOut?: () => Promise<void>;
}

function clerkGlobal(): ClerkLike | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Clerk?: ClerkLike }).Clerk;
}

/** Returns a Clerk session JWT (Supabase template), or null when signed out. */
export async function getClerkToken(): Promise<string | null> {
  try {
    const clerk = clerkGlobal();
    if (!clerk?.session) return null;
    return await clerk.session.getToken({ template: CLERK_JWT_TEMPLATE });
  } catch {
    return null;
  }
}

/** Waits for clerk-js (loaded by ClerkProvider) to finish initialising. */
export async function waitForClerk(timeoutMs = 8000): Promise<ClerkLike | null> {
  const start = Date.now();
  for (;;) {
    const clerk = clerkGlobal();
    if (clerk?.loaded) return clerk;
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** True when a Clerk session exists (after waiting for clerk-js to load). */
export async function hasClerkSession(): Promise<boolean> {
  const clerk = await waitForClerk();
  return Boolean(clerk?.session);
}

export async function clerkSignOut(): Promise<void> {
  try {
    await clerkGlobal()?.signOut?.();
  } catch {
    /* ignore */
  }
}
