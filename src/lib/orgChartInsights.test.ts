import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import type { ChartMember, ChartNode, ImpliedLine } from "./orgCharts";
import {
  compareCharts,
  impliedInCreationOrder,
  reportingConflicts,
  spanCounts,
} from "./orgChartInsights";

let seq = 0;
const node = (p: Partial<ChartNode> & Pick<ChartNode, "id" | "kind" | "role">): ChartNode => ({
  parent_id: null,
  person_name: null,
  person_id: null,
  unit_id: null,
  note: null,
  position: seq++,
  created_at: "2026-11-20T00:00:00Z",
  ...p,
});
const member = (id: string, node_id: string, person_name: string): ChartMember => ({
  id,
  node_id,
  person_id: null,
  person_name,
  position: 0,
});
const nameOf = (n: ChartNode) => n.person_name;
const memberName = (m: ChartMember) => m.person_name;

// Units: Company (head Ceo) > Finance (head Fiona), HR (head Hanna); Ben in Finance.
const units = [
  node({ id: "u-co", kind: "unit", role: "Company", person_name: "Ceo" }),
  node({ id: "u-fin", kind: "unit", role: "Finance", parent_id: "u-co", person_name: "Fiona" }),
  node({ id: "u-hr", kind: "unit", role: "HR", parent_id: "u-co", person_name: "Hanna" }),
];
const members = [member("m-ben", "u-fin", "Ben")];

test("no notes when reporting lines follow the units", () => {
  const roles = [
    node({ id: "r-ceo", kind: "role", role: "CEO", person_name: "Ceo", unit_id: "u-co" }),
    node({
      id: "r-cfo",
      kind: "role",
      role: "CFO",
      person_name: "Fiona",
      unit_id: "u-fin",
      parent_id: "r-ceo",
    }),
    node({
      id: "r-acc",
      kind: "role",
      role: "Accountant",
      person_name: "Ben",
      unit_id: "u-fin",
      parent_id: "r-cfo",
    }),
  ];
  strictEqual(reportingConflicts([...units, ...roles], members, nameOf, memberName).size, 0);
});

test("reporting past the unit's head, and a role in another unit, are noted", () => {
  const roles = [
    node({ id: "r-ceo", kind: "role", role: "CEO", person_name: "Ceo", unit_id: "u-co" }),
    node({
      id: "r-cfo",
      kind: "role",
      role: "CFO",
      person_name: "Fiona",
      unit_id: "u-fin",
      parent_id: "r-ceo",
    }),
    // Ben is in Finance, but this role is in HR and reports to the CEO.
    node({
      id: "r-acc",
      kind: "role",
      role: "Accountant",
      person_name: "Ben",
      unit_id: "u-hr",
      parent_id: "r-ceo",
    }),
  ];
  const notes = reportingConflicts([...units, ...roles], members, nameOf, memberName);
  deepStrictEqual([...notes.keys()], ["r-acc"]);
  strictEqual(notes.get("r-acc")!.length, 2);
  strictEqual(notes.get("r-acc")![0], "Ben is in Finance on Units, but this role is in HR.");
});

test("an open manager role or a role without a unit gives no note", () => {
  const roles = [
    node({ id: "r-ceo", kind: "role", role: "CEO", unit_id: "u-co" }),
    node({
      id: "r-cfo",
      kind: "role",
      role: "CFO",
      person_name: "Fiona",
      unit_id: "u-fin",
      parent_id: "r-ceo",
    }),
    node({ id: "r-x", kind: "role", role: "Advisor", person_name: "Xavier", parent_id: "r-cfo" }),
  ];
  strictEqual(reportingConflicts([...units, ...roles], members, nameOf, memberName).size, 0);
});

test("span counts direct reports and everyone below", () => {
  const kids: Record<string, string[]> = { a: ["b", "c"], b: ["d"], c: [], d: [] };
  const spans = spanCounts(["a"], (k) => kids[k] ?? []);
  deepStrictEqual(spans.get("a"), { direct: 2, total: 3 });
  deepStrictEqual(spans.get("b"), { direct: 1, total: 1 });
});

test("implied lines come after the lines they hang under", () => {
  const line = (key: string, parent: string) => ({ key, parent }) as ImpliedLine;
  const order = impliedInCreationOrder([
    line("implied:member:1", "implied:head:u"),
    line("implied:head:u", "r-ceo"),
  ]).map((l) => l.key);
  deepStrictEqual(order, ["implied:head:u", "implied:member:1"]);
});

test("comparing charts finds added, removed and changed boxes", () => {
  const base = {
    nodes: [
      node({ id: "a1", kind: "role", role: "CEO", person_name: "Ceo" }),
      node({ id: "a2", kind: "role", role: "CFO", person_name: "Fiona", parent_id: "a1" }),
      node({ id: "a3", kind: "role", role: "Intern", person_name: "Ian", parent_id: "a2" }),
    ],
    members: [],
  };
  const next = {
    nodes: [
      node({ id: "b1", kind: "role", role: "CEO", person_name: "Ceo" }),
      node({ id: "b2", kind: "role", role: "CFO", person_name: "Frank", parent_id: "b1" }),
      node({ id: "b4", kind: "role", role: "Controller", person_name: "Cora", parent_id: "b2" }),
    ],
    members: [],
  };
  const { roles } = compareCharts(base, next, nameOf, memberName);
  deepStrictEqual(roles.map((c) => `${c.kind}:${c.what}`).sort(), [
    "added:Controller",
    "changed:CFO",
    "removed:Intern",
  ]);
  strictEqual(roles.find((c) => c.what === "CFO")!.detail, "Fiona → Frank");
});
