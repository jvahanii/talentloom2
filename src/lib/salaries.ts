import { supabase } from "@/integrations/supabase/app-client";
import { getMyProfileId } from "@/lib/auth";

export const SALARY_CURRENCIES = ["EUR", "USD", "GBP", "SEK", "NOK", "DKK", "CHF"] as const;
export type SalaryCurrency = (typeof SALARY_CURRENCIES)[number];

export const SALARY_PERIODS = ["monthly", "annual", "hourly"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export interface SalaryEntry {
  id: string;
  org_id: string;
  user_id: string;
  amount: number;
  currency: SalaryCurrency;
  period: SalaryPeriod;
  /** Date the salary takes effect, "YYYY-MM-DD". */
  effective_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalaryInput {
  amount: number;
  currency: SalaryCurrency;
  period: SalaryPeriod;
  effective_date: string;
  note: string | null;
}

export const orgSalariesKey = (orgId: string | null) => ["org-salaries", orgId] as const;

const TABLE = "org_member_salary_history";
const LOCAL_PREFIX = "talentloom:org-salaries:v1:";

// The table may live in the external database without being in generated types.ts yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Remembers during this session if the external Supabase project does not yet
 * have `org_member_salary_history`, so we fall back cleanly to local storage
 * instead of repeating 404 requests on every interaction.
 */
let useLocalFallback = false;

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; status?: number };
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    e.status === 404 ||
    msg.includes("Could not find the table") ||
    msg.includes("does not exist")
  );
}

function readLocal(orgId: string): SalaryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${LOCAL_PREFIX}${orgId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRow).filter((x): x is SalaryEntry => x !== null);
  } catch {
    return [];
  }
}

function writeLocal(orgId: string, rows: SalaryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${LOCAL_PREFIX}${orgId}`, JSON.stringify(rows));
  } catch {
    // Ignore storage quota errors.
  }
}

function normalizeRow(raw: unknown): SalaryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = SALARY_CURRENCIES.includes(r.currency as SalaryCurrency)
    ? (r.currency as SalaryCurrency)
    : "EUR";
  const period = SALARY_PERIODS.includes(r.period as SalaryPeriod)
    ? (r.period as SalaryPeriod)
    : "monthly";
  const effective_date = String(r.effective_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_date)) return null;
  return {
    id: String(r.id ?? ""),
    org_id: String(r.org_id ?? ""),
    user_id: String(r.user_id ?? ""),
    amount,
    currency,
    period,
    effective_date,
    note: r.note == null || String(r.note).trim() === "" ? null : String(r.note),
    created_by: r.created_by ? String(r.created_by) : null,
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

/** Sorts entries newest-first (effective_date DESC, created_at DESC, id DESC). */
export function sortSalariesDesc(entries: SalaryEntry[]): SalaryEntry[] {
  return [...entries].sort((a, b) => {
    const d = b.effective_date.localeCompare(a.effective_date);
    if (d !== 0) return d;
    const c = b.created_at.localeCompare(a.created_at);
    if (c !== 0) return c;
    return b.id.localeCompare(a.id);
  });
}

/** Local today as YYYY-MM-DD. */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns a person's active salary as of `today` (latest entry with
 * `effective_date <= today`), or the earliest scheduled future entry if none
 * have taken effect yet.
 */
export function currentSalaryOf(
  entries: SalaryEntry[],
  today = todayIsoDate(),
): { entry: SalaryEntry; scheduled: boolean } | null {
  if (!entries.length) return null;
  const desc = sortSalariesDesc(entries);
  const active = desc.find((e) => e.effective_date <= today);
  if (active) return { entry: active, scheduled: false };
  // All entries are scheduled in the future; pick the soonest one.
  return { entry: desc[desc.length - 1], scheduled: true };
}

export interface SalaryDelta {
  diff: number;
  pct: number | null;
  comparable: boolean;
}

export function salaryDelta(
  current: SalaryEntry,
  previous: SalaryEntry | undefined,
): SalaryDelta | null {
  if (!previous) return null;
  if (current.currency !== previous.currency || current.period !== previous.period) {
    return { diff: 0, pct: null, comparable: false };
  }
  const diff = current.amount - previous.amount;
  const pct = previous.amount > 0 ? (diff / previous.amount) * 100 : null;
  return { diff, pct, comparable: true };
}

export const PERIOD_SHORT: Record<SalaryPeriod, string> = {
  monthly: "/ mo",
  annual: "/ yr",
  hourly: "/ hr",
};

export const PERIOD_LONG: Record<SalaryPeriod, string> = {
  monthly: "per month",
  annual: "per year",
  hourly: "per hour",
};

export function formatMoney(amount: number, currency: SalaryCurrency): string {
  const hasDecimals = Math.abs(amount - Math.round(amount)) > 0.001;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    })} ${currency}`;
  }
}

export function formatSalary(
  amount: number,
  currency: SalaryCurrency,
  period: SalaryPeriod,
  style: "short" | "long" = "short",
): string {
  const money = formatMoney(amount, currency);
  return `${money} ${style === "short" ? PERIOD_SHORT[period] : PERIOD_LONG[period]}`;
}

export function formatSignedMoney(diff: number, currency: SalaryCurrency): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(diff), currency)}`;
}

export function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  const abs = Math.abs(pct);
  const digits = abs >= 10 || Math.abs(abs - Math.round(abs)) < 0.05 ? 0 : 1;
  return `${sign}${abs.toFixed(digits)}%`;
}

/** Parses user-typed numbers like "4 800", "4,800.50", or "4800,50". */
export function parseSalaryAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && !hasDot) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Groups an organisation's salary history entries by user_id, newest first. */
export function groupSalariesByUser(entries: SalaryEntry[]): Map<string, SalaryEntry[]> {
  const map = new Map<string, SalaryEntry[]>();
  for (const e of entries) {
    const list = map.get(e.user_id);
    if (list) list.push(e);
    else map.set(e.user_id, [e]);
  }
  for (const [uid, list] of map) {
    map.set(uid, sortSalariesDesc(list));
  }
  return map;
}

/** Standard annual working hours fallback (7.5 h/day × 5 days × 52 weeks). */
export const DEFAULT_HOURS_PER_YEAR = 1950;

export function hoursPerYearFromWorkSettings(
  settings?: { hours_per_day: number; work_days: number[] } | null,
): number {
  if (!settings || settings.hours_per_day <= 0 || !settings.work_days.length) {
    return DEFAULT_HOURS_PER_YEAR;
  }
  return settings.hours_per_day * settings.work_days.length * 52;
}

export interface CurrencyCost {
  currency: SalaryCurrency;
  monthly: number;
  annual: number;
}

export interface CostSummary {
  /** Totals grouped by currency (sorted by annual amount descending). */
  totals: CurrencyCost[];
  /** Number of unique people counted in this scope. */
  peopleCount: number;
  /** Number of unique people in this scope who have a salary set. */
  pricedCount: number;
}

/** Converts any salary entry (monthly, annual, or hourly) to both monthly and annual cost. */
export function salaryToMonthlyAnnual(
  entry: SalaryEntry,
  hoursPerYear = DEFAULT_HOURS_PER_YEAR,
): CurrencyCost {
  if (entry.period === "monthly") {
    return { currency: entry.currency, monthly: entry.amount, annual: entry.amount * 12 };
  }
  if (entry.period === "annual") {
    return { currency: entry.currency, monthly: entry.amount / 12, annual: entry.amount };
  }
  const annual = entry.amount * hoursPerYear;
  return { currency: entry.currency, monthly: annual / 12, annual };
}

/**
 * Sums monthly and annual salary costs across a set of people, deduplicating by
 * `key` so a person belonging to multiple units is counted only once in rollups.
 */
export function aggregateSalaryCosts(
  people: { key: string; personId: string | null }[],
  salariesByUser: Map<string, SalaryEntry[]>,
  hoursPerYear = DEFAULT_HOURS_PER_YEAR,
  today = todayIsoDate(),
): CostSummary {
  const seen = new Set<string>();
  const byCurrency = new Map<SalaryCurrency, { monthly: number; annual: number }>();
  let peopleCount = 0;
  let pricedCount = 0;

  for (const p of people) {
    if (!p.key || seen.has(p.key)) continue;
    seen.add(p.key);
    peopleCount += 1;
    if (!p.personId) continue;
    const current = currentSalaryOf(salariesByUser.get(p.personId) ?? [], today);
    if (!current) continue;
    pricedCount += 1;
    const cost = salaryToMonthlyAnnual(current.entry, hoursPerYear);
    const acc = byCurrency.get(cost.currency) ?? { monthly: 0, annual: 0 };
    acc.monthly += cost.monthly;
    acc.annual += cost.annual;
    byCurrency.set(cost.currency, acc);
  }

  const totals: CurrencyCost[] = [...byCurrency.entries()]
    .map(([currency, v]) => ({
      currency,
      monthly: Math.round(v.monthly * 100) / 100,
      annual: Math.round(v.annual * 100) / 100,
    }))
    .sort((a, b) => b.annual - a.annual);

  return { totals, peopleCount, pricedCount };
}

/** Formats a cost figure cleanly (rounds amounts >= 100 to whole currency units). */
export function formatCostMoney(amount: number, currency: SalaryCurrency): string {
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return formatMoney(rounded, currency);
}

/** Formats single- or multi-currency totals for monthly or annual display. */
export function formatCostTotals(
  totals: CurrencyCost[],
  period: "monthly" | "annual",
  compact = false,
): string {
  if (!totals.length) return "—";
  const suffix = period === "monthly" ? (compact ? "/mo" : " / mo") : compact ? "/yr" : " / yr";
  return totals.map((t) => `${formatCostMoney(t[period], t.currency)}${suffix}`).join(" + ");
}

export async function fetchOrgSalaries(orgId: string): Promise<SalaryEntry[]> {
  if (useLocalFallback) return sortSalariesDesc(readLocal(orgId));
  const { data, error } = await db
    .from(TABLE)
    .select(
      "id, org_id, user_id, amount, currency, period, effective_date, note, created_by, created_at",
    )
    .eq("org_id", orgId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) {
      useLocalFallback = true;
      return sortSalariesDesc(readLocal(orgId));
    }
    throw error;
  }
  const rows = ((data ?? []) as unknown[])
    .map(normalizeRow)
    .filter((x): x is SalaryEntry => x !== null);
  return sortSalariesDesc(rows);
}

export async function addSalaryEntry(
  orgId: string,
  userId: string,
  input: SalaryInput,
): Promise<SalaryEntry> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Salary amount must be greater than zero");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_date)) {
    throw new Error("Choose a valid effective date");
  }
  const me = await getMyProfileId();
  const note = input.note?.trim() ? input.note.trim().slice(0, 240) : null;

  if (!useLocalFallback) {
    const { data, error } = await db
      .from(TABLE)
      .insert({
        org_id: orgId,
        user_id: userId,
        amount: input.amount,
        currency: input.currency,
        period: input.period,
        effective_date: input.effective_date,
        note,
        created_by: me,
      })
      .select(
        "id, org_id, user_id, amount, currency, period, effective_date, note, created_by, created_at",
      )
      .single();
    if (!error && data) {
      const normalized = normalizeRow(data);
      if (normalized) return normalized;
    } else if (error && !isMissingTableError(error)) {
      throw new Error(error.message || "Could not save the salary entry");
    } else if (error) {
      useLocalFallback = true;
    }
  }

  const entry: SalaryEntry = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    org_id: orgId,
    user_id: userId,
    amount: input.amount,
    currency: input.currency,
    period: input.period,
    effective_date: input.effective_date,
    note,
    created_by: me,
    created_at: new Date().toISOString(),
  };
  const next = sortSalariesDesc([...readLocal(orgId), entry]);
  writeLocal(orgId, next);
  return entry;
}

export async function updateSalaryEntry(
  orgId: string,
  entryId: string,
  input: SalaryInput,
): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Salary amount must be greater than zero");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_date)) {
    throw new Error("Choose a valid effective date");
  }
  const note = input.note?.trim() ? input.note.trim().slice(0, 240) : null;

  if (!useLocalFallback) {
    const { error } = await db
      .from(TABLE)
      .update({
        amount: input.amount,
        currency: input.currency,
        period: input.period,
        effective_date: input.effective_date,
        note,
      })
      .eq("id", entryId)
      .eq("org_id", orgId);
    if (!error) return;
    if (!isMissingTableError(error)) {
      throw new Error(error.message || "Could not update the salary entry");
    }
    useLocalFallback = true;
  }

  const rows = readLocal(orgId).map((r) =>
    r.id === entryId
      ? {
          ...r,
          amount: input.amount,
          currency: input.currency,
          period: input.period,
          effective_date: input.effective_date,
          note,
        }
      : r,
  );
  writeLocal(orgId, sortSalariesDesc(rows));
}

export async function deleteSalaryEntry(orgId: string, entryId: string): Promise<void> {
  if (!useLocalFallback) {
    const { error } = await db.from(TABLE).delete().eq("id", entryId).eq("org_id", orgId);
    if (!error) return;
    if (!isMissingTableError(error)) {
      throw new Error(error.message || "Could not delete the salary entry");
    }
    useLocalFallback = true;
  }

  const rows = readLocal(orgId).filter((r) => r.id !== entryId);
  writeLocal(orgId, rows);
}
