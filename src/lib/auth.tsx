import { useAuth, useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";

export interface AppUser {
  /** TalentLoom profile id (uuid). */
  id: string | null;
  email: string | null;
  user_metadata: { full_name?: string; avatar_url?: string };
}

/** Clerk-backed session hook with the same shape the app used before. */
export function useSession() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();

  const profileQuery = useQuery({
    queryKey: ["my-profile-id", clerkUser?.id],
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("current_profile_id");
      return (data as string | null) ?? null;
    },
  });

  const loading = !isLoaded || (Boolean(isSignedIn) && profileQuery.isLoading);
  const user: AppUser | null =
    isSignedIn && clerkUser
      ? {
          id: profileQuery.data ?? null,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
          user_metadata: {
            full_name: clerkUser.fullName ?? undefined,
            avatar_url: clerkUser.imageUrl ?? undefined,
          },
        }
      : null;

  return { session: user ? { user } : null, user, loading, signedIn: Boolean(isSignedIn) };
}

/** Resolves the current user's TalentLoom profile id via RLS helper. */
export async function getMyProfileId(): Promise<string | null> {
  try {
    const { data } = await (supabase as any).rpc("current_profile_id");
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}
