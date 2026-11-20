import { supabase } from "@/integrations/supabase/app-client";

/**
 * Bonus schemes. A scheme runs for a period and pays each participant a
 * target (a per cent of their annual salary, or a fixed sum) scaled by how
 * well things went on its weighted measures. A measure is either
 * company-wide, with one result for everyone (EBITDA, cash flow), or
 * individual, with a result per person (eNPS, own sales). Results are per
 * cents of the measure's goal (100 = on target). The weighted average is the
 * share of the target paid: nothing below the threshold, and at most the
 * cap. Annual salary comes from the People page's salaries. Every member may
 * read and edit for now.
 */

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SchemeKind = "percent" | "fixed";
export type SchemeStatus = "draft" | "active" | "closed";
export type Scope = "company" | "individual";

export type Scheme = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  kind: SchemeKind;
  target: number;
  currency: string;
  /** Nothing is paid below this weighted achievement (per cent). */
  threshold_pct: number;
  /** The most paid, as a per cent of the target. */
  max_payout_pct: number;
  status: SchemeStatus;
};
export type Criterion = {
  id: string;
  scheme_id: string;
  name: string;
  weight: number;
  position: number;
  scope: Scope;
  /** For a company-wide measure: its one result. */
  company_achievement: number | null;
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
      "id, name, description, start_date, end_date, kind, target, currency, threshold_pct, max_payout_pct, status",
    ).order("start_date", { ascending: false }),
    q("bonus_criteria", "id, scheme_id, name, weight, position, scope, company_achievement").order(
      "position",
    ),
    q("bonus_participants", "scheme_id, person_id, target_override"),
    q("bonus_results", "scheme_id, person_id, criterion_id, achievement"),
  ]);
  for (const x of [s, c, p, r]) if (x.error) throw x.error;
  return {
    schemes: ((s.data ?? []) as Scheme[]).map((x) => ({
      ...x,
      target: Number(x.target),
      threshold_pct: Number(x.threshold_pct),
      max_payout_pct: Number(x.max_payout_pct),
    })),
    criteria: ((c.data ?? []) as Criterion[]).map((x) => ({
      ...x,
      weight: Number(x.weight),
      company_achievement: n(x.company_achievement),
    })),
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
    threshold_pct: s.threshold_pct,
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

export type MeasureInput = { id?: string; name: string; weight: number; scope: Scope };

/** Makes a scheme's measures these, in this order: updating, adding and deleting. */
export async function saveCriteria(
  orgId: string,
  schemeId: string,
  current: Criterion[],
  next: MeasureInput[],
) {
  const keep = new Set(next.flatMap((c) => (c.id ? [c.id] : [])));
  const gone = current.filter((c) => c.scheme_id === schemeId && !keep.has(c.id)).map((c) => c.id);
  if (gone.length) {
    const { error } = await db.from("bonus_criteria").delete().in("id", gone);
    if (error) throw error;
  }
  for (const [position, c] of next.entries()) {
    const row = { name: c.name.trim().slice(0, 100), weight: c.weight, position, scope: c.scope };
    const { error } = c.id
      ? await db.from("bonus_criteria").update(row).eq("id", c.id)
      : await db.from("bonus_criteria").insert({ org_id: orgId, scheme_id: schemeId, ...row });
    if (error) throw error;
  }
}

/** A company-wide measure's one result, or none (null). */
export async function setCompanyResult(criterionId: string, achievement: number | null) {
  const { error } = await db
    .from("bonus_criteria")
    .update({ company_achievement: achievement })
    .eq("id", criterionId);
  if (error) throw error;
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

/** Sets someone's result on an individual measure, or clears it (null). */
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

export type PayoutState = "ok" | "pending" | "no-salary" | "below-threshold";

export type Payout = {
  /** Weighted achievement in per cent, counting missing results as 0; null with no measures. */
  achievement: number | null;
  /** Measures still without a result for this person (company-wide ones included). */
  missing: number;
  /** The target sum, and its currency; null if it needs a salary that isn't set. */
  targetAmount: number | null;
  currency: string;
  /** What is paid; null until it can be worked out. */
  payout: number | null;
  capped: boolean;
  state: PayoutState;
};

/**
 * What one participant earns. A per-cent target is a share of their annual
 * salary (in the salary's currency). Missing results count as zero, so the
 * figure is final only when nothing is missing.
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
  const mine = new Map(results.map((r) => [r.criterion_id, r.achievement]));
  const resultOf = (c: Criterion) =>
    c.scope === "company" ? c.company_achievement : (mine.get(c.id) ?? null);
  const missing = criteria.filter((c) => resultOf(c) === null).length;
  const achievement = totalWeight
    ? criteria.reduce((s, c) => s + c.weight * (resultOf(c) ?? 0), 0) / totalWeight
    : null;
  let targetAmount: number | null;
  let currency = scheme.currency;
  if (scheme.kind === "fixed") targetAmount = target;
  else if (annualSalary) {
    targetAmount = (annualSalary.amount * target) / 100;
    currency = annualSalary.currency;
  } else targetAmount = null;
  const base = { achievement, missing, targetAmount, currency };
  if (targetAmount === null) return { ...base, payout: null, capped: false, state: "no-salary" };
  if (achievement === null) return { ...base, payout: null, capped: false, state: "pending" };
  if (achievement < scheme.threshold_pct)
    return { ...base, payout: 0, capped: false, state: missing ? "pending" : "below-threshold" };
  const share = Math.min(achievement, scheme.max_payout_pct);
  return {
    ...base,
    payout: Math.round(((targetAmount * share) / 100) * 100) / 100,
    capped: achievement > scheme.max_payout_pct,
    state: missing ? "pending" : "ok",
  };
}
