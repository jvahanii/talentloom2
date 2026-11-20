import {
  applySalaryPercentage,
  currentSalaryOf,
  formatSignedPct,
  salaryToMonthlyAnnual,
  subtractCurrencyTotals,
  todayIsoDate,
  type CurrencyCost,
  type SalaryCurrency,
  type SalaryEntry,
} from "@/lib/salaries";
import { subtreeIds, type ChartMember, type ChartNode, type OrgPerson } from "@/lib/orgCharts";

export type BulkSalaryScope =
  | { kind: "company" }
  | { kind: "chart" }
  | { kind: "unit"; unitId: string; includeSubUnits: boolean };

export interface BulkSalaryDraft {
  scope: BulkSalaryScope;
  direction: "increase" | "decrease";
  /** Positive percentage as typed by the user (e.g. "3.5"). */
  percentText: string;
  /** Date the salary change takes effect, "YYYY-MM-DD". */
  effectiveDate: string;
  /** Optional reason saved to each affected person's salary history. */
  note: string;
  /** User IDs explicitly unchecked in the preview list. */
  excludedIds: string[];
}

export interface BulkSalaryPlanRow {
  userId: string;
  name: string;
  email: string | null;
  unitNames: string[];
  current: SalaryEntry;
  newAmount: number;
  diffAmount: number;
  excluded: boolean;
}

export interface BulkSalaryPlan {
  signedPct: number | null;
  pctError: string | null;
  scopeLabel: string;
  rows: BulkSalaryPlanRow[];
  selectedRows: BulkSalaryPlanRow[];
  skippedNoSalary: { userId: string; name: string }[];
  skippedUnlinkedCount: number;
  currentTotals: CurrencyCost[];
  projectedTotals: CurrencyCost[];
  deltaTotals: CurrencyCost[];
}

export function createInitialBulkDraft(
  scope: BulkSalaryScope = { kind: "company" },
): BulkSalaryDraft {
  return {
    scope,
    direction: "increase",
    percentText: "3",
    effectiveDate: todayIsoDate(),
    note: "",
    excludedIds: [],
  };
}

/** Parses user-typed positive percentage (supports "." and ",") into a signed percentage. */
export function parseBulkPercentage(
  raw: string,
  direction: "increase" | "decrease",
): { pct: number | null; error: string | null } {
  const cleaned = raw.trim().replace(/%/g, "").replace(/\s+/g, "").replace(",", ".");
  if (!cleaned) return { pct: null, error: null };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return { pct: null, error: "Enter a percentage greater than 0." };
  }
  if (direction === "decrease" && n >= 100) {
    return { pct: null, error: "Decrease must be less than 100%." };
  }
  if (n > 1000) {
    return { pct: null, error: "Enter a percentage of 1000% or less." };
  }
  const rounded = Math.round(n * 10000) / 10000;
  return { pct: direction === "decrease" ? -rounded : rounded, error: null };
}

function sumCurrencyCosts(costs: CurrencyCost[]): CurrencyCost[] {
  const byCurrency = new Map<SalaryCurrency, { monthly: number; annual: number }>();
  for (const c of costs) {
    const acc = byCurrency.get(c.currency) ?? { monthly: 0, annual: 0 };
    acc.monthly += c.monthly;
    acc.annual += c.annual;
    byCurrency.set(c.currency, acc);
  }
  return [...byCurrency.entries()]
    .map(([currency, v]) => ({
      currency,
      monthly: Math.round(v.monthly * 100) / 100,
      annual: Math.round(v.annual * 100) / 100,
    }))
    .sort((a, b) => b.annual - a.annual);
}

/**
 * Computes the deduplicated list of affected people and monthly/annual budget impact
 * for both the Bulk Salary Adjustment dialog and the live Org chart preview.
 */
export function computeBulkSalaryPlan({
  draft,
  people,
  units,
  members,
  salariesByUser,
  unitsOf,
  hoursPerYear,
  today = todayIsoDate(),
}: {
  draft: BulkSalaryDraft;
  people: OrgPerson[];
  units: ChartNode[];
  members: ChartMember[];
  salariesByUser: Map<string, SalaryEntry[]>;
  unitsOf: Map<string, string[]>;
  hoursPerYear: number;
  today?: string;
}): BulkSalaryPlan {
  const { pct: signedPct, error: pctError } = parseBulkPercentage(
    draft.percentText,
    draft.direction,
  );
  const personById = new Map(people.map((p) => [p.id, p]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const excludedSet = new Set(draft.excludedIds);

  const memberIdsByNode = new Map<string, ChartMember[]>();
  for (const m of members) {
    const list = memberIdsByNode.get(m.node_id) ?? [];
    list.push(m);
    memberIdsByNode.set(m.node_id, list);
  }

  const candidateIds = new Set<string>();
  const unlinkedNames = new Set<string>();
  let scopeLabel = "Whole company";

  const collectFromUnitIds = (unitIds: string[]) => {
    for (const uid of unitIds) {
      const u = unitById.get(uid);
      if (!u) continue;
      if (u.person_id) candidateIds.add(u.person_id);
      else if (u.person_name?.trim()) unlinkedNames.add(u.person_name.trim().toLowerCase());
      for (const m of memberIdsByNode.get(uid) ?? []) {
        if (m.person_id) candidateIds.add(m.person_id);
        else if (m.person_name?.trim()) unlinkedNames.add(m.person_name.trim().toLowerCase());
      }
    }
  };

  if (draft.scope.kind === "company") {
    scopeLabel = "Whole company";
    for (const p of people) candidateIds.add(p.id);
  } else if (draft.scope.kind === "chart") {
    scopeLabel = "Placed in this chart";
    collectFromUnitIds(units.map((u) => u.id));
  } else {
    const target = unitById.get(draft.scope.unitId);
    if (target) {
      const targetIds = draft.scope.includeSubUnits
        ? [...subtreeIds(units, target.id)]
        : [target.id];
      const hasSub = targetIds.length > 1;
      scopeLabel = hasSub ? `${target.role} (+ sub-units)` : target.role;
      collectFromUnitIds(targetIds);
    } else {
      scopeLabel = "Select a unit";
    }
  }

  const rows: BulkSalaryPlanRow[] = [];
  const skippedNoSalary: { userId: string; name: string }[] = [];

  for (const userId of candidateIds) {
    const p = personById.get(userId);
    const name = p?.name?.trim() || p?.email || "Member";
    const cur = currentSalaryOf(salariesByUser.get(userId) ?? [], today);
    if (!cur) {
      skippedNoSalary.push({ userId, name });
      continue;
    }
    const newAmount =
      signedPct !== null ? applySalaryPercentage(cur.entry.amount, signedPct) : cur.entry.amount;
    const diffAmount = Math.round((newAmount - cur.entry.amount) * 100) / 100;
    rows.push({
      userId,
      name,
      email: p?.email ?? null,
      unitNames: unitsOf.get(userId) ?? [],
      current: cur.entry,
      newAmount,
      diffAmount,
      excluded: excludedSet.has(userId),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  skippedNoSalary.sort((a, b) => a.name.localeCompare(b.name));

  const selectedRows = rows.filter((r) => !r.excluded);
  const currentTotals = sumCurrencyCosts(
    selectedRows.map((r) => salaryToMonthlyAnnual(r.current, hoursPerYear)),
  );
  const projectedTotals = sumCurrencyCosts(
    selectedRows.map((r) =>
      salaryToMonthlyAnnual({ ...r.current, amount: r.newAmount }, hoursPerYear),
    ),
  );
  const deltaTotals = subtractCurrencyTotals(projectedTotals, currentTotals);

  return {
    signedPct,
    pctError,
    scopeLabel,
    rows,
    selectedRows,
    skippedNoSalary,
    skippedUnlinkedCount: unlinkedNames.size,
    currentTotals,
    projectedTotals,
    deltaTotals,
  };
}

/** Default history note saved if the user leaves the note blank. */
export function buildBulkSalaryNote(draft: BulkSalaryDraft, plan: BulkSalaryPlan): string {
  const custom = draft.note.trim();
  if (custom) return custom;
  const pctLabel = plan.signedPct !== null ? formatSignedPct(plan.signedPct) : "";
  return `Bulk adjustment (${pctLabel}) · ${plan.scopeLabel}`.slice(0, 240);
}
