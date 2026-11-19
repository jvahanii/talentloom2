import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Copy,
  GripVertical,
  Link2,
  Pencil,
  Search,
  Plus,
  Trash2,
  UserRound,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import {
  MAX_CHART_NAME,
  MAX_NOTE,
  MAX_PERSON,
  MAX_ROLE,
  addMembers,
  addNode,
  chartMembersKey,
  chartNodesKey,
  chartsKey,
  childrenOf,
  copyChart,
  createChart,
  deleteChart,
  deleteMembers,
  deleteNode,
  fetchCharts,
  fetchMembers,
  fetchNodes,
  fetchOrgPeople,
  moveMember,
  orgPeopleKey,
  planMove,
  renameChart,
  subtreeIds,
  updateNode,
  type ChartMember,
  type ChartNode,
  type DropPlace,
  type NewMember,
  type NodeFields,
  type NodeKind,
  type OrgChart,
  type OrgPerson,
} from "@/lib/orgCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/org-chart")({
  head: () => ({ meta: [{ title: "Org chart — Talentloom" }] }),
  component: OrgChartPage,
});

const TOP = "__top__";
/** How many of a unit's members its box lists before "+N more". */
const MEMBERS_SHOWN = 6;

/** The chart last opened in this browser, per organisation. */
function useRememberedChart(orgId: string | null) {
  const key = `talentloom:org-chart:${orgId ?? ""}`;
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(window.localStorage.getItem(key));
    } catch {
      setId(null);
    }
  }, [key]);
  const choose = (next: string | null) => {
    setId(next);
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch {
      /* not remembered */
    }
  };
  return [id, choose] as const;
}

/** A unit member in the dialog: saved ones have an id, new ones don't yet. */
type StagedMember = NewMember & { id?: string };

type NameDialog = { mode: "new" | "rename" | "copy"; value: string } | null;
type BoxDialog =
  | { mode: "add"; parentId: string | null; fields: NodeFields; members: StagedMember[] }
  | {
      mode: "edit";
      node: ChartNode;
      fields: NodeFields;
      parent: string;
      members: StagedMember[];
    }
  | null;

const emptyFields: NodeFields = {
  kind: "role",
  role: "",
  person_name: "",
  person_id: null,
  note: "",
};
const emptyUnit: NodeFields = { ...emptyFields, kind: "unit" };

/** The dialog's wording for each kind of box. */
const KIND_WORDS: Record<NodeKind, { name: string; placeholder: string; person: string }> = {
  role: { name: "Role", placeholder: "e.g. Head of Sales", person: "Person (optional)" },
  unit: { name: "Unit name", placeholder: "e.g. Finance", person: "Head of the unit (optional)" },
};

/** What is being dragged. */
type DragData =
  | { type: "box"; id: string; kind: NodeKind; label: string }
  | { type: "person"; personId: string; label: string }
  | { type: "member"; memberId: string; nodeId: string; personId: string | null; label: string };
/** Where it may land: beside or onto a box, or at the top of the chart. */
type DropData = { node: ChartNode; where: "before" | "into" | "after" } | { top: true };

/** What the boxes need to draw themselves. */
type View = {
  kids: Map<string, ChartNode[]>;
  membersOf: (nodeId: string) => ChartMember[];
  nameOf: (n: ChartNode) => string | null;
  memberName: (m: ChartMember) => string;
  /** Boxes the item being dragged can't land on. */
  blocked: Set<string>;
  onOpen: (n: ChartNode) => void;
  onAdd: (n: ChartNode) => void;
};

function OrgChartPage() {
  const qc = useQueryClient();
  const { orgId, orgs } = useOrg();
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "your organisation";
  const [remembered, remember] = useRememberedChart(orgId);

  const charts = useQuery({
    queryKey: chartsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchCharts(orgId!),
  });
  const list = charts.data ?? [];
  const chart: OrgChart | null =
    list.find((c) => c.id === remembered) ?? (list.length > 0 ? list[0]! : null);

  const nodesQuery = useQuery({
    queryKey: chartNodesKey(chart?.id ?? null),
    enabled: !!chart,
    queryFn: () => fetchNodes(chart!.id),
  });
  const nodes = nodesQuery.data ?? [];
  const kids = childrenOf(nodes);

  const membersQuery = useQuery({
    queryKey: chartMembersKey(chart?.id ?? null),
    enabled: !!chart,
    queryFn: () => fetchMembers(chart!.id),
  });
  const members = membersQuery.data ?? [];
  const membersByNode = new Map<string, ChartMember[]>();
  for (const m of members) {
    const l = membersByNode.get(m.node_id) ?? [];
    l.push(m);
    membersByNode.set(m.node_id, l);
  }
  const membersOf = (nodeId: string) => membersByNode.get(nodeId) ?? [];

  const peopleQuery = useQuery({
    queryKey: orgPeopleKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgPeople(orgId!),
  });
  const people = peopleQuery.data ?? [];
  const personById = new Map(people.map((p) => [p.id, p]));
  /** The name a box shows: a linked person's current name, else the one typed. */
  const nameOf = (n: ChartNode) =>
    (n.person_id ? personById.get(n.person_id)?.name : null) ?? n.person_name;
  const memberName = (m: ChartMember) =>
    (m.person_id ? personById.get(m.person_id)?.name : null) ?? m.person_name;

  /** Where each person from People appears in this chart. */
  const placesOf = new Map<string, string[]>();
  const addPlace = (personId: string | null, place: string) => {
    if (!personId) return;
    placesOf.set(personId, [...(placesOf.get(personId) ?? []), place]);
  };
  for (const n of nodes) addPlace(n.person_id, n.kind === "unit" ? `Head of ${n.role}` : n.role);
  for (const m of members) addPlace(m.person_id, nodes.find((n) => n.id === m.node_id)?.role ?? "");

  const [busy, setBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [boxDialog, setBoxDialog] = useState<BoxDialog>(null);
  const [confirmChartDelete, setConfirmChartDelete] = useState(false);
  const [confirmBoxDelete, setConfirmBoxDelete] = useState<ChartNode | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  /** A drop can end in a click on the box under it; that click opens nothing. */
  const dragEndedAt = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold to drag, so a swipe still scrolls the chart.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: chartsKey(orgId) });
    if (chart) {
      await qc.invalidateQueries({ queryKey: chartNodesKey(chart.id) });
      await qc.invalidateQueries({ queryKey: chartMembersKey(chart.id) });
    }
  };

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "Something went wrong";
      toast.error(message);
      return false;
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const nextPosition = (parentId: string | null) => {
    const siblings = kids.get(parentId ?? "") ?? [];
    return siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0;
  };
  const nextMemberPosition = (nodeId: string) => {
    const l = membersOf(nodeId);
    return l.length ? Math.max(...l.map((m) => m.position)) + 1 : 0;
  };

  const staged = (n: ChartNode): StagedMember[] =>
    membersOf(n.id).map((m) => ({ id: m.id, person_id: m.person_id, person_name: memberName(m) }));

  const openBox = (n: ChartNode) => {
    if (Date.now() - dragEndedAt.current < 300) return;
    setBoxDialog({
      mode: "edit",
      node: n,
      parent: n.parent_id ?? TOP,
      fields: {
        kind: n.kind,
        role: n.role,
        person_name: n.person_name ?? "",
        person_id: n.person_id,
        note: n.note ?? "",
      },
      members: staged(n),
    });
  };
  const addBelow = (n: ChartNode, fields: NodeFields = emptyFields) =>
    setBoxDialog({ mode: "add", parentId: n.id, fields, members: [] });
  const addAtTop = (fields: NodeFields) =>
    setBoxDialog({ mode: "add", parentId: null, fields, members: [] });

  const saveName = async () => {
    if (!nameDialog) return;
    const name = nameDialog.value.trim();
    if (!name) return;
    if (
      list.some(
        (c) =>
          c.name.toLowerCase() === name.toLowerCase() &&
          !(nameDialog.mode === "rename" && c.id === chart?.id),
      )
    ) {
      toast.error("There's already a chart with that name");
      return;
    }
    const ok = await run(
      async () => {
        if (nameDialog.mode === "rename" && chart) await renameChart(chart.id, name);
        else if (nameDialog.mode === "copy" && chart)
          remember((await copyChart(orgId, chart.id, name)).id);
        else remember((await createChart(orgId, name)).id);
      },
      nameDialog.mode === "rename" ? "Renamed the chart" : `Created ${name}`,
    );
    if (ok) setNameDialog(null);
  };

  const saveBox = async () => {
    if (!boxDialog || !chart) return;
    if (!boxDialog.fields.role.trim()) return;
    const isUnit = boxDialog.fields.kind === "unit";
    const ok = await run(async () => {
      if (boxDialog.mode === "add") {
        const id = await addNode(
          orgId,
          chart.id,
          boxDialog.parentId,
          nextPosition(boxDialog.parentId),
          boxDialog.fields,
        );
        if (isUnit) await addMembers(orgId, chart.id, id, boxDialog.members, 0);
      } else {
        const parent = boxDialog.parent === TOP ? null : boxDialog.parent;
        const moved = parent !== boxDialog.node.parent_id;
        await updateNode(boxDialog.node.id, {
          ...boxDialog.fields,
          ...(moved ? { parent_id: parent, position: nextPosition(parent) } : {}),
        });
        // A unit turned into a role loses its members in the database.
        if (isUnit) {
          const kept = new Set(boxDialog.members.flatMap((m) => (m.id ? [m.id] : [])));
          await deleteMembers(
            membersOf(boxDialog.node.id)
              .filter((m) => !kept.has(m.id))
              .map((m) => m.id),
          );
          await addMembers(
            orgId,
            chart.id,
            boxDialog.node.id,
            boxDialog.members.filter((m) => !m.id),
            nextMemberPosition(boxDialog.node.id),
          );
        }
      }
    });
    if (ok) setBoxDialog(null);
  };

  /** Swaps a box with its neighbour on the left (-1) or right (+1). */
  const shift = async (node: ChartNode, by: -1 | 1) => {
    const siblings = kids.get(node.parent_id ?? "") ?? [];
    const i = siblings.findIndex((s) => s.id === node.id);
    const other = siblings[i + by];
    if (!other) return;
    await run(async () => {
      // Positions may tie; renumber the row so the swap always shows.
      const order = siblings.map((s) => s.id);
      [order[i], order[i + by]] = [order[i + by]!, order[i]!];
      for (const [p, id] of order.entries()) {
        const s = siblings.find((x) => x.id === id)!;
        if (s.position !== p) await updateNode(id, { position: p });
      }
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragData | undefined) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    dragEndedAt.current = Date.now();
    const data = e.active.data.current as DragData | undefined;
    const drop = e.over?.data.current as DropData | undefined;
    if (!data || !drop || !chart) return;

    if (data.type === "box") {
      const place: DropPlace =
        "top" in drop ? { where: "top" } : { where: drop.where, target: drop.node.id };
      const plan = planMove(nodes, data.id, place);
      if (!plan) return;
      // Show the move at once; the refetch afterwards confirms it.
      qc.setQueryData<ChartNode[]>(chartNodesKey(chart.id), (old) =>
        old?.map((n) => {
          const u = plan.find((p) => p.id === n.id);
          return u ? { ...n, parent_id: u.parent_id, position: u.position } : n;
        }),
      );
      void run(async () => {
        for (const u of plan)
          await updateNode(u.id, { parent_id: u.parent_id, position: u.position });
      });
      return;
    }

    if ("top" in drop) return;
    const target = drop.node;

    if (data.type === "person") {
      const person = personById.get(data.personId);
      if (!person) return;
      if (target.kind === "unit") {
        if (membersOf(target.id).some((m) => m.person_id === person.id)) {
          toast(`${person.name} is already in ${target.role}`);
          return;
        }
        void run(
          () =>
            addMembers(
              orgId,
              chart.id,
              target.id,
              [{ person_id: person.id, person_name: person.name }],
              nextMemberPosition(target.id),
            ),
          `Added ${person.name} to ${target.role}`,
        );
      } else if (target.person_id !== person.id) {
        void run(
          () =>
            updateNode(target.id, {
              person_id: person.id,
              person_name: person.name.slice(0, MAX_PERSON),
            }),
          `${person.name} is now ${target.role}`,
        );
      }
      return;
    }

    // Someone in a unit, dropped on another unit: they move there.
    if (target.kind !== "unit" || target.id === data.nodeId) return;
    const already =
      !!data.personId && membersOf(target.id).some((m) => m.person_id === data.personId);
    qc.setQueryData<ChartMember[]>(chartMembersKey(chart.id), (old) =>
      already
        ? old?.filter((m) => m.id !== data.memberId)
        : old?.map((m) =>
            m.id === data.memberId
              ? { ...m, node_id: target.id, position: nextMemberPosition(target.id) }
              : m,
          ),
    );
    void run(
      () =>
        already
          ? deleteMembers([data.memberId])
          : moveMember(data.memberId, target.id, nextMemberPosition(target.id)),
      `Moved ${data.label} to ${target.role}`,
    );
  };

  const blocked: Set<string> =
    dragging?.type === "box"
      ? subtreeIds(nodes, dragging.id)
      : dragging?.type === "member"
        ? new Set(
            nodes.filter((n) => n.kind !== "unit" || n.id === dragging.nodeId).map((n) => n.id),
          )
        : new Set();

  const view: View = {
    kids,
    membersOf,
    nameOf,
    memberName,
    blocked,
    onOpen: openBox,
    onAdd: (n) => addBelow(n),
  };

  const editing = boxDialog?.mode === "edit" ? boxDialog.node : null;
  const blockedParents = editing ? subtreeIds(nodes, editing.id) : new Set<string>();
  const siblingsOfEditing = editing ? (kids.get(editing.parent_id ?? "") ?? []) : [];
  const editingIndex = editing ? siblingsOfEditing.findIndex((s) => s.id === editing.id) : -1;
  const losingMembers =
    boxDialog?.mode === "edit" &&
    boxDialog.node.kind === "unit" &&
    boxDialog.fields.kind === "role" &&
    membersOf(boxDialog.node.id).length > 0
      ? membersOf(boxDialog.node.id).length
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Org chart</h1>
        <p className="text-sm text-muted-foreground">
          Draw how {orgName} is organised: units such as Finance and the people in them, the roles,
          who holds them and who reports to whom. Keep as many charts as you like, for example
          today's and a planned one. Everyone in the organisation can see and edit them.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:items-center">
        {list.length > 0 && chart ? (
          <Select value={chart.id} onValueChange={(v) => remember(v)}>
            <SelectTrigger className="sm:max-w-xs" aria-label="Chart">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {list.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            {charts.isLoading ? "Loading…" : "No charts yet."}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button size="sm" onClick={() => setNameDialog({ mode: "new", value: "" })}>
            <Plus className="mr-1 h-4 w-4" /> New chart
          </Button>
          {chart && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNameDialog({ mode: "rename", value: chart.name })}
              >
                <Pencil className="mr-1 h-4 w-4" /> Rename
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNameDialog({ mode: "copy", value: `${chart.name} (copy)` })}
              >
                <Copy className="mr-1 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmChartDelete(true)}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {!charts.isLoading && list.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Start your first org chart</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give it a name, then add the top role and build down from there.
          </p>
          <Button className="mt-4" onClick={() => setNameDialog({ mode: "new", value: "" })}>
            <Plus className="mr-1 h-4 w-4" /> New chart
          </Button>
        </div>
      )}

      {chart && (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 rounded-2xl border-2 border-border bg-card p-4">
              {nodesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : nodes.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">This chart has no boxes yet.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Button onClick={() => addAtTop(emptyFields)}>
                      <Plus className="mr-1 h-4 w-4" /> Add the top role
                    </Button>
                    <Button variant="outline" onClick={() => addAtTop(emptyUnit)}>
                      <Building2 className="mr-1 h-4 w-4" /> Add a unit
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <TopZone active={dragging?.type === "box"} />
                  <div className="overflow-x-auto pb-4">
                    <div className="org-tree mx-auto w-max min-w-full">
                      <Branch parentKey="" view={view} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      Drag a box onto another to put it below it, or to its left or right edge to
                      place it beside it. Click a box to edit it; + adds a role or unit below.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => addAtTop(emptyFields)}>
                        <Plus className="mr-1 h-4 w-4" /> Add a role at the top
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => addAtTop(emptyUnit)}>
                        <Building2 className="mr-1 h-4 w-4" /> Add a unit at the top
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <PeoplePanel
              people={people}
              loading={peopleQuery.isLoading}
              placesOf={placesOf}
              canDrop={nodes.length > 0}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="flex max-w-56 items-center gap-1.5 rounded-xl border-2 border-primary bg-background px-3 py-2 text-sm font-medium shadow-lg">
                {dragging.type === "box" ? (
                  dragging.kind === "unit" ? (
                    <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Workflow className="h-4 w-4 shrink-0 text-primary" />
                  )
                ) : (
                  <UserRound className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="truncate">{dragging.label}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === "rename"
                ? "Rename the chart"
                : nameDialog?.mode === "copy"
                  ? "Copy the chart"
                  : "New chart"}
            </DialogTitle>
            <DialogDescription>
              {nameDialog?.mode === "copy"
                ? "A copy keeps every box and unit member, so you can sketch changes without touching the original."
                : "For example “Today” or “After the 2027 reorganisation”."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="chart-name">Name</Label>
              <Input
                id="chart-name"
                autoFocus
                value={nameDialog?.value ?? ""}
                maxLength={MAX_CHART_NAME}
                onChange={(e) => setNameDialog((d) => (d ? { ...d, value: e.target.value } : d))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !nameDialog?.value.trim()}>
                {nameDialog?.mode === "rename" ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!boxDialog} onOpenChange={(o) => !o && setBoxDialog(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {(boxDialog?.mode === "edit" ? "Edit the " : "Add a ") +
                (boxDialog?.fields.kind === "unit" ? "unit" : "role")}
            </DialogTitle>
            <DialogDescription>
              {boxDialog?.mode === "add" && boxDialog.parentId
                ? `Below ${nodes.find((n) => n.id === boxDialog.parentId)?.role ?? "the box above"}.`
                : boxDialog?.mode === "add"
                  ? "At the top of the chart."
                  : "Pick people from People, or type their names."}
            </DialogDescription>
          </DialogHeader>
          {boxDialog && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveBox();
              }}
              className="space-y-4"
            >
              <div>
                <div
                  role="radiogroup"
                  aria-label="Kind of box"
                  className="grid grid-cols-2 gap-1 rounded-xl border-2 border-border p-1"
                >
                  {(["role", "unit"] as const).map((k) => {
                    const on = boxDialog.fields.kind === k;
                    const Icon = k === "unit" ? Building2 : UserRound;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() =>
                          setBoxDialog((d) =>
                            d ? ({ ...d, fields: { ...d.fields, kind: k } } as BoxDialog) : d,
                          )
                        }
                        className={
                          "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                          (on
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted")
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {k === "unit" ? "Unit, e.g. Finance" : "Role"}
                      </button>
                    );
                  })}
                </div>
                {losingMembers > 0 && (
                  <p className="mt-1.5 text-xs text-destructive">
                    As a role it can't have members: saving removes its {losingMembers}{" "}
                    {losingMembers === 1 ? "member" : "members"}.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="box-role">{KIND_WORDS[boxDialog.fields.kind].name}</Label>
                <Input
                  id="box-role"
                  autoFocus
                  placeholder={KIND_WORDS[boxDialog.fields.kind].placeholder}
                  value={boxDialog.fields.role}
                  maxLength={MAX_ROLE}
                  onChange={(e) =>
                    setBoxDialog((d) =>
                      d
                        ? ({ ...d, fields: { ...d.fields, role: e.target.value } } as BoxDialog)
                        : d,
                    )
                  }
                />
              </div>
              <PersonField
                label={KIND_WORDS[boxDialog.fields.kind].person}
                fields={boxDialog.fields}
                people={people}
                loading={peopleQuery.isLoading}
                onChange={(patch) =>
                  setBoxDialog((d) =>
                    d ? ({ ...d, fields: { ...d.fields, ...patch } } as BoxDialog) : d,
                  )
                }
              />
              {boxDialog.fields.kind === "unit" && (
                <MembersField
                  members={boxDialog.members}
                  people={people}
                  loading={peopleQuery.isLoading}
                  onChange={(next) =>
                    setBoxDialog((d) => (d ? ({ ...d, members: next } as BoxDialog) : d))
                  }
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="box-note">Note (optional)</Label>
                <Textarea
                  id="box-note"
                  rows={3}
                  value={boxDialog.fields.note}
                  maxLength={MAX_NOTE}
                  onChange={(e) =>
                    setBoxDialog((d) =>
                      d
                        ? ({ ...d, fields: { ...d.fields, note: e.target.value } } as BoxDialog)
                        : d,
                    )
                  }
                />
              </div>
              {boxDialog.mode === "edit" && (
                <>
                  <div className="space-y-1.5">
                    <Label>{boxDialog.fields.kind === "unit" ? "Part of" : "Reports to"}</Label>
                    <Select
                      value={boxDialog.parent}
                      onValueChange={(v) =>
                        setBoxDialog((d) => (d && d.mode === "edit" ? { ...d, parent: v } : d))
                      }
                    >
                      <SelectTrigger aria-label="Below">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TOP}>Nobody — at the top</SelectItem>
                        {nodes
                          .filter((n) => !blockedParents.has(n.id))
                          .map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.role}
                              {n.kind === "unit" ? " (unit)" : ""}
                              {nameOf(n) ? ` — ${nameOf(n)}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || editingIndex <= 0}
                      onClick={() => void shift(boxDialog.node, -1)}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> Move left
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        busy || editingIndex < 0 || editingIndex >= siblingsOfEditing.length - 1
                      }
                      onClick={() => void shift(boxDialog.node, 1)}
                    >
                      Move right <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addBelow(boxDialog.node)}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add a role below
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addBelow(boxDialog.node, emptyUnit)}
                    >
                      <Building2 className="mr-1 h-4 w-4" /> Add a unit below
                    </Button>
                  </div>
                </>
              )}
              <DialogFooter className="gap-2">
                {boxDialog.mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    onClick={() => setConfirmBoxDelete(boxDialog.node)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setBoxDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !boxDialog.fields.role.trim()}>
                  {boxDialog.mode === "edit" ? "Save" : "Add"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmChartDelete} onOpenChange={setConfirmChartDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{chart?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The chart and all {nodes.length} of its boxes are deleted for everyone in the
              organisation. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!chart) return;
                const name = chart.name;
                void run(async () => {
                  await deleteChart(chart.id);
                  remember(null);
                }, `Deleted ${name}`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBoxDelete} onOpenChange={(o) => !o && setConfirmBoxDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmBoxDelete?.role}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBoxDelete && (kids.get(confirmBoxDelete.id) ?? []).length > 0
                ? "The boxes below it move up to the box above it."
                : "The box is removed from the chart."}
              {confirmBoxDelete && membersOf(confirmBoxDelete.id).length > 0
                ? " Its members are removed from the chart with it."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const node = confirmBoxDelete;
                if (!node) return;
                void run(() => deleteNode(node)).then((ok) => ok && setBoxDialog(null));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Search People by name or email. */
function matchPeople(people: OrgPerson[], query: string) {
  const term = query.trim().toLowerCase();
  return people.filter(
    (p) =>
      !term || p.name.toLowerCase().includes(term) || (p.email ?? "").toLowerCase().includes(term),
  );
}

/**
 * Who holds the role: someone picked from People, or a name typed by hand.
 * Picking stores the person and a copy of their name; the box then shows
 * their name as it is in People.
 */
function PersonField({
  label,
  fields,
  people,
  loading,
  onChange,
}: {
  label: string;
  fields: NodeFields;
  people: OrgPerson[];
  loading: boolean;
  onChange: (patch: Partial<NodeFields>) => void;
}) {
  const [picking, setPicking] = useState(false);
  const linked = fields.person_id ? people.find((p) => p.id === fields.person_id) : undefined;

  const pick = (p: OrgPerson) => {
    onChange({ person_id: p.id, person_name: p.name.slice(0, MAX_PERSON) });
    setPicking(false);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fields.person_id ? undefined : "box-person"}>{label}</Label>
      {fields.person_id ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-border px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {linked?.name ?? fields.person_name ?? "Someone from People"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {linked ? (linked.email ?? "From People") : "No longer in People"}
            </span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setPicking(true)}>
            Change
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ person_id: null, person_name: "" })}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="box-person"
            placeholder="Type a name, or leave empty if open"
            value={fields.person_name}
            maxLength={MAX_PERSON}
            onChange={(e) => onChange({ person_name: e.target.value })}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
          >
            <UserRound className="mr-1 h-4 w-4" /> Pick from People
          </Button>
        </div>
      )}
      {picking && (
        <PeoplePicker
          people={people}
          loading={loading}
          onPick={pick}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** A searchable list of People; Enter picks the only match. */
function PeoplePicker({
  people,
  loading,
  onPick,
  onClose,
  onTyped,
  emptyText = "No one in People yet.",
}: {
  people: OrgPerson[];
  loading: boolean;
  onPick: (p: OrgPerson) => void;
  onClose?: () => void;
  /** Offers to add the search text as a typed name when given. */
  onTyped?: (name: string) => void;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = matchPeople(people, query);
  const typed = query.trim();
  const pick = (p: OrgPerson) => {
    onPick(p);
    setQuery("");
  };
  return (
    <div className="space-y-2 rounded-xl border-2 border-border p-2">
      <label className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus={!!onClose}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length === 1) pick(matches[0]!);
              else if (matches.length === 0 && typed && onTyped) {
                onTyped(typed);
                setQuery("");
              }
            }
            if (e.key === "Escape" && onClose) {
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder="Search People"
          aria-label="Search People"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <ul className="max-h-48 overflow-y-auto" aria-label="People">
        {loading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
        {!loading && matches.length === 0 && !(typed && onTyped) && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">
            {people.length === 0 || !typed ? emptyText : "No one matches."}
          </li>
        )}
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => pick(p)}
              className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className="text-sm font-medium">{p.name}</span>
              {p.email && p.email !== p.name && (
                <span className="text-xs text-muted-foreground">{p.email}</span>
              )}
            </button>
          </li>
        ))}
        {typed && onTyped && matches.length === 0 && (
          <li>
            <button
              type="button"
              onClick={() => {
                onTyped(typed.slice(0, MAX_PERSON));
                setQuery("");
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4 shrink-0" /> Add “{typed.slice(0, MAX_PERSON)}” by name
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The people in a unit, saved with the unit. */
function MembersField({
  members,
  people,
  loading,
  onChange,
}: {
  members: StagedMember[];
  people: OrgPerson[];
  loading: boolean;
  onChange: (next: StagedMember[]) => void;
}) {
  const inUnit = new Set(members.flatMap((m) => (m.person_id ? [m.person_id] : [])));
  const nameOf = (m: StagedMember) =>
    (m.person_id ? people.find((p) => p.id === m.person_id)?.name : null) ?? m.person_name;
  return (
    <div className="space-y-1.5">
      <Label>Members{members.length > 0 ? ` (${members.length})` : ""}</Label>
      {members.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Members">
          {members.map((m, i) => (
            <li
              key={m.id ?? `new-${i}`}
              className="flex items-center gap-1 rounded-full border-2 border-border bg-background py-0.5 pl-2.5 pr-1 text-sm"
            >
              {m.person_id && <Link2 className="h-3 w-3 shrink-0 text-primary" />}
              <span className="max-w-40 truncate">{nameOf(m)}</span>
              <button
                type="button"
                onClick={() => onChange(members.filter((_, j) => j !== i))}
                aria-label={`Remove ${nameOf(m)}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PeoplePicker
        people={people.filter((p) => !inUnit.has(p.id))}
        loading={loading}
        emptyText={people.length === 0 ? "No one in People yet." : "Everyone in People is here."}
        onPick={(p) => onChange([...members, { person_id: p.id, person_name: p.name }])}
        onTyped={(name) => onChange([...members, { person_id: null, person_name: name }])}
      />
      <p className="text-xs text-muted-foreground">
        Or drag people from the People list onto the unit in the chart.
      </p>
    </div>
  );
}

/** People to drag into the chart: onto a unit to join it, onto a role to hold it. */
function PeoplePanel({
  people,
  loading,
  placesOf,
  canDrop,
}: {
  people: OrgPerson[];
  loading: boolean;
  placesOf: Map<string, string[]>;
  canDrop: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = matchPeople(people, query);
  return (
    <aside className="flex min-w-0 flex-col rounded-2xl border-2 border-border bg-card p-4 lg:max-h-[80vh]">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" /> People
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {canDrop
          ? "Drag someone onto a unit to add them to it, or onto a role to give it to them."
          : "Add a unit or a role, then drag people onto it."}
      </p>
      <label className="mt-2 flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search People"
          aria-label="Search People to drag"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <ul className="mt-2 max-h-72 min-h-0 flex-1 space-y-1 overflow-y-auto lg:max-h-none">
        {loading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
        {!loading && matches.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">
            {people.length === 0 ? "No one in People yet." : "No one matches."}
          </li>
        )}
        {matches.map((p) => (
          <PersonRow key={p.id} person={p} places={placesOf.get(p.id) ?? []} />
        ))}
      </ul>
    </aside>
  );
}

function PersonRow({ person, places }: { person: OrgPerson; places: string[] }) {
  const drag = useDraggable({
    id: `person:${person.id}`,
    data: { type: "person", personId: person.id, label: person.name } satisfies DragData,
  });
  return (
    <li
      ref={drag.setNodeRef}
      {...drag.listeners}
      className={
        "flex cursor-grab touch-manipulation select-none items-start gap-1.5 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted active:cursor-grabbing " +
        (drag.isDragging ? "opacity-40" : "")
      }
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {places.length > 0 ? places.join(", ") : "Not in this chart"}
        </span>
      </span>
    </li>
  );
}

/**
 * Above the chart: a hint, which turns into "drop here to put it at the top"
 * while a box is dragged. It keeps its size, so the chart doesn't shift under
 * the pointer when a drag starts.
 */
function TopZone({ active }: { active: boolean }) {
  const drop = useDroppable({
    id: "top",
    data: { top: true } satisfies DropData,
    disabled: !active,
  });
  return (
    <div
      ref={drop.setNodeRef}
      className={
        "mb-3 truncate rounded-xl border-2 border-dashed px-3 py-2 text-center text-xs transition " +
        (!active
          ? "border-transparent text-muted-foreground"
          : drop.isOver
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground")
      }
    >
      {active
        ? "Drop here to put it at the top of the chart"
        : "Drag boxes to move them, and people from the People list onto units and roles."}
    </div>
  );
}

/** The three parts of a box a dragged box can land on: left edge, middle, right edge. */
function DropZones({ node, disabled }: { node: ChartNode; disabled: boolean }) {
  return (
    <>
      <Zone node={node} where="before" disabled={disabled} className="left-0 w-1/4" />
      <Zone node={node} where="into" disabled={disabled} className="left-1/4 w-1/2" />
      <Zone node={node} where="after" disabled={disabled} className="right-0 w-1/4" />
    </>
  );
}

function Zone({
  node,
  where,
  disabled,
  className,
}: {
  node: ChartNode;
  where: "before" | "into" | "after";
  disabled: boolean;
  className: string;
}) {
  const drop = useDroppable({
    id: `drop:${node.id}:${where}`,
    data: { node, where } satisfies DropData,
    disabled,
  });
  return (
    <div
      ref={drop.setNodeRef}
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 ${className}`}
    />
  );
}

function Branch({ parentKey, view }: { parentKey: string; view: View }) {
  const list = view.kids.get(parentKey) ?? [];
  if (list.length === 0) return null;
  return (
    <ul>
      {list.map((n) => (
        <li key={n.id}>
          <BoxCard n={n} view={view} />
          <Branch parentKey={n.id} view={view} />
        </li>
      ))}
    </ul>
  );
}

function BoxCard({ n, view }: { n: ChartNode; view: View }) {
  const drag = useDraggable({
    id: `box:${n.id}`,
    data: { type: "box", id: n.id, kind: n.kind, label: n.role } satisfies DragData,
  });
  const { active, over } = useDndContext();
  const dragging = active?.data.current as DragData | undefined;
  const overData = over?.data.current as DropData | undefined;
  const overHere =
    overData && !("top" in overData) && overData.node.id === n.id ? overData.where : null;
  const asChild = !!overHere && (dragging?.type !== "box" || overHere === "into");
  const beside = dragging?.type === "box" && overHere !== "into" ? overHere : null;
  const unit = n.kind === "unit";
  const shown = unit ? view.membersOf(n.id) : [];

  return (
    <div ref={drag.setNodeRef} className={"relative " + (drag.isDragging ? "opacity-40" : "")}>
      <DropZones node={n} disabled={view.blocked.has(n.id)} />
      {beside && (
        <span
          aria-hidden
          className={
            "absolute inset-y-0 w-1 rounded-full bg-primary " +
            (beside === "before" ? "-left-2" : "-right-2")
          }
        />
      )}
      <div
        className={
          "rounded-xl border-2 text-center shadow-sm transition " +
          (unit ? "w-52 border-primary/50 bg-primary/10" : "w-44 border-border bg-background") +
          (asChild ? " ring-2 ring-primary ring-offset-2 ring-offset-card" : "")
        }
      >
        <button
          type="button"
          {...drag.listeners}
          onClick={() => view.onOpen(n)}
          className="block w-full cursor-grab touch-manipulation rounded-[10px] px-3 py-2.5 hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
        >
          {unit && (
            <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Building2 className="h-3 w-3 shrink-0" /> Unit
            </span>
          )}
          <span
            className={
              "block text-sm leading-snug " + (unit ? "mt-0.5 font-bold" : "font-semibold")
            }
          >
            {n.role}
          </span>
          {(!unit || view.nameOf(n)) && (
            <span
              className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"
              title={n.person_id ? "From People" : undefined}
            >
              {n.person_id ? (
                <Link2 className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <UserRound className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">
                {unit ? `Head: ${view.nameOf(n)}` : view.nameOf(n) || "Open"}
              </span>
            </span>
          )}
          {n.note && (
            <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground/80">
              {n.note}
            </span>
          )}
        </button>
        {unit && (
          <div className="border-t border-primary/30 px-2 pb-4 pt-1.5">
            {shown.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet</p>
            ) : (
              <ul
                className="flex flex-wrap justify-center gap-1"
                aria-label={`Members of ${n.role}`}
              >
                {shown.slice(0, MEMBERS_SHOWN).map((m) => (
                  <MemberChip
                    key={m.id}
                    m={m}
                    name={view.memberName(m)}
                    onOpen={() => view.onOpen(n)}
                  />
                ))}
                {shown.length > MEMBERS_SHOWN && (
                  <li>
                    <button
                      type="button"
                      onClick={() => view.onOpen(n)}
                      className="rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background"
                    >
                      +{shown.length - MEMBERS_SHOWN} more
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => view.onAdd(n)}
        aria-label={`Add a role or unit below ${n.role}`}
        title="Add a role or unit below"
        className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Someone in a unit's box; drag them onto another unit to move them there. */
function MemberChip({ m, name, onOpen }: { m: ChartMember; name: string; onOpen: () => void }) {
  const drag = useDraggable({
    id: `member:${m.id}`,
    data: {
      type: "member",
      memberId: m.id,
      nodeId: m.node_id,
      personId: m.person_id,
      label: name,
    } satisfies DragData,
  });
  return (
    <li ref={drag.setNodeRef} className={drag.isDragging ? "opacity-40" : ""}>
      <button
        type="button"
        {...drag.listeners}
        onClick={onOpen}
        title={`${name}: drag onto another unit to move`}
        className="flex max-w-44 cursor-grab touch-manipulation items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs active:cursor-grabbing"
      >
        {m.person_id && <Link2 className="h-3 w-3 shrink-0 text-primary" />}
        <span className="truncate">{name}</span>
      </button>
    </li>
  );
}
