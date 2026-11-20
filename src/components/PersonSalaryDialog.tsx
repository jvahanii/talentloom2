import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  History,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addSalaryEntry,
  currentSalaryOf,
  deleteSalaryEntry,
  formatMoney,
  formatSalary,
  formatSignedMoney,
  formatSignedPct,
  orgSalariesKey,
  parseSalaryAmount,
  PERIOD_LONG,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  salaryDelta,
  sortSalariesDesc,
  todayIsoDate,
  updateSalaryEntry,
  type SalaryCurrency,
  type SalaryEntry,
  type SalaryPeriod,
} from "@/lib/salaries";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SalaryDialogPerson {
  userId: string;
  name: string | null;
  email: string | null;
  titleName: string | null;
}

const selectCls =
  "h-9 rounded-xl border border-input bg-white/80 px-2.5 text-sm text-foreground outline-none focus:border-teal-500 dark:bg-white/5";

export function PersonSalaryDialog({
  orgId,
  person,
  entries,
  nameOf,
  canEdit,
  onClose,
}: {
  orgId: string;
  person: SalaryDialogPerson | null;
  entries: SalaryEntry[];
  nameOf: (userId: string) => string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const sortedDesc = useMemo(() => sortSalariesDesc(entries), [entries]);
  const today = todayIsoDate();
  const current = useMemo(() => currentSalaryOf(sortedDesc, today), [sortedDesc, today]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<SalaryCurrency>("EUR");
  const [period, setPeriod] = useState<SalaryPeriod>("monthly");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset form state whenever a different person is opened.
  useEffect(() => {
    if (!person) return;
    const latest = sortedDesc[0];
    setEditingId(null);
    setAmount("");
    setCurrency(latest?.currency ?? "EUR");
    setPeriod(latest?.period ?? "monthly");
    setEffectiveDate(todayIsoDate());
    setNote("");
    setShowForm(canEdit && sortedDesc.length === 0);
  }, [person?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddForm = () => {
    const latest = sortedDesc[0];
    setEditingId(null);
    setAmount("");
    setCurrency(latest?.currency ?? "EUR");
    setPeriod(latest?.period ?? "monthly");
    setEffectiveDate(todayIsoDate());
    setNote("");
    setShowForm(true);
  };

  const openEditForm = (entry: SalaryEntry) => {
    setEditingId(entry.id);
    setAmount(String(entry.amount));
    setCurrency(entry.currency);
    setPeriod(entry.period);
    setEffectiveDate(entry.effective_date);
    setNote(entry.note ?? "");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setAmount("");
    setNote("");
  };

  // Chart data: chronological oldest -> newest, shown when 2+ entries share the current currency & period.
  const chartSeries = useMemo(() => {
    if (!current) return [];
    const baseCurrency = current.entry.currency;
    const basePeriod = current.entry.period;
    const matching = [...sortedDesc]
      .reverse()
      .filter((e) => e.currency === baseCurrency && e.period === basePeriod);
    if (matching.length < 2) return [];
    return matching.map((e) => ({
      date: formatDate(e.effective_date),
      amount: e.amount,
      note: e.note,
      currency: e.currency,
      period: e.period,
    }));
  }, [sortedDesc, current]);

  // Total growth from earliest comparable entry to the current active entry.
  const overallGrowth = useMemo(() => {
    if (!current || sortedDesc.length < 2) return null;
    const earliest = sortedDesc[sortedDesc.length - 1];
    if (earliest.id === current.entry.id) return null;
    const delta = salaryDelta(current.entry, earliest);
    if (!delta || !delta.comparable) return null;
    return { ...delta, since: earliest.effective_date };
  }, [current, sortedDesc]);

  // Live preview delta while typing a new salary change.
  const parsedAmount = parseSalaryAmount(amount);
  const previewBase = useMemo(() => {
    if (editingId) {
      const idx = sortedDesc.findIndex((e) => e.id === editingId);
      return idx >= 0 ? sortedDesc[idx + 1] : undefined;
    }
    return sortedDesc[0];
  }, [editingId, sortedDesc]);

  const previewDelta = useMemo(() => {
    if (!parsedAmount || !previewBase) return null;
    if (previewBase.currency !== currency || previewBase.period !== period) return null;
    const diff = parsedAmount - previewBase.amount;
    const pct = previewBase.amount > 0 ? (diff / previewBase.amount) * 100 : null;
    return { diff, pct };
  }, [parsedAmount, previewBase, currency, period]);

  const handleSave = async () => {
    if (!person) return;
    if (!parsedAmount) {
      toast.error("Enter a valid salary amount greater than 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      toast.error("Choose a valid effective date");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        amount: parsedAmount,
        currency,
        period,
        effective_date: effectiveDate,
        note: note.trim() || null,
      };
      if (editingId) {
        await updateSalaryEntry(orgId, editingId, payload);
        toast.success("Salary entry updated");
      } else {
        await addSalaryEntry(orgId, person.userId, payload);
        toast.success(sortedDesc.length === 0 ? "Salary saved" : "Salary change recorded");
      }
      await qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) });
      closeForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the salary");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (entry: SalaryEntry) => {
    if (
      !window.confirm(
        `Delete the ${formatSalary(entry.amount, entry.currency, entry.period)} entry from ${formatDate(entry.effective_date)}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteSalaryEntry(orgId, entry.id);
      toast.success("Salary entry deleted");
      if (editingId === entry.id) closeForm();
      await qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the salary entry");
    } finally {
      setBusy(false);
    }
  };

  const displayName = person?.name || person?.email || "Person";

  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>{displayName}</span>
            {person?.titleName && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground">
                {person.titleName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-foreground/75">
            Current salary and chronological change history.
          </DialogDescription>
        </DialogHeader>

        {/* Current salary summary */}
        {current ? (
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground/75">
                    {current.scheduled ? "Scheduled salary" : "Current salary"}
                  </span>
                  {current.scheduled && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                      Upcoming
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {formatSalary(
                    current.entry.amount,
                    current.entry.currency,
                    current.entry.period,
                    "long",
                  )}
                </p>
                <p className="text-xs text-foreground/80">
                  Effective {formatDate(current.entry.effective_date)}
                  {overallGrowth && overallGrowth.diff !== 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span
                        className={
                          overallGrowth.diff > 0
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "font-semibold text-rose-700 dark:text-rose-400"
                        }
                      >
                        {formatSignedMoney(overallGrowth.diff, current.entry.currency)}
                        {overallGrowth.pct !== null && ` (${formatSignedPct(overallGrowth.pct)})`}
                      </span>{" "}
                      since {formatDate(overallGrowth.since)}
                    </>
                  )}
                </p>
              </div>
              {canEdit && !showForm && (
                <Button size="sm" onClick={openAddForm}>
                  <Plus className="mr-1 h-4 w-4" /> Record change
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-sm font-medium text-foreground">No salary recorded yet</p>
            <p className="mt-0.5 text-xs text-foreground/75">
              {canEdit
                ? "Add a starting salary below to begin tracking changes over time."
                : "No compensation entries have been recorded for this person."}
            </p>
          </div>
        )}

        {/* Progression chart (shown when 2+ comparable records exist) */}
        {chartSeries.length >= 2 && current && (
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-foreground/80">
              Salary progression ({current.entry.currency} {PERIOD_LONG[current.entry.period]})
            </p>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salaryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => formatMoney(v, current.entry.currency)}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      formatSalary(value, current.entry.currency, current.entry.period, "long"),
                      "Salary",
                    ]}
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="amount"
                    stroke="#0d9488"
                    strokeWidth={2}
                    fill="url(#salaryFill)"
                    dot={{ r: 3.5, fill: "#0d9488", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Add / edit salary form */}
        {canEdit && showForm && (
          <div className="space-y-3 rounded-xl border-2 border-primary/25 bg-card p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {editingId
                  ? "Edit salary entry"
                  : sortedDesc.length === 0
                    ? "Add salary"
                    : "Record salary change"}
              </p>
              {sortedDesc.length > 0 && (
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md p-1 text-foreground/70 hover:bg-secondary hover:text-foreground"
                  aria-label="Close salary form"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="salary-amount" className="text-xs font-medium text-foreground/85">
                  Amount
                </label>
                <Input
                  id="salary-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSave()}
                  placeholder="e.g. 4800"
                  className="h-9 tabular-nums"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="salary-currency" className="text-xs font-medium text-foreground/85">
                  Currency
                </label>
                <select
                  id="salary-currency"
                  className={`${selectCls} w-full`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as SalaryCurrency)}
                >
                  {SALARY_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="salary-period" className="text-xs font-medium text-foreground/85">
                  Period
                </label>
                <select
                  id="salary-period"
                  className={`${selectCls} w-full`}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as SalaryPeriod)}
                >
                  {SALARY_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p === "monthly" ? "Monthly" : p === "annual" ? "Annual" : "Hourly"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="salary-effective-date"
                  className="text-xs font-medium text-foreground/85"
                >
                  Effective date
                </label>
                <Input
                  id="salary-effective-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="salary-note" className="text-xs font-medium text-foreground/85">
                  Reason / note (optional)
                </label>
                <Input
                  id="salary-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSave()}
                  placeholder="Annual review, promotion…"
                  maxLength={240}
                  className="h-9"
                />
              </div>
            </div>

            {previewDelta && previewBase && (
              <p className="text-xs text-foreground/85">
                Change vs previous (
                {formatSalary(previewBase.amount, previewBase.currency, previewBase.period)}):{" "}
                <span
                  className={
                    previewDelta.diff > 0
                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                      : previewDelta.diff < 0
                        ? "font-semibold text-rose-700 dark:text-rose-400"
                        : "font-semibold text-foreground"
                  }
                >
                  {previewDelta.diff === 0
                    ? "No change"
                    : `${formatSignedMoney(previewDelta.diff, currency)}${
                        previewDelta.pct !== null ? ` (${formatSignedPct(previewDelta.pct)})` : ""
                      }`}
                </span>
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {sortedDesc.length > 0 && (
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={busy}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={busy || !parsedAmount}>
                {busy
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : sortedDesc.length === 0
                      ? "Save salary"
                      : "Record change"}
              </Button>
            </div>
          </div>
        )}

        {/* History list (newest first) */}
        {sortedDesc.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/80">
                <History className="h-3.5 w-3.5" />
                Change history ({sortedDesc.length})
              </h3>
              <span className="text-[11px] text-foreground/70">Newest first</span>
            </div>

            <ol className="divide-y divide-border rounded-xl border border-border bg-card">
              {sortedDesc.map((entry, idx) => {
                const prev = sortedDesc[idx + 1];
                const delta = salaryDelta(entry, prev);
                const isCurrent = current?.entry.id === entry.id && !current.scheduled;
                const isScheduled = entry.effective_date > today;

                return (
                  <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatSalary(entry.amount, entry.currency, entry.period)}
                        </span>

                        {isCurrent && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900 dark:bg-teal-950/70 dark:text-teal-200">
                            Current
                          </span>
                        )}
                        {isScheduled && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                            Scheduled
                          </span>
                        )}

                        {delta === null ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            Initial
                          </span>
                        ) : !delta.comparable ? (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            Basis changed
                          </span>
                        ) : delta.diff > 0 ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200">
                            <ArrowUpRight className="h-3 w-3" />
                            {formatSignedMoney(delta.diff, entry.currency)}
                            {delta.pct !== null && ` (${formatSignedPct(delta.pct)})`}
                          </span>
                        ) : delta.diff < 0 ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-900 dark:bg-rose-950/70 dark:text-rose-200">
                            <ArrowDownRight className="h-3 w-3" />
                            {formatSignedMoney(delta.diff, entry.currency)}
                            {delta.pct !== null && ` (${formatSignedPct(delta.pct)})`}
                          </span>
                        ) : (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            No change
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/75">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Effective {formatDate(entry.effective_date)}
                        </span>
                        {entry.created_by && <span>· Recorded by {nameOf(entry.created_by)}</span>}
                      </div>

                      {entry.note && <p className="text-xs text-foreground">{entry.note}</p>}
                    </div>

                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={busy}
                          onClick={() => openEditForm(entry)}
                          title="Edit entry"
                          aria-label={`Edit salary entry from ${formatDate(entry.effective_date)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={() => void handleDelete(entry)}
                          title="Delete entry"
                          aria-label={`Delete salary entry from ${formatDate(entry.effective_date)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
