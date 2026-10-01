import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";

/**
 * Emails an organisation invite through Clerk. The invite row is read with the
 * caller's RLS client, so only people who can see the invite can send it.
 * Clerk's email links to /invite/<token>, which joins the organisation.
 */
export const sendInviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inviteId: string }) =>
    z.object({ inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: invite, error } = await context.supabase
      .from("organization_invites")
      .select("id, email, token, expires_at, accepted_at")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    if (!invite.email) throw new Error("This invite has no email address");
    if (invite.accepted_at) throw new Error("This invite has already been accepted");

    const origin = new URL(getRequest().url).origin;
    const daysLeft = Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000);

    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey: process.env["CLERK_SECRET_KEY"]! });
    await clerk.invitations.createInvitation({
      emailAddress: invite.email,
      redirectUrl: `${origin}/invite/${invite.token}`,
      expiresInDays: Math.max(1, daysLeft),
      // Re-sending, or inviting someone who already has an account, still emails them.
      ignoreExisting: true,
      notify: true,
    });
    return { sent: true };
  });
