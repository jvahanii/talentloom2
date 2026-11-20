import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Gift, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey } from "@/lib/orgCharts";
import {
  SALARY_CURRENCIES,
  currentSalaryOf,
  fetchOrgSalaries,
  formatMoney,
  groupSalariesByUser,
  hoursPerYearFromWorkSettings,
  orgSalariesKey,
  salaryToMonthlyAnnual,
  type SalaryCurrency,
} from "@/lib/salaries";
import { fetchWorkSettings, workSettingsKey } from "@/lib/workVacations";
import {
  STATUS_LABEL,
  addParticipants,
  bonusesKey,
  deleteScheme,
  fetchBonuses,
  payoutOf,
  removeParticipant,
  saveCriteria,
  saveScheme,
  setResult,
  setTargetOverride,
  type Bonuses,
  type Scheme,
  type SchemeInput,
  type SchemeKind,
  type SchemeStatus,
} from "@/lib/bonuses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/bonus-schemes")({
  head: () => ({ meta: [{ title: "Bonus schemes — Talentloom" }] }),
  component: BonusPage,
});

const money = (amount: number, currency: string) =>
  formatMoney(
    amount,
    ((SALARY_CURRENCIES as readonly string[]).includes(currency)
      ? currency
      : "EUR") as SalaryCurrency,
  );
const dateText = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const parseNum = (s: string) => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
};

const STATUS_TONE: Record<SchemeStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  closed: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

type SchemeForm = Omit<SchemeInput, "target" | "max_payout_pct"> & {
  target: string;
  max_payout_pct: string;
};

function BonusPage() {
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const bonusesQ = useQuery({
    queryKey: bonusesKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchBonuses(orgId!),
  });
  const peopleQ = useQuery({
    queryKey: orgPeopleKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgPeople(orgId!),
  });
  const salariesQ = useQuery({
    queryKey: orgSalariesKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgSalaries(orgId!),
  });
  const workQ = useQuery({
    queryKey: workSettingsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchWorkSettings(orgId!),
  });
  const b: Bonuses = bonusesQ.data ?? { schemes: [], criteria: [], participants: [], results: [] };
  const people = peopleQ.data ?? [];
  const salaries = groupSalariesByUser(salariesQ.data ?? []);
  const hoursPerYear = hoursPerYearFromWorkSettings(workQ.data);
  const annualOf = (personId: string) => {
    const cur = currentSalaryOf(salaries.get(personId) ?? []);
    if (!cur) return null;
    const c = salaryToMonthlyAnnual(cur.entry, hoursPerYear);
    return { amount: c.annual, currency: c.currency };
  };
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone who left";

  const [selected, setSelected] = useState<string | null>(null);
  const scheme = b.schemes.find((s) => s.id === selected) ?? b.schemes[0] ?? null;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SchemeForm | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Scheme | null>(null);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(
        e && typeof e === "object" && "message" in e ? String(e.message) : "Something went wrong",
      );
      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: bonusesKey(orgId) });
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const totals = (s: Scheme) => {
    const sums = new Map<string, number>();
    const parts = b.participants.filter((p) => p.scheme_id === s.id);
    for (const p of parts) {
      const pay = payoutOf({
        scheme: s,
        criteria: b.criteria.filter((c) => c.scheme_id === s.id),
        results: b.results.filter((r) => r.scheme_id === s.id && r.person_id === p.person_id),
        participant: p,
        annualSalary: annualOf(p.person_id),
      });
      if (pay.payout !== null) sums.set(pay.currency, (sums.get(pay.currency) ?? 0) + pay.payout);
    }
    return { count: parts.length, sums: [...sums.entries()] };
  };

  const newForm = (): SchemeForm => {
    const y = new Date().getFullYear();
    return {
      name: "",
      description: "",
      start_date: `${y}-01-01`,
      end_date: `${y}-12-31`,
      kind: "percent",
      target: "10",
      currency: "EUR",
      max_payout_pct: "100",
      status: "draft",
    };
  };
  const formOf = (s: Scheme): SchemeForm => ({
    ...s,
    description: s.description ?? "",
    target: String(s.target),
    max_payout_pct: String(s.max_payout_pct),
  });
  const formTarget = form ? parseNum(form.target) : null;
  const formMax = form ? parseNum(form.max_payout_pct) : null;
  const formBad =
    !form ||
    !form.name.trim() ||
    formTarget === null ||
    Number.isNaN(formTarget) ||
    formMax === null ||
    Number.isNaN(formMax) ||
    formMax > 1000 ||
    form.end_date < form.start_date;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bonus schemes</h1>
          <p className="text-sm text-muted-foreground">
            Each scheme sets a target, a share of annual salary or a fixed sum, and weighted
            criteria. Enter how far each participant got on each, and the bonus is worked out.
            Salaries come from the People page. Everyone in the organisation can see and edit them.
          </p>
        </div>
        <Button onClick={() => setForm(newForm())}>
          <Plus className="mr-1 h-4 w-4" /> New scheme
        </Button>
      </div>

      {bonusesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : b.schemes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Start your first bonus scheme</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            For example a sales bonus of 10% of annual salary: 60% on sales, 40% on customer
            satisfaction.
          </p>
          <Button className="mt-4" onClick={() => setForm(newForm())}>
            <Plus className="mr-1 h-4 w-4" /> New scheme
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="space-y-2">
            {b.schemes.map((s) => {
              const t = totals(s);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      "w-full rounded-2xl border-2 bg-card p-3 text-left transition hover:border-primary",
                      scheme?.id === s.id ? "border-primary" : "border-border",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                      <span className={cn("rounded-full px-2 text-[11px]", STATUS_TONE[s.status])}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dateText(s.start_date)}–{dateText(s.end_date)} · {t.count}{" "}
                      {t.count === 1 ? "person" : "people"}
                    </p>
                    {t.sums.length > 0 && (
                      <p className="text-xs font-medium">
                        {t.sums.map(([cur, sum]) => money(sum, cur)).join(" + ")}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {scheme && (
            <SchemeView
              key={scheme.id}
              orgId={orgId}
              scheme={scheme}
              b={b}
              people={people}
              nameOf={nameOf}
              annualOf={annualOf}
              busy={busy}
              run={run}
              onEdit={() => setForm(formOf(scheme))}
              onAddPeople={() => setAdding(true)}
            />
          )}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit the scheme" : "New bonus scheme"}</DialogTitle>
            <DialogDescription>Add its criteria and people after saving.</DialogDescription>
          </DialogHeader>
          {form && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (formBad) return;
                let id = "";
                const ok = await run(
                  async () => {
                    id = await saveScheme(orgId, {
                      ...form,
                      target: formTarget!,
                      max_payout_pct: formMax!,
                    });
                  },
                  form.id ? "Saved the scheme" : `Added ${form.name.trim()}`,
                );
                if (ok) {
                  setSelected(id);
                  setForm(null);
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="scheme-name">Name</Label>
                <Input
                  id="scheme-name"
                  autoFocus
                  maxLength={100}
                  placeholder="e.g. Sales bonus 2027"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheme-desc">Description (optional)</Label>
                <Textarea
                  id="scheme-desc"
                  rows={2}
                  className="min-h-[3.25rem]"
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheme-start">From</Label>
                  <Input
                    id="scheme-start"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scheme-end">To</Label>
                  <Input
                    id="scheme-end"
                    type="date"
                    min={form.start_date}
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Target</Label>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <Select
                    value={form.kind}
                    onValueChange={(v) => setForm({ ...form, kind: v as SchemeKind })}
                  >
                    <SelectTrigger aria-label="Kind of target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">A per cent of annual salary</SelectItem>
                      <SelectItem value="fixed">A fixed sum</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="decimal"
                    aria-label="Target"
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                  />
                </div>
                {form.kind === "fixed" && (
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setForm({ ...form, currency: v })}
                  >
                    <SelectTrigger className="w-28" aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALARY_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  {form.kind === "percent"
                    ? "Paid in full when every criterion is met: e.g. 10 means 10% of the person's annual salary."
                    : "Paid in full when every criterion is met."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheme-max">At most (% of target)</Label>
                  <Input
                    id="scheme-max"
                    inputMode="decimal"
                    value={form.max_payout_pct}
                    onChange={(e) => setForm({ ...form, max_payout_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as SchemeStatus })}
                  >
                    <SelectTrigger aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as SchemeStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.end_date < form.start_date && (
                <p className="text-sm text-destructive">The end can't be before the start.</p>
              )}
              <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    onClick={() => {
                      const s = b.schemes.find((x) => x.id === form.id);
                      if (s) setConfirmDelete(s);
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || formBad}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {scheme && (
        <AddPeopleDialog
          open={adding}
          onClose={() => setAdding(false)}
          people={people.filter(
            (p) => !b.participants.some((x) => x.scheme_id === scheme.id && x.person_id === p.id),
          )}
          busy={busy}
          onAdd={async (ids) => {
            if (
              await run(
                () => addParticipants(orgId, scheme.id, ids),
                `Added ${ids.length} ${ids.length === 1 ? "person" : "people"}`,
              )
            )
              setAdding(false);
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its criteria, participants and results are deleted too. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const s = confirmDelete;
                if (s && (await run(() => deleteScheme(s.id), `Deleted ${s.name}`))) {
                  setForm(null);
                  setSelected(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SchemeView({
  orgId,
  scheme,
  b,
  nameOf,
  annualOf,
  busy,
  run,
  onEdit,
  onAddPeople,
}: {
  orgId: string;
  scheme: Scheme;
  b: Bonuses;
  people: { id: string; name: string }[];
  nameOf: (id: string) => string;
  annualOf: (id: string) => { amount: number; currency: string } | null;
  busy: boolean;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
  onEdit: () => void;
  onAddPeople: () => void;
}) {
  const criteria = b.criteria.filter((c) => c.scheme_id === scheme.id);
  const parts = b.participants
    .filter((p) => p.scheme_id === scheme.id)
    .sort((x, y) => nameOf(x.person_id).localeCompare(nameOf(y.person_id)));
  const [draft, setDraft] = useState<{ id?: string; name: string; weight: string }[] | null>(null);
  const weightSum = criteria.reduce((s, c) => s + c.weight, 0);

  const targetText =
    scheme.kind === "percent"
      ? `${scheme.target}% of annual salary`
      : money(scheme.target, scheme.currency);
  const rows = parts.map((p) => ({
    p,
    pay: payoutOf({
      scheme,
      criteria,
      results: b.results.filter((r) => r.scheme_id === scheme.id && r.person_id === p.person_id),
      participant: p,
      annualSalary: annualOf(p.person_id),
    }),
  }));
  const sums = new Map<string, number>();
  for (const r of rows)
    if (r.pay.payout !== null)
      sums.set(r.pay.currency, (sums.get(r.pay.currency) ?? 0) + r.pay.payout);

  return (
    <div className="min-w-0 space-y-4">
      <section className="space-y-1 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{scheme.name}</h2>
          <span className={cn("rounded-full px-2 text-xs", STATUS_TONE[scheme.status])}>
            {STATUS_LABEL[scheme.status]}
          </span>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {dateText(scheme.start_date)}–{dateText(scheme.end_date)} · Target {targetText} · At most{" "}
          {scheme.max_payout_pct}% of the target
        </p>
        {scheme.description && <p className="whitespace-pre-line text-sm">{scheme.description}</p>}
      </section>

      <section className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 font-semibold">Criteria</h3>
          {!draft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft(
                  criteria.length
                    ? criteria.map((c) => ({ id: c.id, name: c.name, weight: String(c.weight) }))
                    : [{ name: "", weight: "100" }],
                )
              }
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit criteria
            </Button>
          )}
        </div>
        {draft ? (
          <CriteriaEditor
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            onSave={async (next) => {
              if (
                await run(
                  () => saveCriteria(orgId, scheme.id, b.criteria, next),
                  "Saved the criteria",
                )
              )
                setDraft(null);
            }}
          />
        ) : criteria.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Add what the bonus is paid for, such as sales or customer satisfaction.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {criteria.map((c) => (
              <li key={c.id} className="rounded-full border-2 border-border px-2.5 py-0.5 text-sm">
                {c.name}{" "}
                <span className="text-muted-foreground">
                  {weightSum ? Math.round((c.weight / weightSum) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-semibold">People ({parts.length})</h3>
          <Button size="sm" variant="outline" onClick={onAddPeople}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Add people
          </Button>
        </div>
        {parts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one in this scheme yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">
                    Target{scheme.kind === "percent" ? " (%)" : ""}
                  </th>
                  {criteria.map((c) => (
                    <th key={c.id} className="py-2 pr-3 font-semibold">
                      {c.name} (%)
                    </th>
                  ))}
                  <th className="py-2 pr-3 text-right font-semibold">Achieved</th>
                  <th className="py-2 pr-3 text-right font-semibold">Bonus</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, pay }) => (
                  <tr key={p.person_id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 font-medium">{nameOf(p.person_id)}</td>
                    <td className="py-1.5 pr-3">
                      <NumberCell
                        value={p.target_override}
                        placeholder={String(scheme.target)}
                        label={`Target of ${nameOf(p.person_id)}`}
                        onSave={(v) => run(() => setTargetOverride(scheme.id, p.person_id, v))}
                      />
                      {scheme.kind === "percent" && pay.targetAmount !== null && (
                        <div className="text-[11px] text-muted-foreground">
                          {money(pay.targetAmount, pay.currency)}
                        </div>
                      )}
                    </td>
                    {criteria.map((c) => (
                      <td key={c.id} className="py-1.5 pr-3">
                        <NumberCell
                          value={
                            b.results.find(
                              (r) => r.person_id === p.person_id && r.criterion_id === c.id,
                            )?.achievement ?? null
                          }
                          placeholder="—"
                          label={`${c.name} for ${nameOf(p.person_id)}`}
                          onSave={(v) =>
                            run(() => setResult(orgId, scheme.id, p.person_id, c.id, v))
                          }
                        />
                      </td>
                    ))}
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {pay.achievement === null ? "—" : `${Math.round(pay.achievement)}%`}
                      {pay.capped && (
                        <div className="text-[11px] text-muted-foreground">capped</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                      {pay.payout !== null ? (
                        money(pay.payout, pay.currency)
                      ) : pay.targetAmount === null ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          No salary set
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={busy}
                        aria-label={`Remove ${nameOf(p.person_id)} from the scheme`}
                        onClick={() =>
                          run(
                            () => removeParticipant(scheme.id, p.person_id),
                            `Removed ${nameOf(p.person_id)}`,
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {sums.size > 0 && (
                <tfoot>
                  <tr>
                    <td
                      colSpan={criteria.length + 3}
                      className="py-2 pr-3 text-right font-semibold"
                    >
                      Total
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      {[...sums.entries()].map(([cur, sum]) => money(sum, cur)).join(" + ")}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Enter each result as a per cent of its goal: 100 is on target. Criteria without a result
          count as zero until one is entered. An empty target uses the scheme's.
        </p>
      </section>
    </div>
  );
}

/** A small number field that saves when it loses focus or Enter is pressed; empty clears. */
function NumberCell({
  value,
  placeholder,
  label,
  onSave,
}: {
  value: number | null;
  placeholder: string;
  label: string;
  onSave: (v: number | null) => Promise<boolean>;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const parsed = parseNum(text);
  const bad = Number.isNaN(parsed) || (parsed !== null && parsed > 1000);
  const commit = () => {
    if (bad) return;
    if (parsed === value) return;
    void onSave(parsed);
  };
  return (
    <Input
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn("h-8 w-20 text-right tabular-nums", bad && "border-destructive")}
    />
  );
}

function CriteriaEditor({
  draft,
  setDraft,
  busy,
  onSave,
}: {
  draft: { id?: string; name: string; weight: string }[];
  setDraft: (d: { id?: string; name: string; weight: string }[] | null) => void;
  busy: boolean;
  onSave: (next: { id?: string; name: string; weight: number }[]) => void;
}) {
  const weights = draft.map((c) => parseNum(c.weight));
  const bad =
    draft.some((c) => !c.name.trim()) ||
    weights.some((w) => w === null || Number.isNaN(w) || w > 100);
  const sum = weights.reduce<number>((s, w) => s + (w && !Number.isNaN(w) ? w : 0), 0);
  return (
    <div className="space-y-2">
      {draft.map((c, i) => (
        <div key={c.id ?? `new-${i}`} className="flex items-center gap-2">
          <Input
            value={c.name}
            maxLength={100}
            placeholder="e.g. Sales"
            aria-label="Criterion"
            onChange={(e) =>
              setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
          />
          <Input
            value={c.weight}
            inputMode="decimal"
            aria-label="Weight"
            className="w-20 text-right"
            onChange={(e) =>
              setDraft(draft.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))
            }
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${c.name || "criterion"}`}
            onClick={() => setDraft(draft.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft([...draft, { name: "", weight: String(Math.max(0, 100 - sum)) }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add a criterion
        </Button>
        <span
          className={cn(
            "text-xs",
            sum === 100 ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
          )}
        >
          Weights add up to {sum}%{sum === 100 ? "" : "; they are scaled to 100%"}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || bad}
          onClick={() =>
            onSave(draft.map((c, i) => ({ id: c.id, name: c.name, weight: weights[i]! })))
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function AddPeopleDialog({
  open,
  onClose,
  people,
  busy,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  people: { id: string; name: string }[];
  busy: boolean;
  onAdd: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setQuery("");
    }
  }, [open]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = people.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add people to the scheme</DialogTitle>
          <DialogDescription>Pick from People.</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a person"
          aria-label="Find a person"
        />
        <div className="flex gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPicked(new Set(shown.map((p) => p.id)))}
          >
            Pick all {shown.length}
          </Button>
          {picked.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              Clear
            </Button>
          )}
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted">
                <Checkbox checked={picked.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="text-sm">{p.name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-2 py-1 text-sm text-muted-foreground">
              {people.length ? "No one matches." : "Everyone is already in the scheme."}
            </li>
          )}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || picked.size === 0} onClick={() => onAdd([...picked])}>
            Add {picked.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
