// Pay changes planned on an org chart that isn't the active one.
//
// Only the active chart is today's organisation. On a past or planned chart,
// a pay change (such as a bulk raise for a unit) is a plan kept with that
// chart in org_chart_salary_plans, never in anyone's real pay history
// (org_member_salary_history). The database refuses plans on the active
// chart. When a planned chart is made active, its plans can be made real.

import { supabase } from "@/integrations/supabase/app-client";
import { addSalaryEntriesBulk, type SalaryEntry, type SalaryInput } from "./salaries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** A planned pay change: shaped like a real pay entry, on one chart. */
export type SalaryPlan = SalaryEntry & { chart_id: string };

const COLUMNS =
  "id, org_id, chart_id, user_id, amount, currency, period, effective_date, note, created_by, created_at";

export const chartSalaryPlansKey = (chartId: string | null) => ["org-chart-salary-plans", chartId];

export async function fetchSalaryPlans(chartId: string): Promise<SalaryPlan[]> {
  const { data, error } = await db
    .from("org_chart_salary_plans")
    .select(COLUMNS)
    .eq("chart_id", chartId)
    .order("effective_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as SalaryPlan[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function addSalaryPlans(
  orgId: string,
  chartId: string,
  rows: { userId: string; input: SalaryInput }[],
): Promise<SalaryPlan[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db
    .from("org_chart_salary_plans")
    .insert(
      rows.map((r) => ({
        org_id: orgId,
        chart_id: chartId,
        user_id: r.userId,
        amount: r.input.amount,
        currency: r.input.currency,
        period: r.input.period,
        effective_date: r.input.effective_date,
        note: r.input.note,
      })),
    )
    .select(COLUMNS);
  if (error) throw error;
  return (data ?? []) as SalaryPlan[];
}

export async function deleteSalaryPlans(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await db.from("org_chart_salary_plans").delete().in("id", ids);
  if (error) throw error;
}

/** A copy of a chart keeps the original's planned pay. */
export async function copySalaryPlans(orgId: string, from: string, to: string) {
  const plans = await fetchSalaryPlans(from);
  await addSalaryPlans(
    orgId,
    to,
    plans.map((p) => ({
      userId: p.user_id,
      input: {
        amount: p.amount,
        currency: p.currency,
        period: p.period,
        effective_date: p.effective_date,
        note: p.note,
      },
    })),
  );
}

/**
 * Makes a chart's planned pay real: each plan becomes an entry in the
 * person's pay history, and the plans are removed from the chart.
 */
export async function makeSalaryPlansReal(orgId: string, chartId: string): Promise<number> {
  const plans = await fetchSalaryPlans(chartId);
  if (plans.length === 0) return 0;
  await addSalaryEntriesBulk(
    orgId,
    plans.map((p) => ({
      userId: p.user_id,
      input: {
        amount: p.amount,
        currency: p.currency,
        period: p.period,
        effective_date: p.effective_date,
        note: p.note,
      },
    })),
  );
  await deleteSalaryPlans(plans.map((p) => p.id));
  return plans.length;
}
