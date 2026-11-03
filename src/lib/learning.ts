import { supabase } from "@/integrations/supabase/app-client";

/**
 * "Learning with" groups: people in an organisation who learn a skill together.
 * A group belongs to one skill (its `topic`), and a person is in at most one
 * group per skill. Row-level security lets any member of the organisation
 * change its groups, and only its own members can be in them.
 */
export type LearningGroup = { id: string; topic: string; members: string[] };

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const learningGroupsKey = (orgId: string | null) => ["learning-groups", orgId];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function fetchLearningGroups(orgId: string): Promise<LearningGroup[]> {
  const { data, error } = await db
    .from("learning_groups")
    .select("id, topic, learning_group_members(user_id)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      topic: string | null;
      learning_group_members: { user_id: string }[];
    }[]
  ).map((g) => ({
    id: g.id,
    topic: g.topic ?? "",
    members: g.learning_group_members.map((m) => m.user_id),
  }));
}

export function groupOf(groups: LearningGroup[], topic: string, userId: string) {
  return groups.find((g) => same(g.topic, topic) && g.members.includes(userId)) ?? null;
}

/** Takes a person out of a group, and removes the group once fewer than two are left. */
export async function leaveLearningGroup(group: LearningGroup, userId: string) {
  if (group.members.filter((m) => m !== userId).length < 2) {
    const { error } = await db.from("learning_groups").delete().eq("id", group.id);
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("learning_group_members")
    .delete()
    .eq("group_id", group.id)
    .eq("user_id", userId);
  if (error) throw error;
}

async function join(groupId: string, userId: string) {
  const { error } = await db
    .from("learning_group_members")
    .insert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

/**
 * `mover` was dropped on `target` in a skill. The mover joins the target's
 * group (leaving any other group for that skill); if the target has none, the
 * target joins the mover's; otherwise the two start a new group.
 * Returns false when they already learn together.
 */
export async function learnTogether(opts: {
  orgId: string;
  topic: string;
  mover: string;
  target: string;
  me: string | null;
  groups: LearningGroup[];
}): Promise<boolean> {
  const { orgId, topic, mover, target, me, groups } = opts;
  const moverGroup = groupOf(groups, topic, mover);
  const targetGroup = groupOf(groups, topic, target);
  if (moverGroup && moverGroup.id === targetGroup?.id) return false;

  if (targetGroup) {
    if (moverGroup) await leaveLearningGroup(moverGroup, mover);
    await join(targetGroup.id, mover);
  } else if (moverGroup) {
    await join(moverGroup.id, target);
  } else {
    const { data, error } = await db
      .from("learning_groups")
      .insert({ org_id: orgId, topic, created_by: me })
      .select("id")
      .single();
    if (error) throw error;
    await join(data.id, mover);
    await join(data.id, target);
  }
  return true;
}
