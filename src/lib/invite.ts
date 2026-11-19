import { supabase } from "@/integrations/supabase/app-client";

export type InviteResult = { orgId: string; orgName: string | null; joined: boolean };

/**
 * Uses an invite as the signed-in person. An emailed invite joins the organisation;
 * a sign-up link only creates a request that an admin of the organisation acts on.
 */
export async function redeemInvite(token: string): Promise<InviteResult> {
  // use_invite lives in the external database; Lovable's generated types don't know it.
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("use_invite", { _token: token });
  if (error) throw new Error(error.message);
  const r = data as { org_id: string; org_name: string | null; joined: boolean };
  return { orgId: r.org_id, orgName: r.org_name, joined: r.joined };
}
