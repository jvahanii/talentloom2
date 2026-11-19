import { supabase } from "@/integrations/supabase/app-client";

/**
 * Organisation charts: a feature of their own, not linked to People or Teams.
 * An organisation keeps any number of named charts. Each chart holds two
 * trees of boxes, shown on two tabs:
 * - units (kind "unit", e.g. Finance): what is part of what, each with,
 *   optionally, its head and its members (org_chart_members);
 * - roles (kind "role"): who reports to whom, each with, optionally, the
 *   person holding it and the unit it belongs to (unit_id), which need not
 *   be the unit of the role it reports to.
 * A box sits only under a box of its own kind, and keeps its kind (database
 * trigger org_chart_nodes_kinds). A box's name is in role either way, and
 * either kind may have a note. The person is typed by hand or someone from
 * People (person_id, a member of the
 * organisation); person_name then keeps their name as it was when picked, so
 * the box still reads right if they leave, which unlinks them.
 * Every member of the organisation may read and edit them (row-level security
 * on org_charts and org_chart_nodes). The database keeps a box out from under
 * itself, and a deleted box's boxes below go to the top unless moved first.
 */
export type OrgChart = { id: string; name: string; updated_at: string };
/** role: a job someone holds; unit: an organisational unit such as Finance. */
export type NodeKind = "role" | "unit";

export type ChartNode = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  role: string;
  person_name: string | null;
  person_id: string | null;
  /** For a role: the unit it belongs to. */
  unit_id: string | null;
  note: string | null;
  position: number;
  created_at: string;
};

// The tables live in the external database; Lovable regenerates types.ts without them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const MAX_CHART_NAME = 100;
export const MAX_ROLE = 120;
export const MAX_PERSON = 120;
export const MAX_NOTE = 1000;

export const chartsKey = (orgId: string | null) => ["org-charts", orgId];
export const chartNodesKey = (chartId: string | null) => ["org-chart-nodes", chartId];

export async function fetchCharts(orgId: string): Promise<OrgChart[]> {
  const { data, error } = await db
    .from("org_charts")
    .select("id, name, updated_at")
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgChart[];
}

export async function createChart(orgId: string, name: string): Promise<OrgChart> {
  const { data, error } = await db
    .from("org_charts")
    .insert({ org_id: orgId, name: name.trim().slice(0, MAX_CHART_NAME) })
    .select("id, name, updated_at")
    .single();
  if (error) throw error;
  return data as OrgChart;
}

export async function renameChart(id: string, name: string) {
  const { data, error } = await db
    .from("org_charts")
    .update({ name: name.trim().slice(0, MAX_CHART_NAME), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The chart was not found");
}

export async function deleteChart(id: string) {
  const { data, error } = await db.from("org_charts").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The chart was not found");
}

/** A copy of a chart, boxes and all, under a new name. */
export async function copyChart(orgId: string, from: string, name: string): Promise<OrgChart> {
  const chart = await createChart(orgId, name);
  try {
    await copyContents(orgId, from, chart.id);
  } catch (e) {
    await deleteChart(chart.id).catch(() => undefined);
    throw e;
  }
  return chart;
}

/**
 * Fills an empty chart with a copy of another chart's units, roles and unit
 * members. Refuses a chart that already has boxes, so nothing is mixed or lost.
 */
export async function copyIntoEmptyChart(orgId: string, from: string, to: string) {
  if (from === to) throw new Error("Pick another chart to copy from");
  if ((await fetchNodes(to)).length > 0)
    throw new Error("This chart isn't empty any more, so nothing was copied");
  try {
    await copyContents(orgId, from, to);
  } catch (e) {
    // It was empty: take away whatever part of the copy got in.
    await db.from("org_chart_members").delete().eq("chart_id", to);
    await db.from("org_chart_nodes").delete().eq("chart_id", to);
    throw e;
  }
}

/** Copies chart `from`'s boxes and unit members into chart `to`. */
async function copyContents(orgId: string, from: string, to: string) {
  const nodes = await fetchNodes(from);
  if (nodes.length === 0) return;
  const newId = new Map(nodes.map((n) => [n.id, crypto.randomUUID()]));
  // Parents before children, and units before roles, so the box above and
  // a role's unit already exist when each row goes in.
  const down = topDown(nodes);
  const ordered = [...down.filter((n) => n.kind === "unit"), ...down.filter((n) => n.kind !== "unit")];
  const { error } = await db.from("org_chart_nodes").insert(
    ordered.map((n) => ({
      id: newId.get(n.id),
      org_id: orgId,
      chart_id: to,
      parent_id: n.parent_id ? newId.get(n.parent_id) : null,
      kind: n.kind,
      role: n.role,
      person_name: n.person_name,
      person_id: n.person_id,
      unit_id: n.unit_id ? (newId.get(n.unit_id) ?? null) : null,
      note: n.note,
      position: n.position,
    })),
  );
  if (error) throw error;
  const members = await fetchMembers(from);
  if (members.length === 0) return;
  const { error: mError } = await db.from("org_chart_members").insert(
    members.map((m) => ({
      org_id: orgId,
      chart_id: to,
      node_id: newId.get(m.node_id),
      person_id: m.person_id,
      person_name: m.person_name,
      position: m.position,
    })),
  );
  if (mError) throw mError;
}

export async function fetchNodes(chartId: string): Promise<ChartNode[]> {
  const { data, error } = await db
    .from("org_chart_nodes")
    .select(
      "id, parent_id, kind, role, person_name, person_id, unit_id, note, position, created_at",
    )
    .eq("chart_id", chartId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChartNode[];
}

/** person_id: someone from People, or null for a name typed by hand. */
export type NodeFields = {
  kind: NodeKind;
  role: string;
  person_name: string;
  person_id: string | null;
  /** For a role: the unit it belongs to. */
  unit_id: string | null;
  note: string;
};

const tidy = (f: NodeFields) => ({
  kind: f.kind,
  role: f.role.trim().slice(0, MAX_ROLE),
  person_name: f.person_name.trim().slice(0, MAX_PERSON) || null,
  person_id: f.person_id,
  unit_id: f.kind === "role" ? f.unit_id : null,
  note: f.note.trim().slice(0, MAX_NOTE) || null,
});

/** Someone in the organisation's People list. */
export type OrgPerson = { id: string; name: string; email: string | null };

export const orgPeopleKey = (orgId: string | null) => ["org-chart-people", orgId];

export async function fetchOrgPeople(orgId: string): Promise<OrgPerson[]> {
  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles, error: pError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (pError) throw pError;
  return ((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({
      id: p.id,
      // Some names are stored with stray spaces ("Anna  Stroikina ").
      name: p.full_name?.replace(/\s+/g, " ").trim() || p.email || "Unnamed",
      email: p.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds a box and returns its id. */
export async function addNode(
  orgId: string,
  chartId: string,
  parentId: string | null,
  position: number,
  fields: NodeFields,
): Promise<string> {
  const { data, error } = await db
    .from("org_chart_nodes")
    .insert({ org_id: orgId, chart_id: chartId, parent_id: parentId, position, ...tidy(fields) })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Someone in a unit: picked from People (person_id) or typed by hand.
 * person_name keeps their name as it was when added.
 */
export type ChartMember = {
  id: string;
  node_id: string;
  person_id: string | null;
  person_name: string;
  position: number;
};
export type NewMember = { person_id: string | null; person_name: string };

export const chartMembersKey = (chartId: string | null) => ["org-chart-members", chartId];

export async function fetchMembers(chartId: string): Promise<ChartMember[]> {
  const { data, error } = await db
    .from("org_chart_members")
    .select("id, node_id, person_id, person_name, position")
    .eq("chart_id", chartId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChartMember[];
}

export async function addMembers(
  orgId: string,
  chartId: string,
  nodeId: string,
  people: NewMember[],
  firstPosition: number,
) {
  const rows = people
    .map((p) => ({ ...p, person_name: p.person_name.trim().slice(0, MAX_PERSON) }))
    .filter((p) => p.person_name)
    .map((p, i) => ({
      org_id: orgId,
      chart_id: chartId,
      node_id: nodeId,
      person_id: p.person_id,
      person_name: p.person_name,
      position: firstPosition + i,
    }));
  if (!rows.length) return;
  const { error } = await db.from("org_chart_members").insert(rows);
  if (error) throw error;
}

export async function deleteMembers(ids: string[]) {
  if (!ids.length) return;
  const { error } = await db.from("org_chart_members").delete().in("id", ids);
  if (error) throw error;
}

/** Moves someone to another unit, at the end of its list. */
export async function moveMember(id: string, nodeId: string, position: number) {
  const { data, error } = await db
    .from("org_chart_members")
    .update({ node_id: nodeId, position })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That person is no longer in the unit");
}

/** Where a dragged box lands: beside a box, inside it, or at the top. */
export type DropPlace = { where: "before" | "after" | "into"; target: string } | { where: "top" };

/**
 * The parent and positions that put box `id` at `place`: the moved box and
 * every sibling whose position changes. Null if nothing would change.
 */
export function planMove(
  nodes: ChartNode[],
  id: string,
  place: DropPlace,
): { id: string; parent_id: string | null; position: number }[] | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const target = place.where === "top" ? null : nodes.find((n) => n.id === place.target);
  if (place.where !== "top" && !target) return null;
  // Onto itself or a box below it: no place to go.
  if (target && subtreeIds(nodes, id).has(target.id)) return null;
  const parent =
    place.where === "top" ? null : place.where === "into" ? target!.id : target!.parent_id;
  const kids = childrenOf(nodes);
  const row = (kids.get(parent ?? "") ?? []).filter((n) => n.id !== id);
  let at = row.length;
  if (place.where === "before" || place.where === "after") {
    at = row.findIndex((n) => n.id === target!.id) + (place.where === "after" ? 1 : 0);
  }
  row.splice(at, 0, node);
  const out = row
    .map((n, position) => ({ id: n.id, parent_id: parent, position }))
    .filter((u) => {
      const was = nodes.find((n) => n.id === u.id)!;
      return was.parent_id !== u.parent_id || was.position !== u.position;
    });
  return out.length ? out : null;
}

export async function updateNode(
  id: string,
  change: Partial<NodeFields> & { parent_id?: string | null; position?: number },
) {
  const row: Record<string, unknown> = {};
  if (change.kind !== undefined) row.kind = change.kind;
  if (change.role !== undefined) row.role = change.role.trim().slice(0, MAX_ROLE);
  if (change.person_name !== undefined)
    row.person_name = change.person_name.trim().slice(0, MAX_PERSON) || null;
  if (change.person_id !== undefined) row.person_id = change.person_id;
  if (change.unit_id !== undefined) row.unit_id = change.unit_id;
  if (change.note !== undefined) row.note = change.note.trim().slice(0, MAX_NOTE) || null;
  if (change.parent_id !== undefined) row.parent_id = change.parent_id;
  if (change.position !== undefined) row.position = change.position;
  const { data, error } = await db.from("org_chart_nodes").update(row).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The box was not found");
}

/** Deletes a box; the boxes below it move up to the box above it. */
export async function deleteNode(node: ChartNode) {
  const { error: moveError } = await db
    .from("org_chart_nodes")
    .update({ parent_id: node.parent_id })
    .eq("parent_id", node.id);
  if (moveError) throw moveError;
  const { error } = await db.from("org_chart_nodes").delete().eq("id", node.id);
  if (error) throw error;
}

/** Each box's boxes below, in order; "" holds the top ones. */
export function childrenOf(nodes: ChartNode[]): Map<string, ChartNode[]> {
  const ids = new Set(nodes.map((n) => n.id));
  const map = new Map<string, ChartNode[]>();
  for (const n of nodes) {
    const key = n.parent_id && ids.has(n.parent_id) ? n.parent_id : "";
    const list = map.get(key) ?? [];
    list.push(n);
    map.set(key, list);
  }
  for (const list of map.values())
    list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return map;
}

/**
 * A reporting line that follows from the units rather than being drawn:
 * a unit's members report to its head, and a unit's head to the head of the
 * unit it is part of. Not stored; worked out afresh from the Units tab.
 */
export type ImpliedLine = {
  /** "implied:head:<unit id>" or "implied:member:<member id>". */
  key: string;
  /** Where it hangs: "" for the top, a role's id, or another line's key. */
  parent: string;
  personId: string | null;
  name: string;
  /** "Head of HR" for a head, "HR" for a member. */
  title: string;
  unitId: string;
  unitName: string;
  isHead: boolean;
  /** Who they report to, and the unit that person heads; null at the top. */
  managerName: string | null;
  managerUnitName: string | null;
  /** The manager's own role, when they have one on Reporting lines. */
  managerRoleId: string | null;
};

const IMPLIED = "implied:";
export const isImpliedKey = (key: string) => key.startsWith(IMPLIED);

/** Who someone is, across boxes: their People id, or their name as typed. */
const personKey = (personId: string | null, name: string) =>
  personId ? `p:${personId}` : `n:${name.replace(/\s+/g, " ").trim().toLowerCase()}`;

/**
 * Whether two entries name the same person: the same person from People, or
 * the same typed name when neither is from People. Someone is either a unit's
 * head or one of its members, never both.
 */
export function samePerson(
  a: { person_id: string | null; person_name: string | null },
  b: { person_id: string | null; person_name: string | null },
): boolean {
  if (a.person_id || b.person_id) return a.person_id === b.person_id;
  const an = (a.person_name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return !!an && an === (b.person_name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The reporting lines the units imply. A line drawn on Reporting lines wins:
 * someone who holds a role there gets no implied line, and the people who
 * report to them hang under that role. A unit without a head of its own
 * reports through the nearest unit above it that has one.
 */
export function impliedReporting(
  nodes: ChartNode[],
  members: ChartMember[],
  nameOf: (n: ChartNode) => string | null,
  memberName: (m: ChartMember) => string,
): ImpliedLine[] {
  const units = nodes.filter((n) => n.kind === "unit");
  const unitById = new Map(units.map((u) => [u.id, u]));
  const roleOf = new Map<string, ChartNode>();
  for (const r of nodes) {
    const name = r.kind === "role" ? nameOf(r) : null;
    if (name) {
      const k = personKey(r.person_id, name);
      if (!roleOf.has(k)) roleOf.set(k, r);
    }
  }
  const headKey = (u: ChartNode) => {
    const name = nameOf(u);
    return name ? personKey(u.person_id, name) : null;
  };
  /** The unit itself or the nearest one above it with a head other than `except`. */
  const nearestHeaded = (unitId: string | null, except: string) => {
    let cur = unitId ? unitById.get(unitId) : undefined;
    for (let steps = 0; cur && steps < 1000; steps++) {
      const k = headKey(cur);
      if (k && k !== except) return cur;
      cur = cur.parent_id ? unitById.get(cur.parent_id) : undefined;
    }
    return null;
  };
  const anchorOf = (u: ChartNode) => roleOf.get(headKey(u)!)?.id ?? `${IMPLIED}head:${u.id}`;
  const manager = (u: ChartNode | null) =>
    u
      ? {
          parent: anchorOf(u),
          managerName: nameOf(u),
          managerUnitName: u.role,
          managerRoleId: roleOf.get(headKey(u)!)?.id ?? null,
        }
      : { parent: "", managerName: null, managerUnitName: null, managerRoleId: null };

  const out: ImpliedLine[] = [];
  const placed = new Set<string>();
  const sorted = [...units].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  for (const u of sorted) {
    const hk = headKey(u);
    if (!hk || roleOf.has(hk)) continue;
    const m = manager(nearestHeaded(u.parent_id, hk));
    placed.add(`${hk}|${m.parent}`);
    out.push({
      key: `${IMPLIED}head:${u.id}`,
      personId: u.person_id,
      name: nameOf(u)!,
      title: `Head of ${u.role}`,
      unitId: u.id,
      unitName: u.role,
      isHead: true,
      ...m,
    });
  }
  for (const u of sorted) {
    for (const mem of members.filter((x) => x.node_id === u.id)) {
      const name = memberName(mem);
      const mk = personKey(mem.person_id, name);
      if (roleOf.has(mk)) continue;
      const boss = nearestHeaded(u.id, mk);
      if (!boss) continue;
      const m = manager(boss);
      // Someone already shown under this manager, e.g. as head of a unit within.
      if (placed.has(`${mk}|${m.parent}`)) continue;
      placed.add(`${mk}|${m.parent}`);
      out.push({
        key: `${IMPLIED}member:${mem.id}`,
        personId: mem.person_id,
        name,
        title: u.role,
        unitId: u.id,
        unitName: u.role,
        isHead: false,
        ...m,
      });
    }
  }
  return out;
}

/** A box and every box below it. */
export function subtreeIds(nodes: ChartNode[], id: string): Set<string> {
  const kids = childrenOf(nodes);
  const out = new Set<string>();
  const walk = (n: string) => {
    out.add(n);
    for (const c of kids.get(n) ?? []) walk(c.id);
  };
  walk(id);
  return out;
}

function topDown(nodes: ChartNode[]): ChartNode[] {
  const kids = childrenOf(nodes);
  const out: ChartNode[] = [];
  const walk = (key: string) => {
    for (const c of kids.get(key) ?? []) {
      out.push(c);
      walk(c.id);
    }
  };
  walk("");
  return out;
}
