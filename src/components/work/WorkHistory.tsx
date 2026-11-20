import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrgPerson } from "@/lib/orgCharts";
import {
  TABLE_LABELS,
  auditKey,
  describe,
  fetchAudit,
  shortDate,
  type AuditEntry,
  type AuditFilter,
  type AuditTable,
  type Describe,
} from "@/lib/workAudit";

type Props = {
  orgId: string;
  people: OrgPerson[];
  kindLabel: (key: string) => string;
  countryName: (code: string) => string;
};

const PAGE = 50;

function useDescribe({ people, kindLabel, countryName }: Omit<Props, "orgId">) {
  const byId = new Map(people.map((p) => [p.id, p.name]));
  const d: Describe = {
    personName: (id) => byId.get(id) ?? "someone no longer in the organisation",
    kindLabel,
    countryName,
  };
  const who = (e: AuditEntry) =>
    e.action === "snapshot"
      ? "Recorded"
      : e.changed_by
        ? (byId.get(e.changed_by) ?? "Someone no longer in the organisation")
        : "Talentloom (automatic)";
  return { d, who };
}

const time = (iso: string) => {
  const t = new Date(iso);
  return `${shortDate(t.toISOString().slice(0, 10))} ${String(t.getHours()).padStart(2, "0")}:${String(
    t.getMinutes(),
  ).padStart(2, "0")}`;
};

function EntryRow({ e, d, who }: { e: AuditEntry; d: Describe; who: string }) {
  const x = describe(e, d);
  return (
    <li className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span>
          <span className="font-semibold">{x.subject}</span>{" "}
          <span
            className={
              e.action === "delete"
                ? "text-rose-700 dark:text-rose-400"
                : e.action === "insert"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
            }
          >
            {x.verb}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {who} · <time dateTime={e.changed_at}>{time(e.changed_at)}</time>
        </span>
      </div>
      {x.lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {x.lines.map((l) => (
            <li key={l.field}>
              <span className="font-medium text-foreground/80">{l.field}:</span>{" "}
              {l.from !== undefined ? (
                <>
                  <span className="line-through decoration-muted-foreground/60">{l.from}</span> →{" "}
                  <span className="text-foreground">{l.to}</span>
                </>
              ) : (
                l.to
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The History tab: every change to Work and vacations, newest first, by kind
 * of record and by person.
 */
export function WorkHistory({ orgId, ...rest }: Props) {
  const [table, setTable] = useState<AuditTable | "">("");
  const [personId, setPersonId] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const filter: AuditFilter = {
    table: table || undefined,
    personId: personId || undefined,
    limit,
  };
  const q = useQuery({
    queryKey: auditKey(orgId, filter),
    queryFn: () => fetchAudit(orgId, filter),
    placeholderData: (prev) => prev,
  });
  const { d, who } = useDescribe(rest);
  const entries = q.data ?? [];
  const people = [...rest.people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Every change to working time, holidays and days off, kinds of absence, personal settings
          and absences: who made it, when, and what it was before. The history can't be edited or
          deleted.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={table}
            onChange={(e) => {
              setTable(e.target.value as AuditTable | "");
              setLimit(PAGE);
            }}
            aria-label="Show changes to"
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Everything</option>
            {(Object.keys(TABLE_LABELS) as AuditTable[]).map((t) => (
              <option key={t} value={t}>
                {TABLE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Whose absences and settings"
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">The history could not be loaded.</p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
          <History className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No changes recorded yet.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {entries.map((e) => (
              <EntryRow key={e.id} e={e} d={d} who={who(e)} />
            ))}
          </ul>
          {entries.length >= limit && (
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show older changes
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/** One record's history, for its own dialog. */
export function RecordHistory({
  orgId,
  table,
  rowKey,
  ...rest
}: Props & { table: AuditTable; rowKey: string }) {
  const [open, setOpen] = useState(false);
  const filter: AuditFilter = { table, rowKey, limit: 100 };
  const q = useQuery({
    queryKey: auditKey(orgId, filter),
    queryFn: () => fetchAudit(orgId, filter),
    enabled: open,
  });
  const { d, who } = useDescribe(rest);
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <History className="h-4 w-4" /> {open ? "Hide the history" : "Show the history"}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (q.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {(q.data ?? []).map((e) => (
                <EntryRow key={e.id} e={e} d={d} who={who(e)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
