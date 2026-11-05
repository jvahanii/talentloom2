import { supabase } from "@/integrations/supabase/app-client";

/**
 * Where teams place themselves on the org topology map: a 4×4 grid of scope of
 * skills mandate (across: 1 functional … 4 expanding) by scope of work mandate
 * (up: 1 tasks … 4 whole solution), now and, optionally, where they're heading.
 * A spot is free within its square: x runs 0–4 across and y 0–4 up, so
 * x 2.5 lies in the third column. A team's members can place it, and so can
 * anyone who may change titles.
 */
export type Spot = { x: number; y: number };
export type Cell = { skills: number; work: number };
export type TeamPlacement = { teamId: string; now: Spot | null; target: Spot | null };

/** The square a spot lies in. */
export const cellOf = (s: Spot): Cell => ({
  skills: Math.min(4, Math.floor(s.x) + 1),
  work: Math.min(4, Math.floor(s.y) + 1),
});

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const topologyKey = (orgId: string | null) => ["org-team-topology", orgId];

type Row = {
  team_id: string;
  work: number | null;
  skills: number | null;
  target_work: number | null;
  target_skills: number | null;
  now_x: number | null;
  now_y: number | null;
  target_x: number | null;
  target_y: number | null;
};

/** A stored spot, or the middle of its square for places saved before spots existed. */
function spotOf(x: number | null, y: number | null, skills: number | null, work: number | null) {
  if (x !== null && y !== null) return { x, y };
  if (skills && work) return { x: skills - 0.5, y: work - 0.5 };
  return null;
}

export async function fetchTopology(orgId: string): Promise<TeamPlacement[]> {
  const { data, error } = await db
    .from("org_team_topology")
    .select("team_id, work, skills, target_work, target_skills, now_x, now_y, target_x, target_y")
    .eq("org_id", orgId);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    teamId: r.team_id,
    now: spotOf(r.now_x, r.now_y, r.skills, r.work),
    target: spotOf(r.target_x, r.target_y, r.target_skills, r.target_work),
  }));
}

/** Saves a team's spot now and its target; null clears one. */
export async function placeTeam(
  orgId: string,
  teamId: string,
  now: Spot | null,
  target: Spot | null,
  updatedBy: string | null,
) {
  const nowCell = now ? cellOf(now) : null;
  const targetCell = target ? cellOf(target) : null;
  const { error } = await db.from("org_team_topology").upsert({
    team_id: teamId,
    org_id: orgId,
    work: nowCell?.work ?? null,
    skills: nowCell?.skills ?? null,
    now_x: now?.x ?? null,
    now_y: now?.y ?? null,
    target_work: targetCell?.work ?? null,
    target_skills: targetCell?.skills ?? null,
    target_x: target?.x ?? null,
    target_y: target?.y ?? null,
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
