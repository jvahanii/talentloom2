import { supabase } from "@/integrations/supabase/app-client";

/**
 * Teams inside an organisation. A person can be in several. Everyone in the
 * organisation can see them; creating, editing and staffing them needs the
 * "change titles" permission, and only the organisation's members can be in
 * one (row-level security on org_teams and org_team_members). Leaving the
 * organisation leaves its teams.
 */
export type Team = { id: string; name: string; description: string | null; members: string[] };

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const teamsKey = (orgId: string | null) => ["org-teams", orgId];
export const MAX_TEAM_NAME = 100;
export const MAX_TEAM_DESCRIPTION = 1000;

export async function fetchTeams(orgId: string): Promise<Team[]> {
  const { data, error } = await db
    .from("org_teams")
    .select("id, name, description, org_team_members(user_id)")
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      name: string;
      description: string | null;
      org_team_members: { user_id: string }[];
    }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    members: t.org_team_members.map((m) => m.user_id),
  }));
}

/** Postgres' wording for a taken name, in plain words. */
function explain(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("There's already a team with that name");
  return new Error(error.message);
}

export async function createTeam(orgId: string, name: string, description: string | null) {
  const { error } = await db
    .from("org_teams")
    .insert({ org_id: orgId, name: name.trim(), description: description?.trim() || null });
  if (error) throw explain(error);
}

export async function updateTeam(
  id: string,
  change: { name?: string; description?: string | null },
) {
  const { data, error } = await db.from("org_teams").update(change).eq("id", id).select("id");
  if (error) throw explain(error);
  if (!data?.length) throw new Error("Your title doesn't allow editing teams");
}

export async function deleteTeam(id: string) {
  const { data, error } = await db.from("org_teams").delete().eq("id", id).select("id");
  if (error) throw explain(error);
  if (!data?.length) throw new Error("Your title doesn't allow deleting teams");
}

export async function addToTeam(orgId: string, teamId: string, userId: string) {
  const { error } = await db
    .from("org_team_members")
    .insert({ org_id: orgId, team_id: teamId, user_id: userId });
  if (error && error.code !== "23505") throw explain(error);
}

export async function removeFromTeam(teamId: string, userId: string) {
  const { error } = await db
    .from("org_team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) throw explain(error);
}

/**
 * Teams of teams: a group made of whole teams. Only two levels exist — a group
 * holds teams, never other groups (enforced by the schema: links point from a
 * group to a team). A team can belong to several groups.
 */
export type TeamGroup = { id: string; name: string; description: string | null; teams: string[] };

export const teamGroupsKey = (orgId: string | null) => ["org-team-groups", orgId];

function explainGroup(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("There's already a team of teams with that name");
  return new Error(error.message);
}

export async function fetchTeamGroups(orgId: string): Promise<TeamGroup[]> {
  const { data, error } = await db
    .from("org_team_groups")
    .select("id, name, description, org_team_group_links(team_id)")
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      name: string;
      description: string | null;
      org_team_group_links: { team_id: string }[];
    }[]
  ).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    teams: g.org_team_group_links.map((l) => l.team_id),
  }));
}

export async function createTeamGroup(orgId: string, name: string, teamIds: string[]) {
  const { data, error } = await db
    .from("org_team_groups")
    .insert({ org_id: orgId, name: name.trim() })
    .select("id")
    .single();
  if (error) throw explainGroup(error);
  for (const t of teamIds) await addTeamToGroup(orgId, data.id, t);
}

export async function updateTeamGroup(id: string, change: { name?: string; description?: string | null }) {
  const { data, error } = await db.from("org_team_groups").update(change).eq("id", id).select("id");
  if (error) throw explainGroup(error);
  if (!data?.length) throw new Error("Your title doesn't allow editing teams");
}

export async function deleteTeamGroup(id: string) {
  const { data, error } = await db.from("org_team_groups").delete().eq("id", id).select("id");
  if (error) throw explainGroup(error);
  if (!data?.length) throw new Error("Your title doesn't allow deleting teams");
}

export async function addTeamToGroup(orgId: string, groupId: string, teamId: string) {
  const { error } = await db
    .from("org_team_group_links")
    .insert({ org_id: orgId, group_id: groupId, team_id: teamId });
  if (error && error.code !== "23505") throw explainGroup(error);
}

export async function removeTeamFromGroup(groupId: string, teamId: string) {
  const { error } = await db
    .from("org_team_group_links")
    .delete()
    .eq("group_id", groupId)
    .eq("team_id", teamId);
  if (error) throw explainGroup(error);
}
