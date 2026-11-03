import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";
import { MAX_SKILLS, MAX_SKILL_LENGTH, writeSkills, type Skill } from "@/lib/skills";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const PROTECTED_TITLES = ["Owner", "Admin"];

async function hasPermission(sb: Loose, orgId: string, userId: string, perm: string) {
  const { data } = await sb.rpc("has_org_permission", { _org: orgId, _user: userId, _perm: perm });
  return data === true;
}

/**
 * Adds a person to the organisation by email. If the email already has a
 * Talentloom account they become a member straight away with the chosen title;
 * otherwise an invite is created and its id returned so the caller can email it.
 * Needs the "invite users" permission; Owner and Admin titles need an owner.
 */
export const addPersonToOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; email: string; titleId: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email().max(255),
        titleId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    if (!(await hasPermission(sb, data.orgId, context.userId, "invite_users"))) {
      throw new Error("Your title doesn't allow adding people to this organisation");
    }
    const { data: title, error: titleError } = await sb
      .from("organization_titles")
      .select("id, name")
      .eq("id", data.titleId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (titleError) throw new Error(titleError.message);
    if (!title) throw new Error("That title doesn't belong to this organisation");
    if (PROTECTED_TITLES.includes(title.name)) {
      const { data: owner } = await sb.rpc("is_org_owner", {
        _org: data.orgId,
        _user: context.userId,
      });
      if (owner !== true) throw new Error("Only an owner can add Owners and Admins");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const admin = supabaseAdmin as Loose;
    const { data: matches, error: findError } = await admin
      .from("profiles")
      .select("id, full_name, email, clerk_user_id")
      .ilike("email", data.email)
      .not("clerk_user_id", "is", null)
      .limit(1);
    if (findError) throw new Error(findError.message);
    const person = (matches ?? [])[0] as Loose | undefined;

    if (!person) {
      // No account yet: invite them (as the caller, so the usual invite rules apply).
      const { data: invite, error: inviteError } = await sb
        .from("organization_invites")
        .insert({
          org_id: data.orgId,
          email: data.email,
          title_id: data.titleId,
          invited_by: context.userId,
        })
        .select("id")
        .single();
      if (inviteError) throw new Error(inviteError.message);
      return { status: "invited" as const, inviteId: invite.id as string, email: data.email };
    }

    const { data: existing } = await admin
      .from("organization_members")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", person.id)
      .maybeSingle();
    if (existing)
      return {
        status: "already" as const,
        name: (person.full_name as string | null) ?? data.email,
      };

    const roleByTitle: Record<string, string> = { Owner: "owner", Admin: "admin" };
    const { error: insertError } = await admin.from("organization_members").insert({
      org_id: data.orgId,
      user_id: person.id,
      title_id: data.titleId,
      role: roleByTitle[title.name] ?? "member",
    });
    if (insertError) throw new Error(insertError.message);
    return { status: "added" as const, name: (person.full_name as string | null) ?? data.email };
  });

/** Changes a member's full name. Needs the "change titles" permission in an organisation they belong to. */
export const updatePersonName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; userId: string; fullName: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        fullName: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    if (
      data.userId !== context.userId &&
      !(await hasPermission(sb, data.orgId, context.userId, "change_titles"))
    ) {
      throw new Error("Your title doesn't allow editing other people");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const admin = supabaseAdmin as Loose;
    const { data: member } = await admin
      .from("organization_members")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That person isn't a member of this organisation");
    const { error } = await admin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Replaces a member's skills and levels. Same rule as names: yourself, or the "change titles" permission. */
export const updatePersonSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; userId: string; skills: Skill[] }) =>
    z
      .object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        skills: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(MAX_SKILL_LENGTH),
              level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()]),
            }),
          )
          .max(MAX_SKILLS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    if (
      data.userId !== context.userId &&
      !(await hasPermission(sb, data.orgId, context.userId, "change_titles"))
    ) {
      throw new Error("Your title doesn't allow editing other people");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const admin = supabaseAdmin as Loose;
    const { data: member } = await admin
      .from("organization_members")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That person isn't a member of this organisation");
    const { error } = await admin
      .from("profiles")
      .update(writeSkills(data.skills))
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
