import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";
import { spaceRoot } from "@/lib/people.functions";
import { MAX_SKILL_LEVELS, MAX_SKILL_LEVEL_NAME_LENGTH, MIN_SKILL_LEVELS } from "@/lib/skills";

/**
 * Connecting organisations into one skill space, so they share their skill
 * list, level names and people's skills. An owner or admin of one
 * organisation creates a code; an owner or admin of the other enters it.
 * Either can disconnect later, and the leaving organisation keeps a copy of
 * the shared skills.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  return supabaseAdmin as Loose;
}

/**
 * Owners and admins. The Admin title counts even when the stored role is still
 * "member" (titles can change without the role following).
 */
async function requireOwnerOrAdmin(sb: Loose, orgId: string, userId: string) {
  const { data: byRole } = await sb.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _min: "admin",
  });
  if (byRole === true) return;
  const db = await admin();
  const { data: member } = await db
    .from("organization_members")
    .select("organization_titles(name)")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  const title = (member?.organization_titles as { name?: string } | null)?.name;
  if (title !== "Owner" && title !== "Admin") {
    throw new Error("Only an owner or admin of the organisation can do this");
  }
}

// No 0/O or 1/I, so a code read aloud or typed from a screenshot comes out right.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

const orgOnly = (d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d);

/** A one-time code, valid 7 days, that another organisation's owner enters to connect. */
export const createSkillConnectionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgOnly)
  .handler(async ({ data, context }) => {
    await requireOwnerOrAdmin(context.supabase, data.orgId, context.userId);
    const db = await admin();
    const code = newCode();
    const { data: row, error } = await db
      .from("skill_connection_codes")
      .insert({ code, org_id: data.orgId, created_by: context.userId })
      .select("code, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { code: row.code as string, expiresAt: row.expires_at as string };
  });

/** Connects this organisation (and anything it's connected to) to the code's organisation. */
export const connectSkillSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; code: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, "That doesn't look like a connection code"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwnerOrAdmin(context.supabase, data.orgId, context.userId);
    const db = await admin();
    const code = data.code.includes("-")
      ? data.code
      : `${data.code.slice(0, 4)}-${data.code.slice(4)}`;
    const { data: row, error } = await db
      .from("skill_connection_codes")
      .select(
        "code, org_id, expires_at, used_at, organizations!skill_connection_codes_org_id_fkey(name)",
      )
      .eq("code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      throw new Error("That code isn't valid any more. Ask for a new one.");
    }
    const inviter = row.org_id as string;
    if (inviter === data.orgId) throw new Error("That code is your own organisation's");
    if ((await spaceRoot(db, inviter)) === (await spaceRoot(db, data.orgId))) {
      throw new Error("These organisations are already connected");
    }
    const { error: cError } = await db.rpc("connect_skill_spaces", {
      _joining: data.orgId,
      _inviter: inviter,
    });
    if (cError) throw new Error(cError.message);
    await db
      .from("skill_connection_codes")
      .update({ used_at: new Date().toISOString(), used_by_org: data.orgId })
      .eq("code", code);
    return { connectedTo: (row.organizations?.name as string | undefined) ?? "the organisation" };
  });

/** Takes this organisation out of its skill space; it keeps a copy of the shared skills. */
export const disconnectSkillSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgOnly)
  .handler(async ({ data, context }) => {
    await requireOwnerOrAdmin(context.supabase, data.orgId, context.userId);
    const db = await admin();
    const { error } = await db.rpc("disconnect_skill_space", { _org: data.orgId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Saves the skill level names, or resets them with null. Connected
 * organisations share one set, stored on the space's root. Needs the
 * "rename organisation" permission.
 */
export const saveSkillLevelNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; names: string[] | null }) =>
    z
      .object({
        orgId: z.string().uuid(),
        names: z
          .array(z.string().trim().min(1).max(MAX_SKILL_LEVEL_NAME_LENGTH))
          .min(MIN_SKILL_LEVELS)
          .max(MAX_SKILL_LEVELS)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc(
      "has_org_permission" as never,
      {
        _org: data.orgId,
        _user: context.userId,
        _perm: "rename_org",
      } as never,
    );
    if (ok !== true) throw new Error("Your title doesn't allow changing organisation settings");
    const db = await admin();
    const root = await spaceRoot(db, data.orgId);
    const { error } = await db
      .from("organizations")
      .update({ skill_level_names: data.names })
      .eq("id", root);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
