import { supabase } from "@/integrations/supabase/app-client";
import { skillsByUser, type MemberSkillRow, type Skill } from "@/lib/skills";

/**
 * People's skills in one organisation (org_member_skills): each organisation
 * keeps its own list and levels, so someone in several organisations sets their
 * skills separately in each.
 */

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Skills in the organisation by person; pass ids to fetch only those people. */
export async function fetchMemberSkills(
  orgId: string,
  userIds?: string[],
): Promise<Map<string, Skill[]>> {
  if (userIds && !userIds.length) return new Map();
  let query = db
    .from("org_member_skills")
    .select("user_id, skill, level, position")
    .eq("org_id", orgId);
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) throw error;
  return skillsByUser((data ?? []) as MemberSkillRow[]);
}
