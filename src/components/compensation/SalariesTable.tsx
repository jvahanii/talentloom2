import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useOrg } from "@/lib/org";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey } from "@/lib/orgCharts";
import { fetchWorkSettings, workSettingsKey } from "@/lib/workVacations";
import {
  currentSalaryOf,
  fetchOrgSalaries,
  formatMoney,
  formatSalary,
  formatSignedMoney,
  formatSignedPct,
  groupSalariesByUser,
  hoursPerYearFromWorkSettings,
  orgSalariesKey,
  salaryDelta,
  salaryToMonthlyAnnual,
  type SalaryCurrency,
  type SalaryEntry,
} from "@/lib/salaries";
import { PersonSalaryDialog } from "@/components/PersonSalaryDialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The Salaries tab of the Compensation page: everyone's current salary, the
 * one before it and the change between them, with totals. Clicking a row
 * opens the person's salary history (the same as on the People page), where
 * it can be changed by someone with "change titles", or by the person.
 */

type Row = {
  id: string;
  name: string;
  email: string | null;
  entries: SalaryEntry[];
  current: { entry: SalaryEntry; scheduled: boolean } | null;
  previous: SalaryEntry | undefined;
  delta: ReturnType<typeof salaryDelta>;
  annual: { amount: number; currency: SalaryCurrency } | null;
};

type Sort = "name" | "change" | "salary" | "date";

const dateText = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function SalariesTable() {
  const { orgId } = useOrg();
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [open, setOpen] = useState<string | null>(null);

  if (!orgId) return null;
  const people = peopleQ.data ?? [];
  const byUser = groupSalariesByUser(salariesQ.data ?? []);
  const hours = hoursPerYearFromWorkSettings(workQ.data);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";

  const rows: Row[] = people.map((p) => {
    const entries = byUser.get(p.id) ?? [];
    const current = currentSalaryOf(entries);
    const i = current ? entries.findIndex((e) => e.id === current.entry.id) : -1;
    const previous = i >= 0 ? entries[i + 1] : undefined;
    const cost = current ? salaryToMonthlyAnnual(current.entry, hours) : null;
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      entries,
      current,
      previous,
      delta: current ? salaryDelta(current.entry, previous) : null,
      annual: cost ? { amount: cost.annual, currency: cost.currency } : null,
    };
  });

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows
    .filter((r) => words.every((w) => `${r.name} ${r.email ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => {
      if (sort === "change")
        return (
          (b.delta?.pct ?? -Infinity) - (a.delta?.pct ?? -Infinity) || a.name.localeCompare(b.name)
        );
      if (sort === "salary") return (b.annual?.amount ?? -1) - (a.annual?.amount ?? -1);
      if (sort === "date")
        return (b.current?.entry.effective_date ?? "").localeCompare(
          a.current?.entry.effective_date ?? "",
        );
      return a.name.localeCompare(b.name);
    });

  // Totals by currency, and the changes.
  const totals = new Map<string, number>();
  for (const r of rows)
    if (r.annual)
      totals.set(r.annual.currency, (totals.get(r.annual.currency) ?? 0) + r.annual.amount);
  const changes = rows.flatMap((r) =>
    r.delta?.comparable && r.delta.pct !== null ? [r.delta.pct] : [],
  );
  const avgChange = changes.length ? changes.reduce((s, x) => s + x, 0) / changes.length : null;
  const raises = changes.filter((x) => x > 0).length;
  const cuts = changes.filter((x) => x < 0).length;
  const priced = rows.filter((r) => r.current).length;

  const openRow = rows.find((r) => r.id === open);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="People with a salary" value={`${priced} / ${rows.length}`} />
        <Stat
          label="Total a year"
          value={
            totals.size
              ? [...totals.entries()]
                  .map(([c, v]) => formatMoney(v, c as SalaryCurrency))
                  .join(" + ")
              : "—"
          }
        />
        <Stat
          label="Average change"
          value={avgChange === null ? "—" : formatSignedPct(avgChange)}
          note="since each person's previous salary"
        />
        <Stat label="Raises · decreases" value={`${raises} · ${cuts}`} />
      </div>

      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person"
            className="h-9 sm:max-w-xs"
          />
          <span className="flex-1" />
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-44" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="salary">Salary a year</SelectItem>
              <SelectItem value="change">Change</SelectItem>
              <SelectItem value="date">Latest change</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {salariesQ.isLoading || peopleQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 text-right font-semibold">Salary</th>
                  <th className="py-2 pr-3 text-right font-semibold">A year</th>
                  <th className="py-2 pr-3 font-semibold">Since</th>
                  <th className="py-2 pr-3 text-right font-semibold">Before</th>
                  <th className="py-2 pr-3 text-right font-semibold">Change</th>
                  <th className="py-2 text-right font-semibold">Changes</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const d = r.delta;
                  const up = d?.comparable && d.diff > 0;
                  const down = d?.comparable && d.diff < 0;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpen(r.id)}
                      className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                      title="Show the salary history"
                    >
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.current ? (
                          formatSalary(
                            r.current.entry.amount,
                            r.current.entry.currency,
                            r.current.entry.period,
                          )
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {r.annual
                          ? formatMoney(Math.round(r.annual.amount), r.annual.currency)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.current ? dateText(r.current.entry.effective_date) : "—"}
                        {r.current?.scheduled && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {r.previous
                          ? formatSalary(r.previous.amount, r.previous.currency, r.previous.period)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {!d ? (
                          <span className="text-muted-foreground">—</span>
                        ) : !d.comparable ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title="The currency or period changed"
                          >
                            Not comparable
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 font-semibold",
                              up && "text-emerald-700 dark:text-emerald-300",
                              down && "text-rose-700 dark:text-rose-300",
                              !up && !down && "text-muted-foreground",
                            )}
                          >
                            {up ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : down ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <Minus className="h-3.5 w-3.5" />
                            )}
                            {d.pct === null ? "—" : formatSignedPct(d.pct)}
                            <span className="text-xs font-normal text-muted-foreground">
                              {formatSignedMoney(d.diff, r.current!.entry.currency)}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.entries.length || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                {rows.length ? "No one matches." : "No one in People yet."}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The change is from each person's previous salary to the current one. Click a row for the
          full history and to add a change.
        </p>
      </section>

      <PersonSalaryDialog
        orgId={orgId}
        person={
          openRow
            ? { userId: openRow.id, name: openRow.name, email: openRow.email, titleName: null }
            : null
        }
        entries={openRow?.entries ?? []}
        nameOf={nameOf}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border-2 border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-base font-semibold tabular-nums" title={value}>
        {value}
      </div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}
