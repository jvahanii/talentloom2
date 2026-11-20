// The audit trail of Work and vacations: who changed which working time,
// holiday, day off, kind of absence, per-person setting or absence, when,
// and what it was before and after.
//
// public.work_audit_log is written only by the database trigger work_audit()
// on the five work_* tables (created directly on the backend project), so
// entries can't be forged, changed or deleted through the API. Everyone in
// the organisation can read its entries, as they can read the records.

import { supabase } from "@/integrations/supabase/app-client";
import { dateFormat, type DateFormat } from "./workVacations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type AuditTable =
  "work_settings" | "work_person_settings" | "work_days_off" | "work_leave_kinds" | "work_absences";

export type AuditEntry = {
  id: number;
  table_name: AuditTable;
  row_key: string;
  person_id: string | null;
  /** snapshot: how the record stood when the trail started. */
  action: "insert" | "update" | "delete" | "snapshot";
  changed_by: string | null;
  changed_at: string;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

export const auditKey = (orgId: string | null, filter: AuditFilter) => [
  "work-audit",
  orgId,
  filter,
];

export type AuditFilter = {
  table?: AuditTable;
  /** Whose records: absences and per-person settings. */
  personId?: string;
  /** One record (with table). */
  rowKey?: string;
  limit: number;
};

export async function fetchAudit(orgId: string, f: AuditFilter): Promise<AuditEntry[]> {
  let q = db
    .from("work_audit_log")
    .select("id, table_name, row_key, person_id, action, changed_by, changed_at, old_row, new_row")
    .eq("org_id", orgId)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(f.limit);
  if (f.table) q = q.eq("table_name", f.table);
  if (f.personId) q = q.eq("person_id", f.personId);
  if (f.rowKey) q = q.eq("row_key", f.rowKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export const TABLE_LABELS: Record<AuditTable, string> = {
  work_absences: "Absences",
  work_person_settings: "Personal settings",
  work_days_off: "Holidays and days off",
  work_leave_kinds: "Kinds of absence",
  work_settings: "Organisation's working time",
};

/** The fields shown, with their names; others (ids, time stamps) are left out. */
const FIELDS: Record<AuditTable, Record<string, string>> = {
  work_absences: {
    person_id: "Person",
    kind: "Kind",
    start_date: "From",
    end_date: "To",
    note: "Note",
  },
  work_person_settings: {
    country: "Country",
    work_days: "Working days",
    hours_per_day: "Hours a day",
    accrual_per_month: "Vacation days earned a month",
    accrued_override: "Earned days, set by hand",
    used_override: "Used days, set by hand",
  },
  work_days_off: { day: "Date", name: "Name", kind: "Type", every_year: "Every year" },
  work_leave_kinds: {
    label: "Name",
    vacation: "Uses vacation days",
    tone: "Colour",
    archived: "Hidden",
  },
  work_settings: {
    countries: "Countries",
    work_days: "Working days",
    hours_per_day: "Hours a day",
    accrual_per_month: "Vacation days earned a month",
    accrual_year_start: "Vacation year starts in month",
  },
};

/** Dates in the viewer's own format, made once (in the browser, with its locale). */
let formats: DateFormat | null = null;
const fmt = () => (formats ??= dateFormat());

/** "2026-03-05" as the viewer's locale writes it, e.g. "5.3.2026". */
export const shortDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? fmt().date(iso.slice(0, 10)) : iso;

/** A moment, as the viewer's locale writes its date and time. */
export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );

export type Describe = {
  personName: (id: string) => string;
  kindLabel: (key: string) => string;
  countryName: (code: string) => string;
};

function show(table: AuditTable, field: string, v: unknown, d: Describe): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "person_id") return d.personName(String(v));
  if (table === "work_absences" && field === "kind") return d.kindLabel(String(v));
  if (field === "work_days" && Array.isArray(v))
    return v.length ? v.map((n) => fmt().weekday(Number(n))).join(", ") : "none";
  if (field === "countries" && Array.isArray(v))
    return v.map((c) => d.countryName(String(c))).join(", ");
  if (field === "country") return d.countryName(String(v));
  if (field === "accrual_year_start") {
    const m = Number(v);
    return m >= 1 && m <= 12 ? fmt().firstOfMonth(m) : String(v);
  }
  if (table === "work_days_off" && field === "kind")
    return v === "working_day" ? "Working day (holiday worked)" : "Day off";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return shortDate(v);
  return String(v);
}

export type Described = {
  /** "Absence of Mikko Uosukainen", "Day off: Christmas Eve", … */
  subject: string;
  verb: string;
  /** For an update: each changed field; otherwise the record's fields. */
  lines: { field: string; from?: string; to?: string }[];
};

/** An entry in words. */
export function describe(e: AuditEntry, d: Describe): Described {
  const row = (e.new_row ?? e.old_row ?? {}) as Record<string, unknown>;
  const fields = FIELDS[e.table_name] ?? {};
  const subject = (() => {
    switch (e.table_name) {
      case "work_absences":
        return `Absence of ${d.personName(String(row.person_id ?? ""))}`;
      case "work_person_settings":
        return `Settings of ${d.personName(String(row.person_id ?? ""))}`;
      case "work_days_off":
        return `${row.kind === "working_day" ? "Working day" : "Day off"}: ${String(row.name ?? "")} (${show(e.table_name, "day", row.day, d)})`;
      case "work_leave_kinds":
        return `Kind of absence: ${String(row.label ?? "")}`;
      default:
        return "Organisation's working time";
    }
  })();
  const verb = {
    insert: "added",
    update: "changed",
    delete: "removed",
    snapshot: "as it was when the history started",
  }[e.action];
  const lines: Described["lines"] = [];
  if (e.action === "update" && e.old_row && e.new_row) {
    for (const [field, label] of Object.entries(fields)) {
      const a = JSON.stringify(e.old_row[field] ?? null);
      const b = JSON.stringify(e.new_row[field] ?? null);
      if (a !== b)
        lines.push({
          field: label,
          from: show(e.table_name, field, e.old_row[field], d),
          to: show(e.table_name, field, e.new_row[field], d),
        });
    }
  } else {
    for (const [field, label] of Object.entries(fields)) {
      if (field === "person_id" && e.table_name !== "work_absences") continue;
      const v = row[field];
      if (v === null || v === undefined || v === "") continue;
      lines.push({ field: label, to: show(e.table_name, field, v, d) });
    }
  }
  return { subject, verb, lines };
}
