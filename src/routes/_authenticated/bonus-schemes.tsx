import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Ban,
  Building2,
  Network,
  Check,
  Download,
  Gift,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
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
import { fetchTeams, teamsKey } from "@/lib/teams";
import {
  STATUS_LABEL,
  addTargets,
  coveredPeople,
  fetchOrgUnits,
  orgUnitsKey,
  bonusesKey,
  deleteScheme,
  fetchBonuses,
  payoutOf,
  removeTarget,
  saveCriteria,
  saveScheme,
  setCompanyResult,
  setResult,
  setTargetOverride,
  type Bonuses,
  type OrgUnit,
  type Target,
  type Criterion,
  type MeasureInput,
  type Payout,
  type PayoutState,
  type Scheme,
  type SchemeInput,
  type SchemeKind,
  type SchemeStatus,
  type Scope,
} from "@/lib/bonuses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
const sumText = (sums: Map<string, number>) =>
  sums.size ? [...sums.entries()].map(([cur, s]) => money(s, cur)).join(" + ") : "—";

const STATUS_TONE: Record<SchemeStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  closed: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};
const STATE: Record<PayoutState, { label: string; tone: string }> = {
  ok: {
    label: "Final",
    tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  },
  pending: {
    label: "Waiting for results",
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  "no-salary": {
    label: "No salary set",
    tone: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  },
  "below-threshold": { label: "Below threshold", tone: "bg-muted text-muted-foreground" },
};

type SchemeForm = Omit<SchemeInput, "target" | "max_payout_pct" | "threshold_pct"> & {
  target: string;
  max_payout_pct: string;
  threshold_pct: string;
};

type Row = {
  personId: string;
  name: string;
  annual: { amount: number; currency: string } | null;
  pay: Payout;
  override: number | null;
  /** Why they are in the scheme: "Entire company", a unit, a team, "Added by name". */
  via: string[];
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
  const unitsQ = useQuery({
    queryKey: orgUnitsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgUnits(orgId!),
  });
  const teamsQ = useQuery({
    queryKey: teamsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchTeams(orgId!),
  });
  const units = unitsQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const workQ = useQuery({
    queryKey: workSettingsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchWorkSettings(orgId!),
  });
  const b: Bonuses = bonusesQ.data ?? {
    schemes: [],
    criteria: [],
    targets: [],
    participants: [],
    results: [],
  };
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

  /** Who a scheme covers, and why. */
  const coverOf = (s: Scheme) =>
    coveredPeople({
      targets: b.targets.filter((t) => t.scheme_id === s.id),
      members: people.map((p) => p.id),
      units,
      teams,
    });
  /** Everyone a scheme covers, with what they earn. */
  const rowsOf = (s: Scheme): Row[] => {
    const criteria = b.criteria.filter((c) => c.scheme_id === s.id);
    return [...coverOf(s).entries()]
      .map(([personId, via]) => {
        const p = b.participants.find((x) => x.scheme_id === s.id && x.person_id === personId) ?? {
          scheme_id: s.id,
          person_id: personId,
          target_override: null,
        };
        const annual = annualOf(personId);
        return {
          personId,
          name: nameOf(personId),
          annual,
          override: p.target_override,
          via,
          pay: payoutOf({
            scheme: s,
            criteria,
            results: b.results.filter((r) => r.scheme_id === s.id && r.person_id === personId),
            participant: p,
            annualSalary: annual,
          }),
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
  };
  const totalsOf = (rows: Row[]) => {
    const sums = new Map<string, number>();
    for (const r of rows)
      if (r.pay.payout !== null)
        sums.set(r.pay.currency, (sums.get(r.pay.currency) ?? 0) + r.pay.payout);
    return sums;
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
      threshold_pct: "0",
      max_payout_pct: "100",
      status: "draft",
    };
  };
  const formOf = (s: Scheme): SchemeForm => ({
    ...s,
    description: s.description ?? "",
    target: String(s.target),
    max_payout_pct: String(s.max_payout_pct),
    threshold_pct: String(s.threshold_pct),
  });
  const fTarget = form ? parseNum(form.target) : null;
  const fMax = form ? parseNum(form.max_payout_pct) : null;
  const fThreshold = form ? parseNum(form.threshold_pct) : null;
  const formBad =
    !form ||
    !form.name.trim() ||
    [fTarget, fMax, fThreshold].some((v) => v === null || Number.isNaN(v)) ||
    fMax! > 1000 ||
    fThreshold! > fMax! ||
    form.end_date < form.start_date;
  const shownRows = scheme ? rowsOf(scheme) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold">Bonus schemes</h1>
          <p className="text-sm text-muted-foreground">
            Set up a scheme's measures and people, enter the results — company-wide ones once,
            individual ones per person — and review the payouts. Salaries come from the People page.
            Everyone in the organisation can see and edit them.
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
            For example 10% of annual salary: half on company EBITDA, half on each person's customer
            satisfaction.
          </p>
          <Button className="mt-4" onClick={() => setForm(newForm())}>
            <Plus className="mr-1 h-4 w-4" /> New scheme
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="space-y-2">
            {b.schemes.map((s) => {
              const rows = rowsOf(s);
              const done = rows.filter((r) => r.pay.missing === 0).length;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      "w-full space-y-1 rounded-2xl border-2 bg-card p-3 text-left transition hover:border-primary",
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
                      {dateText(s.start_date)}–{dateText(s.end_date)}
                    </p>
                    <p className="text-xs">
                      {rows.length} {rows.length === 1 ? "person" : "people"} ·{" "}
                      {sumText(totalsOf(rows))}
                    </p>
                    {rows.length > 0 && (
                      <Progress value={(done / rows.length) * 100} className="h-1" />
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
              rows={shownRows}
              totals={totalsOf(shownRows)}
              busy={busy}
              run={run}
              onEdit={() => setForm(formOf(scheme))}
              onAddPeople={() => setAdding(true)}
              units={units}
              teams={teams}
              nameOf={nameOf}
            />
          )}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit the scheme" : "New bonus scheme"}</DialogTitle>
            <DialogDescription>Add its measures and people after saving.</DialogDescription>
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
                      target: fTarget!,
                      max_payout_pct: fMax!,
                      threshold_pct: fThreshold!,
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
                  placeholder="e.g. Company success bonus 2027"
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
                <Label>Target bonus</Label>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <Select
                    value={form.kind}
                    onValueChange={(v) => setForm({ ...form, kind: v as SchemeKind })}
                  >
                    <SelectTrigger aria-label="Kind of target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">% of annual salary</SelectItem>
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
                  What someone gets when every measure is exactly on target.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheme-threshold">Threshold %</Label>
                  <Input
                    id="scheme-threshold"
                    inputMode="decimal"
                    value={form.threshold_pct}
                    onChange={(e) => setForm({ ...form, threshold_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scheme-max">Cap %</Label>
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
              <p className="text-xs text-muted-foreground">
                Below the threshold nothing is paid (0 = always paid); above it the bonus grows with
                the results, up to the cap (100 = never more than the target).
              </p>
              {form.end_date < form.start_date && (
                <p className="text-sm text-destructive">The end can't be before the start.</p>
              )}
              {fThreshold !== null && fMax !== null && fThreshold > fMax && (
                <p className="text-sm text-destructive">The threshold can't be above the cap.</p>
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
          people={people.filter((p) => !coverOf(scheme).has(p.id))}
          busy={busy}
          onAdd={async (ids) => {
            if (
              await run(
                async () => {
                  // Someone left out before is in again.
                  for (const t of b.targets)
                    if (
                      t.scheme_id === scheme.id &&
                      t.kind === "exclude" &&
                      ids.includes(t.ref_id ?? "")
                    )
                      await removeTarget(t.id);
                  await addTargets(
                    orgId,
                    scheme.id,
                    ids.map((id) => ({ kind: "person" as const, ref_id: id })),
                  );
                },
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
              Its measures, people and results are deleted too. This can't be undone.
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

// ---------------------------------------------------------------- one scheme

function SchemeView({
  orgId,
  scheme,
  b,
  rows,
  totals,
  busy,
  run,
  onEdit,
  onAddPeople,
  units,
  teams,
  nameOf,
}: {
  orgId: string;
  scheme: Scheme;
  b: Bonuses;
  rows: Row[];
  totals: Map<string, number>;
  busy: boolean;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
  onEdit: () => void;
  onAddPeople: () => void;
  units: OrgUnit[];
  teams: { id: string; name: string; members: string[] }[];
  nameOf: (id: string) => string;
}) {
  const targets = b.targets.filter((t) => t.scheme_id === scheme.id);
  /** Takes someone out: their own entry goes, and if a unit, team or the company brings them in, they are left out. */
  const leaveOut = (r: Row) => {
    const own = targets.find((t) => t.kind === "person" && t.ref_id === r.personId);
    const onlyByName = r.via.every((v) => v === "Added by name");
    return run(
      async () => {
        if (own) await removeTarget(own.id);
        if (!onlyByName)
          await addTargets(orgId, scheme.id, [{ kind: "exclude", ref_id: r.personId }]);
      },
      onlyByName ? `Removed ${r.name}` : `Left ${r.name} out`,
    );
  };
  const criteria = b.criteria.filter((c) => c.scheme_id === scheme.id);
  const company = criteria.filter((c) => c.scope === "company");
  const individual = criteria.filter((c) => c.scope === "individual");
  const weightSum = criteria.reduce((s, c) => s + c.weight, 0);
  const share = (c: Criterion) => (weightSum ? (c.weight / weightSum) * 100 : 0);
  const complete = rows.filter((r) => r.pay.missing === 0).length;
  const noSalary = rows.filter((r) => r.pay.state === "no-salary").length;
  const achieved = rows.filter((r) => r.pay.achievement !== null);
  const avg = achieved.length
    ? achieved.reduce((s, r) => s + r.pay.achievement!, 0) / achieved.length
    : null;
  const setUp = criteria.length > 0 && rows.length > 0;
  const [tab, setTab] = useState(
    setUp ? (complete === rows.length ? "payouts" : "results") : "setup",
  );

  const targetText =
    scheme.kind === "percent"
      ? `${scheme.target}% of annual salary`
      : money(scheme.target, scheme.currency);

  return (
    <div className="min-w-0 space-y-4">
      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{scheme.name}</h2>
            <p className="text-sm text-muted-foreground">
              {dateText(scheme.start_date)}–{dateText(scheme.end_date)} · Target {targetText}
              {scheme.threshold_pct > 0 ? ` · Paid from ${pct(scheme.threshold_pct)}` : ""} · Cap{" "}
              {pct(scheme.max_payout_pct)}
            </p>
          </div>
          <span className={cn("rounded-full px-2 text-xs", STATUS_TONE[scheme.status])}>
            {STATUS_LABEL[scheme.status]}
          </span>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        {scheme.description && <p className="whitespace-pre-line text-sm">{scheme.description}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="People" value={String(rows.length)} />
          <Stat
            label="Results complete"
            value={rows.length && criteria.length ? `${complete} / ${rows.length}` : "—"}
            note={rows.length && complete < rows.length ? "missing results count as 0" : undefined}
          />
          <Stat label="Average achievement" value={avg === null ? "—" : pct(avg)} />
          <Stat
            label={rows.length && complete === rows.length ? "Total payout" : "Total so far"}
            value={sumText(totals)}
            note={noSalary ? `${noSalary} without a salary` : undefined}
            warn={noSalary > 0}
          />
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="setup">
            <StepMark n={1} done={setUp} /> Measures and people
          </TabsTrigger>
          <TabsTrigger value="results">
            <StepMark n={2} done={setUp && complete === rows.length} /> Results
          </TabsTrigger>
          <TabsTrigger value="payouts">
            <StepMark n={3} done={false} /> Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <MeasuresSection
            orgId={orgId}
            scheme={scheme}
            criteria={criteria}
            all={b.criteria}
            share={share}
            busy={busy}
            run={run}
          />
          <section className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
            <Coverage
              orgId={orgId}
              schemeId={scheme.id}
              targets={targets}
              units={units}
              teams={teams}
              nameOf={nameOf}
              busy={busy}
              run={run}
              onAddPeople={onAddPeople}
            />
            <h3 className="pt-2 font-semibold">People ({rows.length})</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No one yet: add the entire company, a unit, a team or people above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">Person</th>
                      <th className="py-2 pr-3 font-semibold">Included as</th>
                      <th className="py-2 pr-3 font-semibold">Annual salary</th>
                      <th className="py-2 pr-3 font-semibold">
                        Own target{scheme.kind === "percent" ? " (%)" : ""}
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">Target bonus</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.personId} className="border-b border-border/60">
                        <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                        <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                          {r.via.join(", ")}
                        </td>
                        <td className="py-1.5 pr-3">
                          {r.annual ? (
                            money(r.annual.amount, r.annual.currency)
                          ) : (
                            <span className="text-xs text-rose-700 dark:text-rose-300">
                              Not set on People
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          <NumberCell
                            value={r.override}
                            placeholder={`${scheme.target}`}
                            label={`Own target of ${r.name}`}
                            onSave={(v) =>
                              run(() => setTargetOverride(orgId, scheme.id, r.personId, v))
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {r.pay.targetAmount === null
                            ? "—"
                            : money(r.pay.targetAmount, r.pay.currency)}
                        </td>
                        <td className="py-1.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={busy}
                            aria-label={`Leave ${r.name} out of the scheme`}
                            title="Leave out of the scheme"
                            onClick={() => leaveOut(r)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave "own target" empty to use the scheme's ({targetText}).
            </p>
          </section>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {criteria.length === 0 ? (
            <Empty text="Add the scheme's measures first, under Measures and people." />
          ) : (
            <>
              <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
                <h3 className="flex items-center gap-1.5 font-semibold">
                  <Building2 className="h-4 w-4" /> Company results
                </h3>
                {company.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No company-wide measures in this scheme.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      One result for everyone in the scheme, as a per cent of the goal (100 = on
                      target).
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {company.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-3 rounded-xl border-2 border-border p-3"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(share(c))}% of the bonus
                            </span>
                          </span>
                          <NumberCell
                            value={c.company_achievement}
                            placeholder="—"
                            label={`${c.name} result`}
                            wide
                            onSave={(v) => run(() => setCompanyResult(c.id, v), `Saved ${c.name}`)}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
              <IndividualResults
                orgId={orgId}
                scheme={scheme}
                individual={individual}
                rows={rows}
                b={b}
                share={share}
                run={run}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="payouts">
          <PayoutsTable
            scheme={scheme}
            rows={rows}
            totals={totals}
            complete={rows.length > 0 && complete === rows.length}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums" title={value}>
        {value}
      </div>
      {note && (
        <div
          className={cn(
            "text-[11px]",
            warn ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground",
          )}
        >
          {note}
        </div>
      )}
    </div>
  );
}

function StepMark({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cn(
        "mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
        done ? "bg-emerald-600 text-white" : "bg-muted-foreground/20",
      )}
    >
      {done ? <Check className="h-3 w-3" /> : n}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

// ---------------------------------------------------------------- measures

type MeasureDraft = { id?: string; name: string; weight: string; scope: Scope };

function MeasuresSection({
  orgId,
  scheme,
  criteria,
  all,
  share,
  busy,
  run,
}: {
  orgId: string;
  scheme: Scheme;
  criteria: Criterion[];
  all: Criterion[];
  share: (c: Criterion) => number;
  busy: boolean;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<MeasureDraft[] | null>(null);
  const weights = draft?.map((c) => parseNum(c.weight)) ?? [];
  const sum = weights.reduce<number>((s, w) => s + (w && !Number.isNaN(w) ? w : 0), 0);
  const bad =
    !!draft &&
    (draft.some((c) => !c.name.trim()) ||
      weights.some((w) => w === null || Number.isNaN(w) || w > 100));
  const group = (scope: Scope) => criteria.filter((c) => c.scope === scope);
  const edit = (i: number, patch: Partial<MeasureDraft>) =>
    setDraft(draft!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-semibold">Measures</h3>
        {!draft && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft(
                criteria.length
                  ? criteria.map((c) => ({
                      id: c.id,
                      name: c.name,
                      weight: String(c.weight),
                      scope: c.scope,
                    }))
                  : [
                      { name: "", weight: "50", scope: "company" },
                      { name: "", weight: "50", scope: "individual" },
                    ],
              )
            }
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />{" "}
            {criteria.length ? "Edit measures" : "Add measures"}
          </Button>
        )}
      </div>
      {draft ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_9rem_5rem_2.25rem] gap-2 text-xs text-muted-foreground">
            <span>Measure</span>
            <span>Result</span>
            <span className="text-right">Weight %</span>
            <span />
          </div>
          {draft.map((c, i) => (
            <div
              key={c.id ?? `new-${i}`}
              className="grid grid-cols-[1fr_9rem_5rem_2.25rem] items-center gap-2"
            >
              <Input
                value={c.name}
                maxLength={100}
                placeholder={c.scope === "company" ? "e.g. EBITDA" : "e.g. Customer satisfaction"}
                aria-label="Measure"
                onChange={(e) => edit(i, { name: e.target.value })}
              />
              <Select value={c.scope} onValueChange={(v) => edit(i, { scope: v as Scope })}>
                <SelectTrigger aria-label="Whose result">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company-wide</SelectItem>
                  <SelectItem value="individual">Per person</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={c.weight}
                inputMode="decimal"
                aria-label="Weight"
                className="text-right"
                onChange={(e) => edit(i, { weight: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${c.name || "measure"}`}
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
              onClick={() =>
                setDraft([
                  ...draft,
                  { name: "", weight: String(Math.max(0, 100 - sum)), scope: "individual" },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add a measure
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
              disabled={busy || bad || draft.length === 0}
              onClick={async () => {
                const next: MeasureInput[] = draft.map((c, i) => ({
                  id: c.id,
                  name: c.name,
                  weight: weights[i]!,
                  scope: c.scope,
                }));
                if (
                  await run(() => saveCriteria(orgId, scheme.id, all, next), "Saved the measures")
                )
                  setDraft(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          What the bonus is paid for. A company-wide measure (EBITDA, cash flow) has one result for
          everyone; a per-person measure (customer satisfaction, own sales) has a result for each
          person.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["company", "individual"] as Scope[]).map((scope) => (
            <div key={scope} className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                {scope === "company" ? (
                  <Building2 className="h-3.5 w-3.5" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                {scope === "company" ? "Company-wide: one result" : "Per person: a result each"}
              </h4>
              {group(scope).length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-1">
                  {group(scope).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {Math.round(share(c))}%
                      </span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${share(c)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- results

function IndividualResults({
  orgId,
  scheme,
  individual,
  rows,
  b,
  share,
  run,
}: {
  orgId: string;
  scheme: Scheme;
  individual: Criterion[];
  rows: Row[];
  b: Bonuses;
  share: (c: Criterion) => number;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
}) {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const resultOf = (personId: string, criterionId: string) =>
    b.results.find((r) => r.person_id === personId && r.criterion_id === criterionId)
      ?.achievement ?? null;
  const missingFor = (personId: string) =>
    individual.filter((c) => resultOf(personId, c.id) === null).length;
  const done = rows.filter((r) => missingFor(r.personId) === 0).length;
  const shown = onlyMissing ? rows.filter((r) => missingFor(r.personId) > 0) : rows;

  return (
    <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex flex-1 items-center gap-1.5 font-semibold">
          <UserRound className="h-4 w-4" /> Results per person
        </h3>
        {individual.length > 0 && rows.length > 0 && (
          <>
            <span className="text-sm text-muted-foreground">
              {done} / {rows.length} complete
            </span>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} />
              Only missing
            </label>
          </>
        )}
      </div>
      {individual.length === 0 ? (
        <p className="text-sm text-muted-foreground">No per-person measures in this scheme.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add people under Measures and people first.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Each as a per cent of its goal (100 = on target). Saved when you leave a field or press
            Enter.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  {individual.map((c) => (
                    <th key={c.id} className="py-2 pr-3 font-semibold">
                      {c.name} <span className="font-normal">({Math.round(share(c))}%)</span>
                    </th>
                  ))}
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.personId} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                    {individual.map((c) => (
                      <td key={c.id} className="py-1.5 pr-3">
                        <NumberCell
                          value={resultOf(r.personId, c.id)}
                          placeholder="—"
                          label={`${c.name} for ${r.name}`}
                          onSave={(v) =>
                            run(() => setResult(orgId, scheme.id, r.personId, c.id, v))
                          }
                        />
                      </td>
                    ))}
                    <td className="py-1.5 text-right">
                      {missingFor(r.personId) === 0 && (
                        <Check className="ml-auto h-4 w-4 text-emerald-600" aria-label="Complete" />
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td
                      colSpan={individual.length + 2}
                      className="py-3 text-sm text-muted-foreground"
                    >
                      Everyone's results are in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- payouts

function PayoutsTable({
  scheme,
  rows,
  totals,
  complete,
}: {
  scheme: Scheme;
  rows: Row[];
  totals: Map<string, number>;
  complete: boolean;
}) {
  const scale = Math.max(scheme.max_payout_pct, 100);
  const exportCsv = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Person", "Achievement %", "Target bonus", "Bonus", "Currency", "Status"].map(q).join(","),
      ...rows.map((r) =>
        [
          q(r.name),
          r.pay.achievement === null ? "" : String(Math.round(r.pay.achievement * 10) / 10),
          r.pay.targetAmount === null ? "" : r.pay.targetAmount.toFixed(2),
          r.pay.payout === null ? "" : r.pay.payout.toFixed(2),
          r.pay.currency,
          q(STATE[r.pay.state].label),
        ].join(","),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${scheme.name.replace(/[^\w\- ]+/g, "").trim() || "bonus"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (rows.length === 0) return <Empty text="Add people under Measures and people first." />;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {complete
            ? "Every result is in: these are the payouts."
            : "Some results are still missing and count as 0, so these are not final yet."}
        </p>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Person</th>
              <th className="py-2 pr-3 font-semibold">Achievement</th>
              <th className="py-2 pr-3 text-right font-semibold">Target bonus</th>
              <th className="py-2 pr-3 text-right font-semibold">Bonus</th>
              <th className="py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = r.pay.achievement;
              return (
                <tr key={r.personId} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3">
                    {a === null ? (
                      "—"
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="relative h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full",
                              a < scheme.threshold_pct ? "bg-muted-foreground/40" : "bg-primary",
                            )}
                            style={{ width: `${Math.min(100, (a / scale) * 100)}%` }}
                          />
                          {/* The target, 100%. */}
                          <span
                            className="absolute inset-y-0 w-px bg-foreground/50"
                            style={{ left: `${(100 / scale) * 100}%` }}
                          />
                        </span>
                        <span className="tabular-nums">{pct(a)}</span>
                        {r.pay.capped && (
                          <span className="text-[11px] text-muted-foreground">capped</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {r.pay.targetAmount === null ? "—" : money(r.pay.targetAmount, r.pay.currency)}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {r.pay.payout === null ? "—" : money(r.pay.payout, r.pay.currency)}
                  </td>
                  <td className="py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px]",
                        STATE[r.pay.state].tone,
                      )}
                    >
                      {STATE[r.pay.state].label}
                      {r.pay.state === "pending" ? ` (${r.pay.missing} missing)` : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 pr-3 text-right font-semibold">
                {complete ? "Total" : "Total so far"}
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">{sumText(totals)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- small parts

/** A small number field that saves when it loses focus or Enter is pressed; empty clears. */
function NumberCell({
  value,
  placeholder,
  label,
  wide,
  onSave,
}: {
  value: number | null;
  placeholder: string;
  label: string;
  wide?: boolean;
  onSave: (v: number | null) => Promise<boolean>;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const parsed = parseNum(text);
  const bad = Number.isNaN(parsed) || (parsed !== null && parsed > 1000);
  const commit = () => {
    if (bad || parsed === value) return;
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
      className={cn(
        "h-8 text-right tabular-nums",
        wide ? "w-24 text-base" : "w-20",
        bad && "border-destructive",
      )}
    />
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
        <div className="flex gap-2">
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

// ---------------------------------------------------------------- who is covered

function Coverage({
  orgId,
  schemeId,
  targets,
  units,
  teams,
  nameOf,
  busy,
  run,
  onAddPeople,
}: {
  orgId: string;
  schemeId: string;
  targets: Target[];
  units: OrgUnit[];
  teams: { id: string; name: string; members: string[] }[];
  nameOf: (id: string) => string;
  busy: boolean;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
  onAddPeople: () => void;
}) {
  const included = targets.filter((t) => t.kind !== "exclude");
  const excluded = targets.filter((t) => t.kind === "exclude");
  const has = (kind: string, ref: string | null) =>
    targets.some((t) => t.kind === kind && t.ref_id === ref);
  const unitOf = (id: string | null) => units.find((u) => u.id === id);
  const teamOf = (id: string | null) => teams.find((t) => t.id === id);
  const charts = [...new Set(units.map((u) => u.chart))].sort((a, b) => a.localeCompare(b));
  const chip = (t: Target) => {
    if (t.kind === "company") return { icon: Building2, text: "Entire company" };
    if (t.kind === "unit") {
      const u = unitOf(t.ref_id);
      return {
        icon: Network,
        text: u ? `${u.name} (${u.chart})` : "A unit not on the active org chart",
      };
    }
    if (t.kind === "team")
      return { icon: UsersRound, text: teamOf(t.ref_id)?.name ?? "A deleted team" };
    return { icon: UserRound, text: nameOf(t.ref_id ?? "") };
  };
  const add = (kind: "company" | "unit" | "team", ref: string | null, label: string) =>
    run(() => addTargets(orgId, schemeId, [{ kind, ref_id: ref }]), `Added ${label}`);

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
      <h3 className="font-semibold">Who the scheme covers</h3>
      {included.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {included.map((t) => {
            const c = chip(t);
            return (
              <li
                key={t.id}
                className="flex items-center gap-1 rounded-full border-2 border-border bg-background py-0.5 pl-2 pr-1 text-sm"
              >
                <c.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {c.text}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${c.text}`}
                  onClick={() => run(() => removeTarget(t.id), `Removed ${c.text}`)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || has("company", null)}
          onClick={() => add("company", null, "the entire company")}
        >
          <Building2 className="mr-1 h-3.5 w-3.5" /> Entire company
        </Button>
        <Select
          value=""
          onValueChange={(id) => {
            const u = unitOf(id);
            if (u) void add("unit", id, u.name);
          }}
        >
          <SelectTrigger className="h-9 w-48" aria-label="Add a unit">
            <SelectValue placeholder="Add a unit" />
          </SelectTrigger>
          <SelectContent>
            {units.length === 0 && (
              <SelectItem value="__none__" disabled>
                No units on the org chart
              </SelectItem>
            )}
            {charts.map((ch) => (
              <SelectGroup key={ch}>
                <SelectLabel>{ch}</SelectLabel>
                {units
                  .filter((u) => u.chart === ch && !has("unit", u.id))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value=""
          onValueChange={(id) => {
            const t = teamOf(id);
            if (t) void add("team", id, t.name);
          }}
        >
          <SelectTrigger className="h-9 w-44" aria-label="Add a team">
            <SelectValue placeholder="Add a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.length === 0 && (
              <SelectItem value="__none__" disabled>
                No teams yet
              </SelectItem>
            )}
            {teams
              .filter((t) => !has("team", t.id))
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.members.length})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={onAddPeople}>
          <UserPlus className="mr-1 h-3.5 w-3.5" /> People
        </Button>
      </div>
      {excluded.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Ban className="h-3.5 w-3.5" /> Left out:
          </span>
          {excluded.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-1 rounded-full border border-dashed border-border py-0.5 pl-2 pr-1"
            >
              {nameOf(t.ref_id ?? "")}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => removeTarget(t.id), `${nameOf(t.ref_id ?? "")} is in again`)
                }
                className="rounded-full px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Include again
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A unit brings in its head, its members and those of the units within it. The list follows
        changes: someone who joins a covered unit or team, or the company, is in the scheme too.
      </p>
    </div>
  );
}
