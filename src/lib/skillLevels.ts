import { supabase } from "@/integrations/supabase/app-client";
import { levelMapsByUser, type LevelMap } from "@/lib/skills";

/**
 * People's skill levels in one organisation (org_skill_levels). Skill names are
 * on profiles and shared; levels are per organisation, so the same skill can
 * have a level in one organisation and none in another.
 */

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Levels in the organisation by person; pass ids to fetch only those people. */
export async function fetchOrgLevels(
  orgId: string,
  userIds?: string[],
): Promise<Map<string, LevelMap>> {
  if (userIds && !userIds.length) return new Map();
  let query = db.from("org_skill_levels").select("user_id, skill, level").eq("org_id", orgId);
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) throw error;
  return levelMapsByUser((data ?? []) as { user_id: string; skill: string; level: number }[]);
}
