import { supabase } from "@/integrations/supabase/app-client";

/**
 * Where teams place themselves on the org topology map: a 4×4 grid of scope of
 * skills mandate (1 functional … 4 expanding) by scope of work mandate (1 tasks …
 * 4 whole solution), now and, optionally, where they're heading. A team's
 * members can place it, and so can anyone who may change titles.
 */
export type Cell = { skills: number; work: number };
export type TeamPlacement = { teamId: string; now: Cell | null; target: Cell | null };

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const topologyKey = (orgId: string | null) => ["org-team-topology", orgId];

export async function fetchTopology(orgId: string): Promise<TeamPlacement[]> {
  const { data, error } = await db
    .from("org_team_topology")
    .select("team_id, work, skills, target_work, target_skills")
    .eq("org_id", orgId);
  if (error) throw error;
  return (
    (data ?? []) as {
      team_id: string;
      work: number | null;
      skills: number | null;
      target_work: number | null;
      target_skills: number | null;
    }[]
  ).map((r) => ({
    teamId: r.team_id,
    now: r.work && r.skills ? { work: r.work, skills: r.skills } : null,
    target:
      r.target_work && r.target_skills ? { work: r.target_work, skills: r.target_skills } : null,
  }));
}

/** Saves a team's place now and its target; null clears one. */
export async function placeTeam(
  orgId: string,
  teamId: string,
  now: Cell | null,
  target: Cell | null,
  updatedBy: string | null,
) {
  const { error } = await db.from("org_team_topology").upsert({
    team_id: teamId,
    org_id: orgId,
    work: now?.work ?? null,
    skills: now?.skills ?? null,
    target_work: target?.work ?? null,
    target_skills: target?.skills ?? null,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  });
  if (error) {
    throw new Error(
      error.code === "42501"
        ? "Only the team's members, or someone who may change titles, can place this team"
        : error.message,
    );
  }
}
