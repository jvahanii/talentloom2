import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe as describeEntry, shortDate, type AuditEntry, type Describe } from "./workAudit";

const d: Describe = {
  personName: (id) => ({ p1: "Mikko Uosukainen" })[id] ?? "someone",
  kindLabel: (k) => ({ annual: "Annual leave", sick: "Sick leave" })[k] ?? k,
  countryName: (c) => ({ FI: "Finland" })[c] ?? c,
};
const entry = (p: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  table_name: "work_absences",
  row_key: "a1",
  person_id: "p1",
  action: "update",
  changed_by: null,
  changed_at: "2026-11-20T10:00:00Z",
  old_row: null,
  new_row: null,
  ...p,
});

test("an edited absence lists only what changed, in words", () => {
  const x = describeEntry(
    entry({
      old_row: {
        id: "a1",
        person_id: "p1",
        kind: "annual",
        start_date: "2026-12-21",
        end_date: "2026-12-23",
        note: null,
      },
      new_row: {
        id: "a1",
        person_id: "p1",
        kind: "sick",
        start_date: "2026-12-21",
        end_date: "2026-12-24",
        note: null,
      },
    }),
    d,
  );
  strictEqual(x.subject, "Absence of Mikko Uosukainen");
  strictEqual(x.verb, "changed");
  deepStrictEqual(x.lines, [
    { field: "Kind", from: "Annual leave", to: "Sick leave" },
    // Dates show in the viewer's own format.
    { field: "To", from: shortDate("2026-12-23"), to: shortDate("2026-12-24") },
  ]);
});

test("working days and countries read as names", () => {
  const x = describeEntry(
    entry({
      table_name: "work_settings",
      person_id: null,
      action: "insert",
      new_row: { org_id: "o", countries: ["FI"], work_days: [1, 2, 3, 4, 5], hours_per_day: 7.5 },
    }),
    d,
  );
  deepStrictEqual(x.lines.slice(0, 3), [
    { field: "Countries", to: "Finland" },
    { field: "Working days", to: "Mon, Tue, Wed, Thu, Fri" },
    { field: "Hours a day", to: "7.5" },
  ]);
});
