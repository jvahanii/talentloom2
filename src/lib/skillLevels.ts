import { supabase } from "@/integrations/supabase/app-client";
import { skillsByUser, type MemberSkillRow, type Skill } from "@/lib/skills";

/**
 * People's skills (org_member_skills) and the skill space they live in.
 * Organisations can be connected into one skill space that shares its skill
 * list, level names and people's skills; rows are stored on the space's root
 * organisation. An organisation that isn't connected is its own space.
 */

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SkillSpace = {
  /** The organisation the space's skills are stored on. */
  root: string;
  levelNames: unknown;
  /** Every organisation in the space, this one included. */
  orgs: { id: string; name: string }[];
};

export const skillSpaceKey = (orgId: string | null) => ["skill-space", orgId];

const spaces = new Map<string, Promise<SkillSpace>>();

/**
 * The organisation's skill space; remembered until forgetSkillSpaces(), or
 * asked again with `fresh` (level names can change while connected).
 */
export function fetchSkillSpace(orgId: string, fresh = false): Promise<SkillSpace> {
  let found = fresh ? undefined : spaces.get(orgId);
  if (!found) {
    found = (async () => {
      const { data, error } = await db.rpc("get_skill_space", { _org: orgId });
      if (error) throw error;
      const d = (data ?? {}) as { root?: string; level_names?: unknown; orgs?: SkillSpace["orgs"] };
      return { root: d.root ?? orgId, levelNames: d.level_names ?? null, orgs: d.orgs ?? [] };
    })();
    found.catch(() => spaces.delete(orgId));
    spaces.set(orgId, found);
  }
  return found;
}

/** After connecting or disconnecting organisations. */
export function forgetSkillSpaces() {
  spaces.clear();
}

/** Skills in the organisation's space by person; pass ids to fetch only those people. */
export async function fetchMemberSkills(
  orgId: string,
  userIds?: string[],
): Promise<Map<string, Skill[]>> {
  if (userIds && !userIds.length) return new Map();
  const { root } = await fetchSkillSpace(orgId);
  let query = db
    .from("org_member_skills")
    .select("user_id, skill, level, position")
    .eq("org_id", root);
  if (userIds) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) throw error;
  return skillsByUser((data ?? []) as MemberSkillRow[]);
}
