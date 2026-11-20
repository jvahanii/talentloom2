// What the Reporting lines view works out from a chart without changing it:
// where it disagrees with the Units tab, how many people report to each role,
// how two charts differ, and the order in which implied lines can become
// roles. Pure functions, so they can be tested without a database.

import { samePerson, type ChartMember, type ChartNode, type ImpliedLine } from "./orgCharts";

type NameOf = (n: ChartNode) => string | null;
type MemberName = (m: ChartMember) => string;

const sameHolder = (
  a: { person_id: string | null; name: string | null },
  b: { person_id: string | null; name: string | null },
) =>
  !!a.name &&
  !!b.name &&
  samePerson(
    { person_id: a.person_id, person_name: a.name },
    { person_id: b.person_id, person_name: b.name },
  );

/**
 * Where a role disagrees with the Units tab, as short sentences per role id.
 * Two kinds, both only when the chart says enough to tell:
 * - its holder is in other units on the Units tab than the role's unit;
 * - it reports to someone other than the head the units point to (the head of
 *   the role's unit, or for that head, the head of the nearest unit above).
 * Differences can be on purpose (a matrix organisation), so they are notes.
 */
export function reportingConflicts(
  nodes: ChartNode[],
  members: ChartMember[],
  nameOf: NameOf,
  memberName: MemberName,
): Map<string, string[]> {
  const units = nodes.filter((n) => n.kind === "unit");
  const unitById = new Map(units.map((u) => [u.id, u]));
  const roleById = new Map(nodes.filter((n) => n.kind === "role").map((r) => [r.id, r]));
  const out = new Map<string, string[]>();
  const note = (id: string, text: string) => out.set(id, [...(out.get(id) ?? []), text]);

  /** The unit or the nearest one above it whose head isn't `holder`. */
  const headAbove = (unitId: string | null, holder: { person_id: string | null; name: string }) => {
    let cur = unitId ? unitById.get(unitId) : undefined;
    for (let steps = 0; cur && steps < 1000; steps++) {
      const head = nameOf(cur);
      if (head && !sameHolder({ person_id: cur.person_id, name: head }, holder)) return cur;
      cur = cur.parent_id ? unitById.get(cur.parent_id) : undefined;
    }
    return null;
  };

  /** The units someone heads or belongs to on the Units tab. */
  const unitsOfHolder = (holder: { person_id: string | null; name: string }) => {
    const ids = new Set<string>();
    for (const u of units) {
      const head = nameOf(u);
      if (head && sameHolder({ person_id: u.person_id, name: head }, holder)) ids.add(u.id);
    }
    for (const m of members) {
      if (sameHolder({ person_id: m.person_id, name: memberName(m) }, holder)) ids.add(m.node_id);
    }
    return ids;
  };

  for (const r of roleById.values()) {
    const name = nameOf(r);
    if (!name) continue;
    const holder = { person_id: r.person_id, name };
    const unit = r.unit_id ? unitById.get(r.unit_id) : undefined;

    const inUnits = unitsOfHolder(holder);
    if (unit && inUnits.size > 0 && !inUnits.has(unit.id)) {
      const names = [...inUnits].map((id) => unitById.get(id)?.role).filter(Boolean);
      note(r.id, `${name} is in ${names.join(", ")} on Units, but this role is in ${unit.role}.`);
    }

    if (!unit) continue;
    const expected = headAbove(unit.id, holder);
    const parent = r.parent_id ? roleById.get(r.parent_id) : undefined;
    const parentName = parent ? nameOf(parent) : null;
    if (!expected || !parent || !parentName) continue;
    const expectedName = nameOf(expected)!;
    if (
      !sameHolder(
        { person_id: parent.person_id, name: parentName },
        { person_id: expected.person_id, name: expectedName },
      )
    ) {
      note(
        r.id,
        `Units point to ${expectedName} (head of ${expected.role}), but this role reports to ${parentName} (${parent.role}).`,
      );
    }
  }
  return out;
}

/**
 * For each box: how many report to it directly and how many in total below
 * it. `kids` maps a box (or implied line) key to what hangs under it.
 */
export function spanCounts(
  rootKeys: string[],
  kids: (key: string) => string[],
): Map<string, { direct: number; total: number }> {
  const out = new Map<string, { direct: number; total: number }>();
  const walk = (key: string, seen: Set<string>): number => {
    if (seen.has(key)) return 0;
    seen.add(key);
    const below = kids(key);
    let total = below.length;
    for (const k of below) total += walk(k, seen);
    out.set(key, { direct: below.length, total });
    return total;
  };
  const seen = new Set<string>();
  for (const k of rootKeys) walk(k, seen);
  return out;
}

/**
 * Implied lines in an order where each one's manager already exists: those
 * under the top or a role first, then those under other implied lines.
 */
export function impliedInCreationOrder(lines: ImpliedLine[]): ImpliedLine[] {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const out: ImpliedLine[] = [];
  const done = new Set<string>();
  const visit = (l: ImpliedLine, depth: number) => {
    if (done.has(l.key) || depth > 1000) return;
    const parent = byKey.get(l.parent);
    if (parent) visit(parent, depth + 1);
    done.add(l.key);
    out.push(l);
  };
  for (const l of lines) visit(l, 0);
  return out;
}

export type ChartChange = { kind: "added" | "removed" | "changed"; what: string; detail?: string };

/**
 * How chart `next` differs from chart `base`. Boxes are matched by their name
 * (role or unit), since a copied chart's boxes have new ids; a name used
 * twice is matched in order.
 */
export function compareCharts(
  base: { nodes: ChartNode[]; members: ChartMember[] },
  next: { nodes: ChartNode[]; members: ChartMember[] },
  nameOf: NameOf,
  memberName: MemberName,
): { units: ChartChange[]; roles: ChartChange[] } {
  const key = (n: ChartNode) => n.role.replace(/\s+/g, " ").trim().toLowerCase();
  const pair = (kind: "unit" | "role") => {
    const a = base.nodes.filter((n) => n.kind === kind);
    const b = next.nodes.filter((n) => n.kind === kind);
    const left = new Map<string, ChartNode[]>();
    for (const n of a) left.set(key(n), [...(left.get(key(n)) ?? []), n]);
    const matched: [ChartNode, ChartNode][] = [];
    const added: ChartNode[] = [];
    for (const n of b) {
      const list = left.get(key(n));
      if (list && list.length > 0) matched.push([list.shift()!, n]);
      else added.push(n);
    }
    const removed = [...left.values()].flat();
    return { matched, added, removed };
  };
  const nameIn = (nodes: ChartNode[], id: string | null) =>
    id ? (nodes.find((n) => n.id === id)?.role ?? null) : null;
  const holder = (n: ChartNode) => nameOf(n) ?? "nobody";
  const sameName = (x: string | null, y: string | null) =>
    (x ?? "").trim().toLowerCase() === (y ?? "").trim().toLowerCase();

  const units: ChartChange[] = [];
  const u = pair("unit");
  for (const n of u.added)
    units.push({
      kind: "added",
      what: n.role,
      detail: nameOf(n) ? `Head: ${nameOf(n)}` : undefined,
    });
  for (const n of u.removed) units.push({ kind: "removed", what: n.role });
  for (const [a, b] of u.matched) {
    const details: string[] = [];
    if (!sameName(nameOf(a), nameOf(b))) details.push(`head ${holder(a)} → ${holder(b)}`);
    const pa = nameIn(base.nodes, a.parent_id);
    const pb = nameIn(next.nodes, b.parent_id);
    if (!sameName(pa, pb)) details.push(`part of ${pa ?? "the top"} → ${pb ?? "the top"}`);
    const ma = new Set(base.members.filter((m) => m.node_id === a.id).map((m) => memberName(m)));
    const mb = new Set(next.members.filter((m) => m.node_id === b.id).map((m) => memberName(m)));
    const joined = [...mb].filter((m) => !ma.has(m));
    const left = [...ma].filter((m) => !mb.has(m));
    if (joined.length) details.push(`joined: ${joined.join(", ")}`);
    if (left.length) details.push(`left: ${left.join(", ")}`);
    if (details.length) units.push({ kind: "changed", what: b.role, detail: details.join("; ") });
  }

  const roles: ChartChange[] = [];
  const r = pair("role");
  for (const n of r.added)
    roles.push({
      kind: "added",
      what: n.role,
      detail: `${holder(n)}, reports to ${nameIn(next.nodes, n.parent_id) ?? "nobody"}`,
    });
  for (const n of r.removed)
    roles.push({ kind: "removed", what: n.role, detail: nameOf(n) ?? undefined });
  for (const [a, b] of r.matched) {
    const details: string[] = [];
    if (!sameName(nameOf(a), nameOf(b))) details.push(`${holder(a)} → ${holder(b)}`);
    const pa = nameIn(base.nodes, a.parent_id);
    const pb = nameIn(next.nodes, b.parent_id);
    if (!sameName(pa, pb)) details.push(`reports to ${pa ?? "nobody"} → ${pb ?? "nobody"}`);
    const ua = nameIn(base.nodes, a.unit_id);
    const ub = nameIn(next.nodes, b.unit_id);
    if (!sameName(ua, ub)) details.push(`unit ${ua ?? "none"} → ${ub ?? "none"}`);
    if (details.length) roles.push({ kind: "changed", what: b.role, detail: details.join("; ") });
  }
  return { units, roles };
}
