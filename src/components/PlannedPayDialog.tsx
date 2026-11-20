import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  currentSalaryOf,
  formatSalary,
  parseSalaryAmount,
  todayIsoDate,
  type SalaryCurrency,
  type SalaryEntry,
  type SalaryPeriod,
} from "@/lib/salaries";
import type { SalaryPlan } from "@/lib/chartSalaryPlans";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PERIOD_WORDS: Record<SalaryPeriod, string> = {
  monthly: "a month",
  annual: "a year",
  hourly: "an hour",
};

/**
 * One person's pay on a chart that isn't the active one: their real pay
 * today, the plans for them on this chart, and a new planned pay. Saving only
 * adds a plan to the chart; their real pay history stays as it is.
 */
export function PlannedPayDialog({
  person,
  chartName,
  realEntries,
  plans,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  person: { id: string; name: string } | null;
  chartName: string;
  /** The person's real pay history (newest first). */
  realEntries: SalaryEntry[];
  /** The person's planned pay on this chart. */
  plans: SalaryPlan[];
  busy: boolean;
  onSave: (input: {
    amount: number;
    currency: SalaryCurrency;
    period: SalaryPeriod;
    effective_date: string;
    note: string | null;
  }) => void;
  onDelete: (planId: string) => void;
  onClose: () => void;
}) {
  const today = todayIsoDate();
  const real = currentSalaryOf(realEntries, today)?.entry ?? null;
  const latestPlan = [...plans].sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const base = latestPlan ?? real;

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<SalaryCurrency>("EUR");
  const [period, setPeriod] = useState<SalaryPeriod>("monthly");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  // A fresh form for each person, starting from their latest pay.
  useEffect(() => {
    if (!person) return;
    setAmount(base ? String(base.amount) : "");
    setCurrency((base?.currency as SalaryCurrency) ?? "EUR");
    setPeriod((base?.period as SalaryPeriod) ?? "monthly");
    setDate(today);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  const parsed = parseSalaryAmount(amount);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Planned pay: {person?.name}</DialogTitle>
          <DialogDescription>
            A plan on “{chartName}” only. {person?.name}&apos;s real pay doesn&apos;t change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
          <p>
            <span className="text-muted-foreground">Real pay today: </span>
            <span className="font-medium">
              {real ? formatSalary(real.amount, real.currency, real.period) : "not set"}
            </span>
          </p>
          {plans.length > 0 && (
            <div>
              <p className="text-muted-foreground">Planned on this chart:</p>
              <ul className="mt-1 space-y-1">
                {[...plans]
                  .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">
                          {formatSalary(p.amount, p.currency, p.period)}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          from {formatDate(p.effective_date)}
                          {p.note ? ` · ${p.note}` : ""}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={busy}
                        onClick={() => onDelete(p.id)}
                        aria-label={`Remove the planned pay from ${formatDate(p.effective_date)}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed === null || !validDate) return;
            onSave({
              amount: parsed,
              currency,
              period,
              effective_date: date,
              note: note.trim() ? note.trim().slice(0, 500) : null,
            });
          }}
        >
          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="planned-pay-amount">New pay</Label>
              <Input
                id="planned-pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as SalaryCurrency)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SALARY_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Per"
              value={period}
              onChange={(e) => setPeriod(e.target.value as SalaryPeriod)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SALARY_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_WORDS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="planned-pay-date">From</Label>
              <Input
                id="planned-pay-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planned-pay-note">Note (optional)</Label>
              <Input
                id="planned-pay-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          {amount && parsed === null && (
            <p className="text-sm text-destructive">Enter the pay as a number above zero.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={busy || parsed === null || !validDate}>
              Save as plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
