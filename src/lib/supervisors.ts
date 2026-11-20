import { supabase } from "@/integrations/supabase/app-client";
import {
  fetchCharts,
  fetchMembers,
  fetchNodes,
  type ChartMember,
  type ChartNode,
} from "@/lib/orgCharts";

/**
 * Supervisor relationships, organisation-wide (person_supervisors): who
 * supervises whom. A person may have several supervisors. The database
 * refuses any relationship that would go round in a circle; the page also
 * offers only supervisors that don't. Suggestions come from the active org
 * chart: a unit's head supervises its members, and a unit's head is
 * supervised by the head of the unit it is part of. Every member may edit.
 */

// The table lives in the external database; Lovable regenerates types.ts without it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Edge = { person_id: string; supervisor_id: string };

export const supervisorsKey = (orgId: string | null) => ["person-supervisors", orgId];
export const suggestionsKey = (orgId: string | null) => ["supervisor-suggestions", orgId];

export async function fetchSupervisors(orgId: string): Promise<Edge[]> {
  const { data, error } = await db
    .from("person_supervisors")
    .select("person_id, supervisor_id")
    .eq("org_id", orgId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Edge[];
}

/** Adds relationships one at a time, so the circle check sees each before the next. */
export async function addSupervisors(orgId: string, edges: Edge[]) {
  for (const e of edges) {
    const { error } = await db.from("person_supervisors").insert({ org_id: orgId, ...e });
    // 23505: already there.
    if (error && error.code !== "23505") throw error;
  }
}

export async function removeSupervisor(orgId: string, e: Edge) {
  const { error } = await db
    .from("person_supervisors")
    .delete()
    .eq("org_id", orgId)
    .eq("person_id", e.person_id)
    .eq("supervisor_id", e.supervisor_id);
  if (error) throw error;
}

/** Whether making `supervisor` supervise `person` would close a circle. */
export function wouldCycle(edges: Edge[], person: string, supervisor: string): boolean {
  if (person === supervisor) return true;
  const up = new Map<string, string[]>();
  for (const e of edges) up.set(e.person_id, [...(up.get(e.person_id) ?? []), e.supervisor_id]);
  const seen = new Set<string>();
  const stack = [supervisor];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === person) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(up.get(id) ?? []));
  }
  return false;
}

/**
 * The supervisor relationships the org chart implies, for people picked from
 * People: a unit's members are supervised by its head; a head by the head of
 * the nearest unit above with a head of its own. A unit without a head
 * passes its members up to the nearest head above.
 */
export function impliedSupervisors(nodes: ChartNode[], members: ChartMember[]): Edge[] {
  const units = nodes.filter((n) => n.kind === "unit");
  const byId = new Map(units.map((u) => [u.id, u]));
  /** The nearest head at or above a unit, other than `except`. */
  const headAbove = (unitId: string | null, except: string) => {
    let u = unitId ? byId.get(unitId) : undefined;
    for (let i = 0; u && i < 1000; i++) {
      if (u.person_id && u.person_id !== except) return u.person_id;
      u = u.parent_id ? byId.get(u.parent_id) : undefined;
    }
    return null;
  };
  const out = new Map<string, Edge>();
  const add = (person: string, supervisor: string | null) => {
    if (supervisor && supervisor !== person)
      out.set(`${person}>${supervisor}`, { person_id: person, supervisor_id: supervisor });
  };
  for (const u of units) {
    if (u.person_id) add(u.person_id, headAbove(u.parent_id, u.person_id));
    for (const m of members)
      if (m.node_id === u.id && m.person_id) add(m.person_id, headAbove(u.id, m.person_id));
  }
  return [...out.values()];
}

/** Suggestions from the organisation's active org chart (none without one). */
export async function fetchSuggestions(
  orgId: string,
): Promise<{ chart: string | null; edges: Edge[] }> {
  const active = (await fetchCharts(orgId)).find((c) => c.status === "active");
  if (!active) return { chart: null, edges: [] };
  const [nodes, members] = await Promise.all([fetchNodes(active.id), fetchMembers(active.id)]);
  return { chart: active.name, edges: impliedSupervisors(nodes, members) };
}
