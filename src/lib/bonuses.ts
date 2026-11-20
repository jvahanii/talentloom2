import { supabase } from "@/integrations/supabase/app-client";

/**
 * Bonus schemes. A scheme runs for a period and pays each participant a
 * target (a per cent of their annual salary, or a fixed sum) scaled by how
 * well they did: each weighted criterion is achieved to some per cent (100
 * = on target), the weighted average sets the share of the target paid, and
 * the payout is capped at max_payout_pct of the target. Annual salary comes
 * from the People page's salaries. Every member may read and edit for now.
 */

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SchemeKind = "percent" | "fixed";
export type SchemeStatus = "draft" | "active" | "closed";

export type Scheme = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  kind: SchemeKind;
  target: number;
  currency: string;
  max_payout_pct: number;
  status: SchemeStatus;
};
export type Criterion = {
  id: string;
  scheme_id: string;
  name: string;
  weight: number;
  position: number;
};
export type Participant = { scheme_id: string; person_id: string; target_override: number | null };
export type Result = {
  scheme_id: string;
  person_id: string;
  criterion_id: string;
  achievement: number;
};

export type Bonuses = {
  schemes: Scheme[];
  criteria: Criterion[];
  participants: Participant[];
  results: Result[];
};

export const bonusesKey = (orgId: string | null) => ["bonuses", orgId];

export const STATUS_LABEL: Record<SchemeStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchBonuses(orgId: string): Promise<Bonuses> {
  const q = (table: string, cols: string) => db.from(table).select(cols).eq("org_id", orgId);
  const [s, c, p, r] = await Promise.all([
    q(
      "bonus_schemes",
      "id, name, description, start_date, end_date, kind, target, currency, max_payout_pct, status",
    ).order("start_date", { ascending: false }),
    q("bonus_criteria", "id, scheme_id, name, weight, position").order("position"),
    q("bonus_participants", "scheme_id, person_id, target_override"),
    q("bonus_results", "scheme_id, person_id, criterion_id, achievement"),
  ]);
  for (const x of [s, c, p, r]) if (x.error) throw x.error;
  return {
    schemes: ((s.data ?? []) as Scheme[]).map((x) => ({
      ...x,
      target: Number(x.target),
      max_payout_pct: Number(x.max_payout_pct),
    })),
    criteria: ((c.data ?? []) as Criterion[]).map((x) => ({ ...x, weight: Number(x.weight) })),
    participants: ((p.data ?? []) as Participant[]).map((x) => ({
      ...x,
      target_override: n(x.target_override),
    })),
    results: ((r.data ?? []) as Result[]).map((x) => ({
      ...x,
      achievement: Number(x.achievement),
    })),
  };
}

export type SchemeInput = Omit<Scheme, "id" | "description"> & { id?: string; description: string };

/** Saves a scheme and returns its id. */
export async function saveScheme(orgId: string, s: SchemeInput): Promise<string> {
  const row = {
    name: s.name.trim().slice(0, 100),
    description: s.description.trim().slice(0, 2000) || null,
    start_date: s.start_date,
    end_date: s.end_date,
    kind: s.kind,
    target: s.target,
    currency: s.currency,
    max_payout_pct: s.max_payout_pct,
    status: s.status,
  };
  if (s.id) {
    const { error } = await db.from("bonus_schemes").update(row).eq("id", s.id);
    if (error) throw error;
    return s.id;
  }
  const { data, error } = await db
    .from("bonus_schemes")
    .insert({ org_id: orgId, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteScheme(id: string) {
  const { error } = await db.from("bonus_schemes").delete().eq("id", id);
  if (error) throw error;
}

/** Makes a scheme's criteria these, in this order: updating, adding and deleting. */
export async function saveCriteria(
  orgId: string,
  schemeId: string,
  current: Criterion[],
  next: { id?: string; name: string; weight: number }[],
) {
  const keep = new Set(next.flatMap((c) => (c.id ? [c.id] : [])));
  const gone = current.filter((c) => c.scheme_id === schemeId && !keep.has(c.id)).map((c) => c.id);
  if (gone.length) {
    const { error } = await db.from("bonus_criteria").delete().in("id", gone);
    if (error) throw error;
  }
  for (const [position, c] of next.entries()) {
    const row = { name: c.name.trim().slice(0, 100), weight: c.weight, position };
    const { error } = c.id
      ? await db.from("bonus_criteria").update(row).eq("id", c.id)
      : await db.from("bonus_criteria").insert({ org_id: orgId, scheme_id: schemeId, ...row });
    if (error) throw error;
  }
}

export async function addParticipants(orgId: string, schemeId: string, personIds: string[]) {
  if (!personIds.length) return;
  const { error } = await db.from("bonus_participants").upsert(
    personIds.map((p) => ({ org_id: orgId, scheme_id: schemeId, person_id: p })),
    { onConflict: "scheme_id,person_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function removeParticipant(schemeId: string, personId: string) {
  const { error } = await db
    .from("bonus_participants")
    .delete()
    .eq("scheme_id", schemeId)
    .eq("person_id", personId);
  if (error) throw error;
}

export async function setTargetOverride(schemeId: string, personId: string, target: number | null) {
  const { error } = await db
    .from("bonus_participants")
    .update({ target_override: target })
    .eq("scheme_id", schemeId)
    .eq("person_id", personId);
  if (error) throw error;
}

/** Sets how far someone got on a criterion, or clears it (null). */
export async function setResult(
  orgId: string,
  schemeId: string,
  personId: string,
  criterionId: string,
  achievement: number | null,
) {
  const { error } =
    achievement === null
      ? await db
          .from("bonus_results")
          .delete()
          .eq("person_id", personId)
          .eq("criterion_id", criterionId)
      : await db.from("bonus_results").upsert({
          org_id: orgId,
          scheme_id: schemeId,
          person_id: personId,
          criterion_id: criterionId,
          achievement,
        });
  if (error) throw error;
}

// ---------------------------------------------------------------- payout

export type Payout = {
  /** Weighted achievement over the criteria with a result, in per cent; null with none. */
  achievement: number | null;
  /** How many criteria have a result. */
  scored: number;
  /** The target sum, and the currency it is in; null if it needs a salary that isn't set. */
  targetAmount: number | null;
  currency: string;
  payout: number | null;
  capped: boolean;
};

/**
 * What one participant earns. A per-cent target is a share of their annual
 * salary (in the salary's currency); criteria without a result yet count as
 * zero, so the payout grows as results come in.
 */
export function payoutOf(args: {
  scheme: Scheme;
  criteria: Criterion[];
  results: Result[];
  participant: Participant;
  annualSalary: { amount: number; currency: string } | null;
}): Payout {
  const { scheme, criteria, results, participant, annualSalary } = args;
  const target = participant.target_override ?? scheme.target;
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const byCriterion = new Map(results.map((r) => [r.criterion_id, r.achievement]));
  const scored = criteria.filter((c) => byCriterion.has(c.id)).length;
  const achievement =
    scored && totalWeight
      ? criteria.reduce((s, c) => s + c.weight * (byCriterion.get(c.id) ?? 0), 0) / totalWeight
      : null;
  let targetAmount: number | null;
  let currency = scheme.currency;
  if (scheme.kind === "fixed") targetAmount = target;
  else if (annualSalary) {
    targetAmount = (annualSalary.amount * target) / 100;
    currency = annualSalary.currency;
  } else targetAmount = null;
  if (targetAmount === null || achievement === null)
    return { achievement, scored, targetAmount, currency, payout: null, capped: false };
  const share = Math.min(achievement, scheme.max_payout_pct);
  return {
    achievement,
    scored,
    targetAmount,
    currency,
    payout: Math.round(((targetAmount * share) / 100) * 100) / 100,
    capped: achievement > scheme.max_payout_pct,
  };
}
