import { supabase } from "@/integrations/supabase/app-client";

/**
 * Organisation charts: a feature of their own, not linked to People or Teams.
 * An organisation keeps any number of named charts; each is a tree of boxes,
 * each box a role with, optionally, a person's name and a note, typed by hand.
 * Every member of the organisation may read and edit them (row-level security
 * on org_charts and org_chart_nodes). The database keeps a box out from under
 * itself, and a deleted box's boxes below go to the top unless moved first.
 */
export type OrgChart = { id: string; name: string; updated_at: string };
export type ChartNode = {
  id: string;
  parent_id: string | null;
  role: string;
  person_name: string | null;
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
  const nodes = await fetchNodes(from);
  const chart = await createChart(orgId, name);
  const newId = new Map(nodes.map((n) => [n.id, crypto.randomUUID()]));
  if (nodes.length > 0) {
    // Parents before children, so each row's box above already exists.
    const ordered = topDown(nodes);
    const { error } = await db.from("org_chart_nodes").insert(
      ordered.map((n) => ({
        id: newId.get(n.id),
        org_id: orgId,
        chart_id: chart.id,
        parent_id: n.parent_id ? newId.get(n.parent_id) : null,
        role: n.role,
        person_name: n.person_name,
        note: n.note,
        position: n.position,
      })),
    );
    if (error) {
      await deleteChart(chart.id).catch(() => undefined);
      throw error;
    }
  }
  return chart;
}

export async function fetchNodes(chartId: string): Promise<ChartNode[]> {
  const { data, error } = await db
    .from("org_chart_nodes")
    .select("id, parent_id, role, person_name, note, position, created_at")
    .eq("chart_id", chartId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChartNode[];
}

export type NodeFields = { role: string; person_name: string; note: string };

const tidy = (f: NodeFields) => ({
  role: f.role.trim().slice(0, MAX_ROLE),
  person_name: f.person_name.trim().slice(0, MAX_PERSON) || null,
  note: f.note.trim().slice(0, MAX_NOTE) || null,
});

export async function addNode(
  orgId: string,
  chartId: string,
  parentId: string | null,
  position: number,
  fields: NodeFields,
) {
  const { error } = await db
    .from("org_chart_nodes")
    .insert({ org_id: orgId, chart_id: chartId, parent_id: parentId, position, ...tidy(fields) });
  if (error) throw error;
}

export async function updateNode(
  id: string,
  change: Partial<NodeFields> & { parent_id?: string | null; position?: number },
) {
  const row: Record<string, unknown> = {};
  if (change.role !== undefined) row.role = change.role.trim().slice(0, MAX_ROLE);
  if (change.person_name !== undefined)
    row.person_name = change.person_name.trim().slice(0, MAX_PERSON) || null;
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
