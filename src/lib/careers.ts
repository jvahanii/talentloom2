import { supabase } from "@/integrations/supabase/app-client";
import type { Skill } from "@/lib/skills";

/**
 * Career paths. A path (career_tracks) is a ladder of steps, level 1 first:
 * going up it is a vertical move. Moves (career_moves) link a step to a step
 * elsewhere, usually on another path: a horizontal move. A step asks for
 * skills at least at some level (career_step_skills, the levels of the
 * Skills page) and may have a salary range. Each person can be placed on one
 * step (career_assignments); how ready they are for a step is worked out
 * from their skills. Every member may read and edit everything for now.
 */

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Track = { id: string; name: string; description: string | null; position: number };
export type SalaryPeriod = "monthly" | "annual" | "hourly";
export type Step = {
  id: string;
  track_id: string;
  name: string;
  description: string | null;
  level: number;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  salary_period: SalaryPeriod;
};
export type StepSkill = { step_id: string; skill: string; min_level: number };
export type Move = { id: string; from_step: string; to_step: string; note: string | null };
export type Assignment = { person_id: string; step_id: string; since: string };

export type Careers = {
  tracks: Track[];
  steps: Step[];
  skills: StepSkill[];
  moves: Move[];
  assignments: Assignment[];
};

export const careersKey = (orgId: string | null) => ["careers", orgId];

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchCareers(orgId: string): Promise<Careers> {
  const q = (table: string, cols: string) => db.from(table).select(cols).eq("org_id", orgId);
  const [t, s, k, m, a] = await Promise.all([
    q("career_tracks", "id, name, description, position").order("position").order("created_at"),
    q(
      "career_steps",
      "id, track_id, name, description, level, salary_min, salary_max, currency, salary_period",
    ).order("level"),
    q("career_step_skills", "step_id, skill, min_level"),
    q("career_moves", "id, from_step, to_step, note"),
    q("career_assignments", "person_id, step_id, since"),
  ]);
  for (const r of [t, s, k, m, a]) if (r.error) throw r.error;
  return {
    tracks: t.data ?? [],
    steps: ((s.data ?? []) as Step[]).map((x) => ({
      ...x,
      salary_min: num(x.salary_min),
      salary_max: num(x.salary_max),
    })),
    skills: k.data ?? [],
    moves: m.data ?? [],
    assignments: a.data ?? [],
  };
}

export const MAX_NAME = 100;
export const MAX_DESCRIPTION = 2000;

export async function saveTrack(
  orgId: string,
  t: { id?: string; name: string; description: string; position?: number },
) {
  const row = {
    name: t.name.trim().slice(0, MAX_NAME),
    description: t.description.trim().slice(0, 1000) || null,
  };
  const { error } = t.id
    ? await db.from("career_tracks").update(row).eq("id", t.id)
    : await db.from("career_tracks").insert({ org_id: orgId, position: t.position ?? 0, ...row });
  if (error) throw error;
}

export async function deleteTrack(id: string) {
  const { error } = await db.from("career_tracks").delete().eq("id", id);
  if (error) throw error;
}

export type StepInput = Omit<Step, "id" | "description"> & {
  id?: string;
  description: string;
  skills: { skill: string; min_level: number }[];
};

/** Saves a step and replaces the skills it asks for. */
export async function saveStep(orgId: string, s: StepInput) {
  const row = {
    track_id: s.track_id,
    name: s.name.trim().slice(0, MAX_NAME),
    description: s.description.trim().slice(0, MAX_DESCRIPTION) || null,
    level: s.level,
    salary_min: s.salary_min,
    salary_max: s.salary_max,
    currency: s.currency,
    salary_period: s.salary_period,
  };
  let id = s.id;
  if (id) {
    const { error } = await db.from("career_steps").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await db
      .from("career_steps")
      .insert({ org_id: orgId, ...row })
      .select("id")
      .single();
    if (error) throw error;
    id = (data as { id: string }).id;
  }
  const { error: dError } = await db.from("career_step_skills").delete().eq("step_id", id);
  if (dError) throw dError;
  const skills = [
    ...new Map(s.skills.filter((k) => k.skill.trim()).map((k) => [k.skill.trim(), k])).values(),
  ];
  if (skills.length) {
    const { error } = await db.from("career_step_skills").insert(
      skills.map((k) => ({
        org_id: orgId,
        step_id: id,
        skill: k.skill.trim().slice(0, 60),
        min_level: k.min_level,
      })),
    );
    if (error) throw error;
  }
}

export async function deleteStep(id: string) {
  const { error } = await db.from("career_steps").delete().eq("id", id);
  if (error) throw error;
}

export async function addMove(orgId: string, from: string, to: string, note: string) {
  const { error } = await db.from("career_moves").insert({
    org_id: orgId,
    from_step: from,
    to_step: to,
    note: note.trim().slice(0, 500) || null,
  });
  if (error) throw error;
}

export async function deleteMove(id: string) {
  const { error } = await db.from("career_moves").delete().eq("id", id);
  if (error) throw error;
}

/** Places someone on a step, or takes them off every path (null). */
export async function assign(
  orgId: string,
  personId: string,
  stepId: string | null,
  since: string,
) {
  const { error } = stepId
    ? await db
        .from("career_assignments")
        .upsert({ org_id: orgId, person_id: personId, step_id: stepId, since })
    : await db.from("career_assignments").delete().eq("org_id", orgId).eq("person_id", personId);
  if (error) throw error;
}

// ---------------------------------------------------------------- readiness

export type Readiness = {
  /** Skills asked for and how many are met. */
  total: number;
  met: number;
  /** 0-100; a step asking for nothing counts as fully met. */
  pct: number;
  missing: { skill: string; need: number; have: number | null }[];
};

const norm = (s: string) => s.trim().toLowerCase();

/** How a person's skills measure up to what a step asks for. */
export function readiness(has: Skill[], asks: StepSkill[]): Readiness {
  const levels = new Map(has.map((s) => [norm(s.name), s.level]));
  const missing: Readiness["missing"] = [];
  for (const a of asks) {
    const have = levels.get(norm(a.skill)) ?? null;
    if (have === null || have < a.min_level)
      missing.push({ skill: a.skill, need: a.min_level, have });
  }
  const total = asks.length;
  const met = total - missing.length;
  return { total, met, pct: total ? Math.round((met / total) * 100) : 100, missing };
}

/** The steps someone can go to from a step: up its path, and the moves out of it. */
export function nextSteps(c: Careers, stepId: string) {
  const step = c.steps.find((s) => s.id === stepId);
  if (!step) return { up: null as Step | null, sideways: [] as { step: Step; move: Move }[] };
  const higher = c.steps
    .filter((s) => s.track_id === step.track_id && s.level > step.level)
    .sort((a, b) => a.level - b.level);
  const sideways = c.moves
    .filter((m) => m.from_step === stepId)
    .flatMap((m) => {
      const to = c.steps.find((s) => s.id === m.to_step);
      return to ? [{ step: to, move: m }] : [];
    });
  return { up: higher[0] ?? null, sideways };
}
