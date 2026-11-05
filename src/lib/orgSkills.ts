import { supabase } from "@/integrations/supabase/app-client";

/**
 * Skills on an organisation's own list, kept even when nobody has them yet —
 * a skill the organisation wants people to have or learn. People's skills
 * still live on their profiles; this list only adds skills with no holders.
 * Everyone in the organisation can read it; changes need "change titles".
 */
export type OrgSkill = { id: string; name: string };

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const orgSkillListKey = (orgId: string | null) => ["org-skill-list", orgId];

export async function fetchOrgSkills(orgId: string): Promise<OrgSkill[]> {
  const { data, error } = await db
    .from("org_skills")
    .select("id, name")
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgSkill[];
}

/** Adds a skill to the list; one already there (in any case) is left as it is. */
export async function addOrgSkill(orgId: string, name: string, createdBy: string | null) {
  const { error } = await db
    .from("org_skills")
    .insert({ org_id: orgId, name: name.trim(), created_by: createdBy });
  if (error && error.code !== "23505") {
    throw new Error(
      error.code === "42501"
        ? "Your title doesn't allow adding skills to the organisation"
        : error.message,
    );
  }
}

export async function removeOrgSkill(id: string) {
  const { data, error } = await db.from("org_skills").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length)
    throw new Error("Your title doesn't allow removing skills from the organisation");
}
