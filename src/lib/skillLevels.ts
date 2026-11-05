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

/**
 * Sets one person's level in one skill: a single update of that row, straight
 * to the database (no server round trip). Row-level security allows it for
 * yourself or with "change titles", and the history trigger records it.
 */
export async function setMemberSkillLevel(
  orgId: string,
  userId: string,
  skill: string,
  level: number | null,
): Promise<void> {
  const { root } = await fetchSkillSpace(orgId);
  const { data, error } = await db
    .from("org_member_skills")
    .update({ level, updated_at: new Date().toISOString() })
    .eq("org_id", root)
    .eq("user_id", userId)
    .ilike(
      "skill",
      skill.replace(/[\\%_]/g, (c) => `\\${c}`),
    )
    .select("skill");
  if (error) throw error;
  if (!data?.length) throw new Error("Your title doesn't allow changing this person's skills");
}

/**
 * A recorded level of a person's skill at a moment (null: no level);
 * `removed` marks the skill being taken off their list.
 */
export type SkillHistoryPoint = {
  userId: string;
  skill: string;
  level: number | null;
  removed: boolean;
  at: number;
};

/** Level changes of these people's skills in the organisation's space, oldest first. */
export async function fetchSkillHistory(
  orgId: string,
  userIds: string[],
): Promise<SkillHistoryPoint[]> {
  if (!userIds.length) return [];
  const { root } = await fetchSkillSpace(orgId);
  const { data, error } = await db
    .from("org_member_skill_history")
    .select("user_id, skill, level, removed, changed_at")
    .eq("org_id", root)
    .in("user_id", userIds)
    .order("changed_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      user_id: string;
      skill: string;
      level: number | null;
      removed: boolean | null;
      changed_at: string;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    skill: r.skill,
    level: r.level,
    removed: !!r.removed,
    at: new Date(r.changed_at).getTime(),
  }));
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
