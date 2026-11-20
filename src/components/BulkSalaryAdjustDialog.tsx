import { useMemo } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Eye,
  Percent,
} from "lucide-react";
import {
  formatCostTotals,
  formatSalary,
  formatSignedCostTotals,
  formatSignedMoney,
  formatSignedPct,
  todayIsoDate,
} from "@/lib/salaries";
import type { ChartNode } from "@/lib/orgCharts";
import type { BulkSalaryDraft, BulkSalaryPlan, BulkSalaryScope } from "@/lib/bulkSalaryPlan";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS = ["1", "2", "3", "5", "10"] as const;

export function BulkSalaryAdjustDialog({
  open,
  draft,
  plan,
  unitOptions,
  busy,
  isLivePreview,
  onChangeDraft,
  onClose,
  onPreviewOnChart,
  onApply,
  planningChart = null,
}: {
  open: boolean;
  draft: BulkSalaryDraft;
  plan: BulkSalaryPlan;
  unitOptions: { node: ChartNode; depth: number }[];
  busy: boolean;
  isLivePreview: boolean;
  onChangeDraft: (next: BulkSalaryDraft) => void;
  onClose: () => void;
  onPreviewOnChart: () => void;
  onApply: () => void;
  /** The chart's name when it isn't the active one: then the change is only a plan. */
  planningChart?: string | null;
}) {
  const today = todayIsoDate();
  const isFutureDate =
    /^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate) && draft.effectiveDate > today;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate);

  const allSelected = plan.rows.length > 0 && plan.selectedRows.length === plan.rows.length;
  const someSelected = plan.selectedRows.length > 0 && plan.selectedRows.length < plan.rows.length;

  const canPreview = plan.signedPct !== null && !plan.pctError && plan.selectedRows.length > 0;
  const canApply = canPreview && validDate && !busy;

  const isIncrease = draft.direction === "increase";

  const selectedUnitHasSubUnits = useMemo(() => {
    if (draft.scope.kind !== "unit") return false;
    const targetId = draft.scope.unitId;
    return unitOptions.some((o) => o.node.parent_id === targetId);
  }, [draft.scope, unitOptions]);

  const setScopeKind = (kind: BulkSalaryScope["kind"]) => {
    if (kind === "company") {
      onChangeDraft({ ...draft, scope: { kind: "company" }, excludedIds: [] });
    } else if (kind === "chart") {
      onChangeDraft({ ...draft, scope: { kind: "chart" }, excludedIds: [] });
    } else {
      const fallbackUnitId =
        draft.scope.kind === "unit" ? draft.scope.unitId : (unitOptions[0]?.node.id ?? "");
      onChangeDraft({
        ...draft,
        scope: { kind: "unit", unitId: fallbackUnitId, includeSubUnits: true },
        excludedIds: [],
      });
    }
  };

  const togglePerson = (userId: string, include: boolean) => {
    const next = include
      ? draft.excludedIds.filter((id) => id !== userId)
      : draft.excludedIds.includes(userId)
        ? draft.excludedIds
        : [...draft.excludedIds, userId];
    onChangeDraft({ ...draft, excludedIds: next });
  };

  const toggleAll = (includeAll: boolean) => {
    onChangeDraft({
      ...draft,
      excludedIds: includeAll ? [] : plan.rows.map((r) => r.userId),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2 text-lg text-foreground">
            <Percent className="h-5 w-5 text-primary" />
            <span>Bulk salary adjustment</span>
          </DialogTitle>
          <DialogDescription className="text-foreground/80">
            Adjust salaries by a percentage (rounded to 2 decimals). Preview the impact here or live
            on the org chart before applying.
          </DialogDescription>
          {planningChart && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
              “{planningChart}” isn't the active chart, so this is saved as a plan on it and doesn't
              change anyone's real pay.
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* 1. Scope */}
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-foreground">
              1. Who to adjust
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { kind: "company", label: "Whole company" },
                  { kind: "chart", label: "Placed in chart", disabled: unitOptions.length === 0 },
                  { kind: "unit", label: "Specific unit", disabled: unitOptions.length === 0 },
                ] as const
              ).map((opt) => {
                const active = draft.scope.kind === opt.kind;
                const disabled = "disabled" in opt && opt.disabled;
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    disabled={disabled}
                    onClick={() => setScopeKind(opt.kind)}
                    className={
                      "rounded-xl border px-3 py-2 text-center text-xs font-semibold transition " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40"
                        : "border-border bg-background text-foreground hover:bg-muted/60") +
                      (disabled ? " cursor-not-allowed opacity-45" : "")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {draft.scope.kind === "unit" && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/25 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Select
                    value={draft.scope.unitId}
                    onValueChange={(unitId) =>
                      onChangeDraft({
                        ...draft,
                        scope: {
                          kind: "unit",
                          unitId,
                          includeSubUnits:
                            draft.scope.kind === "unit" ? draft.scope.includeSubUnits : true,
                        },
                        excludedIds: [],
                      })
                    }
                  >
                    <SelectTrigger aria-label="Unit to adjust" className="bg-background">
                      <SelectValue placeholder="Choose a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map(({ node: u, depth }) => (
                        <SelectItem key={u.id} value={u.id}>
                          {"\u00A0\u00A0".repeat(depth)}
                          {u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                  <Checkbox
                    checked={draft.scope.includeSubUnits}
                    disabled={!selectedUnitHasSubUnits}
                    onCheckedChange={(checked) =>
                      onChangeDraft({
                        ...draft,
                        scope: {
                          kind: "unit",
                          unitId: draft.scope.kind === "unit" ? draft.scope.unitId : "",
                          includeSubUnits: checked === true,
                        },
                        excludedIds: [],
                      })
                    }
                  />
                  <span className={selectedUnitHasSubUnits ? "" : "opacity-60"}>
                    Include sub-units
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* 2. Percentage, date, note */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-foreground">
              2. Adjustment details
            </Label>

            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <div
                className="inline-flex rounded-xl border border-border bg-muted/30 p-0.5"
                role="group"
                aria-label="Direction"
              >
                <button
                  type="button"
                  onClick={() => onChangeDraft({ ...draft, direction: "increase" })}
                  className={
                    "flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition " +
                    (isIncrease
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-foreground hover:bg-background")
                  }
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Increase
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDraft({ ...draft, direction: "decrease" })}
                  className={
                    "flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition " +
                    (!isIncrease
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-foreground hover:bg-background")
                  }
                >
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  Decrease
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-32">
                    <Input
                      aria-label="Percentage"
                      inputMode="decimal"
                      placeholder="3.5"
                      value={draft.percentText}
                      onChange={(e) => onChangeDraft({ ...draft, percentText: e.target.value })}
                      className="pr-7 font-semibold tabular-nums text-foreground"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground/70">
                      %
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => onChangeDraft({ ...draft, percentText: p })}
                        className={
                          "rounded-lg border px-2 py-1 text-xs font-medium tabular-nums transition " +
                          (draft.percentText.trim() === p
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted/60")
                        }
                      >
                        {isIncrease ? `+${p}%` : `−${p}%`}
                      </button>
                    ))}
                  </div>
                </div>
                {plan.pctError && (
                  <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {plan.pctError}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label
                  htmlFor="bulk-effective-date"
                  className="text-xs font-medium text-foreground"
                >
                  Effective date
                </Label>
                <Input
                  id="bulk-effective-date"
                  type="date"
                  value={draft.effectiveDate}
                  onChange={(e) => onChangeDraft({ ...draft, effectiveDate: e.target.value })}
                  className="text-foreground"
                />
                {isFutureDate && (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                    <Calendar className="h-3 w-3 text-primary" />
                    Scheduled for {formatDate(draft.effectiveDate)}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bulk-note" className="text-xs font-medium text-foreground">
                  Reason / note (optional)
                </Label>
                <Input
                  id="bulk-note"
                  maxLength={240}
                  placeholder="e.g. 2027 annual inflation review"
                  value={draft.note}
                  onChange={(e) => onChangeDraft({ ...draft, note: e.target.value })}
                  className="text-foreground"
                />
              </div>
            </div>
          </div>

          {/* 3. Live budget impact summary */}
          <div className="rounded-xl border border-border bg-secondary/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Budget impact · {plan.scopeLabel}
              </span>
              <span className="text-xs font-medium text-foreground/80">
                {plan.selectedRows.length} of {plan.rows.length}{" "}
                {plan.rows.length === 1 ? "person" : "people"} selected
              </span>
            </div>

            {plan.selectedRows.length > 0 && plan.signedPct !== null ? (
              <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/80 bg-background px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                    Current
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                    {formatCostTotals(plan.currentTotals, "monthly", true)}
                  </p>
                  <p className="text-xs tabular-nums text-foreground/80">
                    {formatCostTotals(plan.currentTotals, "annual", true)}
                  </p>
                </div>

                <div className="rounded-lg border border-border/80 bg-background px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                    Projected ({formatSignedPct(plan.signedPct)})
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                    {formatCostTotals(plan.projectedTotals, "monthly", true)}
                  </p>
                  <p className="text-xs tabular-nums text-foreground/80">
                    {formatCostTotals(plan.projectedTotals, "annual", true)}
                  </p>
                </div>

                <div
                  className={
                    "rounded-lg border px-3 py-2 " +
                    (isIncrease
                      ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-rose-300 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/40")
                  }
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                    Difference
                  </p>
                  <p
                    className={
                      "mt-0.5 text-sm font-bold tabular-nums " +
                      (isIncrease
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-rose-800 dark:text-rose-300")
                    }
                  >
                    {formatSignedCostTotals(plan.deltaTotals, "monthly", true)}
                  </p>
                  <p
                    className={
                      "text-xs font-medium tabular-nums " +
                      (isIncrease
                        ? "text-emerald-800/90 dark:text-emerald-300/90"
                        : "text-rose-800/90 dark:text-rose-300/90")
                    }
                  >
                    {formatSignedCostTotals(plan.deltaTotals, "annual", true)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-foreground/80">
                {plan.rows.length === 0
                  ? "No people with a salary found in this scope."
                  : plan.selectedRows.length === 0
                    ? "Select at least one person below to preview the impact."
                    : "Enter a percentage above to preview the cost impact."}
              </p>
            )}
          </div>

          {/* 4. Per-person preview table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-foreground">
                3. Per-person preview
              </Label>
              {plan.rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleAll(!allSelected)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {plan.rows.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
                      <tr className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        <th className="w-8 px-3 py-2">
                          <Checkbox
                            aria-label="Select all people"
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => toggleAll(checked === true)}
                          />
                        </th>
                        <th className="px-2 py-2">Person</th>
                        <th className="px-2 py-2 text-right">Current</th>
                        <th className="px-2 py-2 text-right">New</th>
                        <th className="px-3 py-2 text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {plan.rows.map((row) => {
                        const included = !row.excluded;
                        return (
                          <tr
                            key={row.userId}
                            className={
                              "transition hover:bg-muted/35 " + (included ? "" : "opacity-50")
                            }
                          >
                            <td className="px-3 py-2 align-middle">
                              <Checkbox
                                aria-label={`Include ${row.name}`}
                                checked={included}
                                onCheckedChange={(checked) =>
                                  togglePerson(row.userId, checked === true)
                                }
                              />
                            </td>
                            <td className="px-2 py-2 align-middle">
                              <p className="font-medium text-foreground">{row.name}</p>
                              {row.unitNames.length > 0 && (
                                <p className="text-[11px] text-foreground/70">
                                  {row.unitNames.join(", ")}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-foreground">
                              {formatSalary(
                                row.current.amount,
                                row.current.currency,
                                row.current.period,
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-foreground">
                              {included && plan.signedPct !== null ? (
                                <span className="inline-flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3 text-foreground/50" />
                                  {formatSalary(
                                    row.newAmount,
                                    row.current.currency,
                                    row.current.period,
                                  )}
                                </span>
                              ) : (
                                <span className="font-normal text-foreground/60">
                                  {included ? "—" : "Excluded"}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                              {included && plan.signedPct !== null ? (
                                <span
                                  className={
                                    row.diffAmount >= 0
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-rose-700 dark:text-rose-400"
                                  }
                                >
                                  {formatSignedMoney(row.diffAmount, row.current.currency)}
                                </span>
                              ) : (
                                <span className="font-normal text-foreground/60">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-foreground/80">
                No one in this scope has a salary recorded yet. Add salaries on the People page
                first.
              </div>
            )}

            {(plan.skippedNoSalary.length > 0 || plan.skippedUnlinkedCount > 0) && (
              <p className="text-xs text-foreground/75">
                {plan.skippedNoSalary.length > 0 && (
                  <>
                    Skipped {plan.skippedNoSalary.length}{" "}
                    {plan.skippedNoSalary.length === 1 ? "person" : "people"} without a salary set (
                    {plan.skippedNoSalary
                      .slice(0, 4)
                      .map((p) => p.name)
                      .join(", ")}
                    {plan.skippedNoSalary.length > 4
                      ? ` +${plan.skippedNoSalary.length - 4} more`
                      : ""}
                    ).
                  </>
                )}
                {plan.skippedNoSalary.length > 0 && plan.skippedUnlinkedCount > 0 ? " " : ""}
                {plan.skippedUnlinkedCount > 0 && (
                  <>
                    {plan.skippedUnlinkedCount} unlinked{" "}
                    {plan.skippedUnlinkedCount === 1 ? "name is" : "names are"} not linked to People
                    and cannot be adjusted.
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border bg-muted/20 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-foreground/75">
            Applying records a new entry in each person’s salary history across the organisation.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPreview || busy}
              onClick={onPreviewOnChart}
            >
              <Eye className="mr-1.5 h-4 w-4" />
              {isLivePreview ? "Update chart preview" : "Preview on chart"}
            </Button>
            <Button type="button" size="sm" disabled={!canApply} onClick={onApply}>
              {busy
                ? planningChart
                  ? "Saving…"
                  : "Applying…"
                : `${planningChart ? "Plan for" : "Apply to"} ${plan.selectedRows.length} ${plan.selectedRows.length === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
