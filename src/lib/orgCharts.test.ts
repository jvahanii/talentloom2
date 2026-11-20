import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { impliedReporting, type ChartMember, type ChartNode, type DottedLine } from "./orgCharts";

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
/** "Mikko → Anna": who shows under whom. */
const lines = (nodes: ChartNode[], members: ChartMember[], dotted: DottedLine[] = []) =>
  impliedReporting(nodes, members, nameOf, memberName, dotted).map(
    (l) => `${l.name} → ${l.managerName ?? "top"}`,
  );

// Company (head Ceo) contains HR (head Anna) and Project X (head Pekka).
const units = [
  node({ id: "co", kind: "unit", role: "Company", person_name: "Ceo" }),
  node({ id: "hr", kind: "unit", role: "HR", parent_id: "co", person_name: "Anna" }),
  node({ id: "px", kind: "unit", role: "Project X", parent_id: "co", person_name: "Pekka" }),
];

test("someone in two units shows under both heads", () => {
  const got = lines(units, [member("m1", "hr", "Mikko"), member("m2", "px", "Mikko")]);
  deepStrictEqual(got.filter((l) => l.startsWith("Mikko")).sort(), [
    "Mikko → Anna",
    "Mikko → Pekka",
  ]);
});

test("a relationship drawn as a role isn't shown again; the others still are", () => {
  const roles = [
    node({ id: "r-anna", kind: "role", role: "HR Director", person_name: "Anna" }),
    node({
      id: "r-mikko",
      kind: "role",
      role: "HR Specialist",
      person_name: "Mikko",
      parent_id: "r-anna",
    }),
  ];
  const got = lines(
    [...units, ...roles],
    [member("m1", "hr", "Mikko"), member("m2", "px", "Mikko")],
  );
  deepStrictEqual(
    got.filter((l) => l.startsWith("Mikko")),
    ["Mikko → Pekka"],
  );
});

test("a dotted line counts as drawn too", () => {
  const roles = [
    node({ id: "r-anna", kind: "role", role: "HR Director", person_name: "Anna" }),
    node({ id: "r-pekka", kind: "role", role: "Project lead", person_name: "Pekka" }),
    node({
      id: "r-mikko",
      kind: "role",
      role: "HR Specialist",
      person_name: "Mikko",
      parent_id: "r-anna",
    }),
  ];
  const dotted = [{ id: "d1", role_id: "r-mikko", reports_to_id: "r-pekka" }];
  const got = lines(
    [...units, ...roles],
    [member("m1", "hr", "Mikko"), member("m2", "px", "Mikko")],
    dotted,
  );
  deepStrictEqual(
    got.filter((l) => l.startsWith("Mikko")),
    [],
  );
});

test("the same person under the same head shows once", () => {
  // Mikko is in HR and in HR's sub-team, which has no head of its own.
  const sub = node({ id: "hr-sub", kind: "unit", role: "Recruiting", parent_id: "hr" });
  const got = lines(
    [...units, sub],
    [member("m1", "hr", "Mikko"), member("m2", "hr-sub", "Mikko")],
  );
  deepStrictEqual(
    got.filter((l) => l.startsWith("Mikko")),
    ["Mikko → Anna"],
  );
});

test("heads report to the head above, also when they hold a role elsewhere", () => {
  const roles = [node({ id: "r-anna", kind: "role", role: "HR Director", person_name: "Anna" })];
  deepStrictEqual(lines([...units, ...roles], []).sort(), [
    "Anna → Ceo",
    "Ceo → top",
    "Pekka → Ceo",
  ]);
});
