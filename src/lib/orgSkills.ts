import { supabase } from "@/integrations/supabase/app-client";
import { fetchSkillSpace } from "@/lib/skillLevels";

/**
 * Skills on an organisation's own list, kept even when nobody has them yet —
 * a skill the organisation wants people to have or learn. People's skills are
 * in org_member_skills; this list only adds skills with no holders.
 * Connected organisations share one list, stored on their skill space root.
 * Everyone in the space can read it; changes need "change titles".
 * A skill on the list can be marked strategic: one the organisation wants to
 * build up.
 */
export type OrgSkill = { id: string; name: string; strategic: boolean };

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const orgSkillListKey = (orgId: string | null) => ["org-skill-list", orgId];

export async function fetchOrgSkills(orgId: string): Promise<OrgSkill[]> {
  const { root } = await fetchSkillSpace(orgId);
  const { data, error } = await db
    .from("org_skills")
    .select("id, name, strategic")
    .eq("org_id", root)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgSkill[];
}

/** Adds a skill to the list; one already there (in any case) is left as it is. */
export async function addOrgSkill(orgId: string, name: string, createdBy: string | null) {
  const { root } = await fetchSkillSpace(orgId);
  const { error } = await db
    .from("org_skills")
    .insert({ org_id: root, name: name.trim(), created_by: createdBy });
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

/**
 * Marks a skill strategic, or not. A skill that isn't on the list yet (only
 * people have it) is added to it.
 */
export async function setStrategic(
  orgId: string,
  name: string,
  strategic: boolean,
  createdBy: string | null,
) {
  const { root } = await fetchSkillSpace(orgId);
  const { data, error } = await db
    .from("org_skills")
    .update({ strategic })
    .eq("org_id", root)
    .ilike(
      "name",
      name.replace(/[\\%_]/g, (c: string) => `\\${c}`),
    )
    .select("id");
  if (error) throw new Error(error.message);
  if (data?.length || !strategic) return;
  const { error: iError } = await db
    .from("org_skills")
    .insert({ org_id: root, name: name.trim(), created_by: createdBy, strategic: true });
  if (iError) {
    throw new Error(
      iError.code === "42501"
        ? "Your title doesn't allow marking strategic skills"
        : iError.message,
    );
  }
}
