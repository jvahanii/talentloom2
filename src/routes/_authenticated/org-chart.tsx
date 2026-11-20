import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
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
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_CHART_NAME,
  MAX_NOTE,
  MAX_PERSON,
  MAX_ROLE,
  addMembers,
  addNode,
  chartDottedKey,
  chartMembersKey,
  chartNodesKey,
  chartsKey,
  childrenOf,
  copyChart,
  copyIntoEmptyChart,
  createChart,
  deleteChart,
  deleteMembers,
  deleteNode,
  fetchCharts,
  fetchDotted,
  fetchMembers,
  fetchNodes,
  fetchOrgPeople,
  moveMember,
  orgPeopleKey,
  impliedReporting,
  planMove,
  renameChart,
  subtreeIds,
  samePerson,
  updateNode,
  setDotted,
  type ChartMember,
  type ChartNode,
  type DropPlace,
  type ImpliedLine,
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
/** also: for a role, the roles it also reports to (dotted lines). */
type BoxDialog =
  | {
      mode: "add";
      parentId: string | null;
      fields: NodeFields;
      members: StagedMember[];
      also?: string[];
    }
  | {
      mode: "edit";
      node: ChartNode;
      fields: NodeFields;
      parent: string;
      members: StagedMember[];
      also?: string[];
    }
  | null;

const emptyFields: NodeFields = {
  kind: "role",
  role: "",
  person_name: "",
  person_id: null,
  unit_id: null,
  note: "",
};
const emptyUnit: NodeFields = { ...emptyFields, kind: "unit" };
const emptyOf = (k: NodeKind) => (k === "unit" ? emptyUnit : emptyFields);

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
  /** A role's unit, by name. */
  unitName: (n: ChartNode) => string | null;
  /** How many roles belong to a unit. */
  roleCount: (unitId: string) => number;
  /** The roles a role also reports to (dotted lines). */
  alsoOf: (roleId: string) => ChartNode[];
  /** Roles lit up while the pointer is on a dotted-line label. */
  highlight: Set<string>;
  onHighlight: (ids: string[]) => void;
  /** Reporting lines implied by the units, by where they hang. */
  implied: Map<string, ImpliedLine[]>;
  onOpenImplied: (line: ImpliedLine) => void;
  /** Boxes the item being dragged can't land on. */
  blocked: Set<string>;
  onOpen: (n: ChartNode) => void;
  onAdd: (n: ChartNode) => void;
  /** Takes someone out of a unit, straight from the chart (with Undo). */
  onRemoveMember: (m: ChartMember, unit: ChartNode) => void;
  /** Clears a unit's head, straight from the chart (with Undo). */
  onRemoveHead: (unit: ChartNode) => void;
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

  // Two trees per chart, one per tab: units, and roles with their reporting lines.
  const [tab, chooseTab] = useRememberedTab("org-chart", ["units", "reporting"] as const, "units");
  const kind: NodeKind = tab === "units" ? "unit" : "role";
  const units = nodes.filter((n) => n.kind === "unit");
  const roles = nodes.filter((n) => n.kind === "role");
  const unitKids = childrenOf(units);
  const roleKids = childrenOf(roles);
  const kidsOf = (k: NodeKind) => (k === "unit" ? unitKids : roleKids);
  const shown = kind === "unit" ? units : roles;
  const kids = kidsOf(kind);
  const unitById = new Map(units.map((u) => [u.id, u]));

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

  const dottedQuery = useQuery({
    queryKey: chartDottedKey(chart?.id ?? null),
    enabled: !!chart,
    queryFn: () => fetchDotted(chart!.id),
  });
  const dotted = dottedQuery.data ?? [];
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const alsoIds = (roleId: string) =>
    dotted.filter((d) => d.role_id === roleId).map((d) => d.reports_to_id);
  const alsoOf = (roleId: string) =>
    alsoIds(roleId).flatMap((id) => {
      const r = roleById.get(id);
      return r ? [r] : [];
    });
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

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

  /** The units each person from People heads or belongs to, by name. */
  const unitsOf = new Map<string, string[]>();
  const addUnit = (personId: string | null, unit: string | undefined) => {
    if (!personId || !unit) return;
    const list = unitsOf.get(personId) ?? [];
    if (!list.includes(unit)) unitsOf.set(personId, [...list, unit]);
  };
  for (const u of nodes) if (u.kind === "unit") addUnit(u.person_id, u.role);
  for (const m of members) addUnit(m.person_id, nodes.find((n) => n.id === m.node_id)?.role);
  /** The units each person from People heads, by name. */
  const headsOf = new Map<string, string[]>();
  for (const u of nodes)
    if (u.kind === "unit" && u.person_id)
      headsOf.set(u.person_id, [...(headsOf.get(u.person_id) ?? []), u.role]);

  const [busy, setBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [boxDialog, setBoxDialog] = useState<BoxDialog>(null);
  const [confirmChartDelete, setConfirmChartDelete] = useState(false);
  const [confirmBoxDelete, setConfirmBoxDelete] = useState<ChartNode | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  /** Where the dragged item would land, for the label on the dragged chip. */
  const [dropAt, setDropAt] = useState<DropData | null>(null);
  const [impliedOpen, setImpliedOpen] = useState<ImpliedLine | null>(null);
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
      await qc.invalidateQueries({ queryKey: chartDottedKey(chart.id) });
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

  const nextPosition = (parentId: string | null, k: NodeKind) => {
    const siblings = kidsOf(k).get(parentId ?? "") ?? [];
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
        unit_id: n.unit_id,
        note: n.note ?? "",
      },
      members: staged(n),
      also: n.kind === "role" ? alsoIds(n.id) : [],
    });
  };
  /** A new box of the same kind below n: a sub-unit, or a role reporting to n. */
  const addBelow = (n: ChartNode) =>
    setBoxDialog({
      mode: "add",
      parentId: n.id,
      // A new role starts in the unit of the role it reports to.
      fields: { ...emptyOf(n.kind), unit_id: n.kind === "role" ? n.unit_id : null },
      members: [],
    });
  const addAtTop = () =>
    setBoxDialog({ mode: "add", parentId: null, fields: emptyOf(kind), members: [] });

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
    const k = boxDialog.fields.kind;
    const isUnit = k === "unit";
    // The head is never also listed as a member.
    const unitMembers = boxDialog.members.filter((m) => !samePerson(m, boxDialog.fields));
    const ok = await run(async () => {
      if (boxDialog.mode === "add") {
        const id = await addNode(
          orgId,
          chart.id,
          boxDialog.parentId,
          nextPosition(boxDialog.parentId, k),
          boxDialog.fields,
        );
        if (isUnit) await addMembers(orgId, chart.id, id, unitMembers, 0);
        // The main manager can't also be a dotted line.
        else
          await setDotted(
            orgId,
            chart.id,
            id,
            [],
            (boxDialog.also ?? []).filter((t) => t !== boxDialog.parentId),
          );
      } else {
        const parent = boxDialog.parent === TOP ? null : boxDialog.parent;
        const moved = parent !== boxDialog.node.parent_id;
        await updateNode(boxDialog.node.id, {
          ...boxDialog.fields,
          ...(moved ? { parent_id: parent, position: nextPosition(parent, k) } : {}),
        });
        if (!isUnit)
          await setDotted(
            orgId,
            chart.id,
            boxDialog.node.id,
            dotted,
            (boxDialog.also ?? []).filter((t) => t !== parent),
          );
        if (isUnit) {
          const kept = new Set(unitMembers.flatMap((m) => (m.id ? [m.id] : [])));
          await deleteMembers(
            membersOf(boxDialog.node.id)
              .filter((m) => !kept.has(m.id))
              .map((m) => m.id),
          );
          await addMembers(
            orgId,
            chart.id,
            boxDialog.node.id,
            unitMembers.filter((m) => !m.id),
            nextMemberPosition(boxDialog.node.id),
          );
        }
      }
    });
    if (ok) setBoxDialog(null);
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as DragData | undefined) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    setDropAt(null);
    dragEndedAt.current = Date.now();
    const data = e.active.data.current as DragData | undefined;
    const drop = e.over?.data.current as DropData | undefined;
    if (!data || !drop || !chart) return;

    if (data.type === "box") {
      const place: DropPlace =
        "top" in drop ? { where: "top" } : { where: drop.where, target: drop.node.id };
      const plan = planMove(
        nodes.filter((n) => n.kind === data.kind),
        data.id,
        place,
      );
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
        const wasHead = samePerson(target, { person_id: person.id, person_name: person.name });
        void run(
          async () => {
            await addMembers(
              orgId,
              chart.id,
              target.id,
              [{ person_id: person.id, person_name: person.name }],
              nextMemberPosition(target.id),
            );
            // A member now, so no longer the head as well.
            if (wasHead) await updateNode(target.id, { person_id: null, person_name: "" });
          },
          wasHead
            ? `${person.name} is now a member of ${target.role}, no longer its head`
            : `Added ${person.name} to ${target.role}`,
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
    const moving = members.find((m) => m.id === data.memberId);
    const wasHead = !!moving && samePerson(target, moving);
    void run(
      async () => {
        if (already) await deleteMembers([data.memberId]);
        else await moveMember(data.memberId, target.id, nextMemberPosition(target.id));
        // A member there now, so no longer its head as well.
        if (wasHead) await updateNode(target.id, { person_id: null, person_name: "" });
      },
      wasHead
        ? `${data.label} is now a member of ${target.role}, no longer its head`
        : `Moved ${data.label} to ${target.role}`,
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

  // Worked out on either tab, so the Reporting lines tab can count them; drawn only there.
  const allImplied = impliedReporting(nodes, members, nameOf, memberName);
  const impliedLines = kind === "role" ? allImplied : [];
  const implied = new Map<string, ImpliedLine[]>();
  for (const l of impliedLines) implied.set(l.parent, [...(implied.get(l.parent) ?? []), l]);
  /** A role for someone shown by an implied line, reporting where the line does. */
  const roleFromLine = (l: ImpliedLine) => {
    setImpliedOpen(null);
    setBoxDialog({
      mode: "add",
      parentId: l.managerRoleId,
      fields: {
        ...emptyFields,
        role: l.isHead ? l.title : "",
        person_id: l.personId,
        person_name: l.name.slice(0, MAX_PERSON),
        unit_id: l.unitId,
      },
      members: [],
    });
  };

  /** How long a removal can be undone: long enough to notice and reach the button. */
  const UNDO_MS = 8000;

  const removeMember = (m: ChartMember, unit: ChartNode) => {
    if (!chart) return;
    const c = chart;
    const name = memberName(m);
    qc.setQueryData<ChartMember[]>(chartMembersKey(c.id), (old) =>
      old?.filter((x) => x.id !== m.id),
    );
    void run(() => deleteMembers([m.id])).then((ok) => {
      if (!ok) return;
      toast(`Removed ${name} from ${unit.role}`, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void run(() =>
              addMembers(
                orgId,
                c.id,
                unit.id,
                [{ person_id: m.person_id, person_name: m.person_name }],
                m.position,
              ),
            ),
        },
      });
    });
  };

  const removeHead = (unit: ChartNode) => {
    if (!chart) return;
    const name = nameOf(unit) ?? "The head";
    const before = { person_id: unit.person_id, person_name: unit.person_name ?? "" };
    qc.setQueryData<ChartNode[]>(chartNodesKey(chart.id), (old) =>
      old?.map((x) => (x.id === unit.id ? { ...x, person_id: null, person_name: null } : x)),
    );
    void run(() => updateNode(unit.id, { person_id: null, person_name: "" })).then((ok) => {
      if (!ok) return;
      toast(`${name} is no longer head of ${unit.role}`, {
        duration: UNDO_MS,
        action: { label: "Undo", onClick: () => void run(() => updateNode(unit.id, before)) },
      });
    });
  };

  const view: View = {
    onRemoveMember: removeMember,
    onRemoveHead: removeHead,
    implied,
    onOpenImplied: (l) => {
      if (Date.now() - dragEndedAt.current < 300) return;
      setImpliedOpen(l);
    },
    kids,
    membersOf,
    nameOf,
    memberName,
    unitName: (n) => (n.unit_id ? (unitById.get(n.unit_id)?.role ?? null) : null),
    roleCount: (unitId) => roles.filter((r) => r.unit_id === unitId).length,
    alsoOf,
    highlight,
    onHighlight: (ids) => setHighlight(new Set(ids)),
    blocked,
    onOpen: openBox,
    onAdd: addBelow,
  };

  const editing = boxDialog?.mode === "edit" ? boxDialog.node : null;
  const blockedParents = editing ? subtreeIds(nodes, editing.id) : new Set<string>();
  const dialogKind: NodeKind = boxDialog?.fields.kind ?? kind;
  /** Units listed top-down, indented by depth, for the role's Unit select. */
  const unitOptions: { node: ChartNode; depth: number }[] = [];
  const walkUnits = (key: string, depth: number) => {
    for (const u of unitKids.get(key) ?? []) {
      unitOptions.push({ node: u, depth });
      walkUnits(u.id, depth + 1);
    }
  };
  walkUnits("", 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Org chart</h1>
        <p className="text-sm text-muted-foreground">
          Draw how {orgName} is organised. <strong>Units</strong> shows what is part of what, such
          as Finance and Accounting, and who is in each. <strong>Reporting lines</strong> shows the
          roles and who reports to whom, which can cross units. Keep as many charts as you like, for
          example today's and a planned one. Everyone in the organisation can see and edit them.
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
            Give it a name, then add its units and the roles that report to each other.
          </p>
          <Button className="mt-4" onClick={() => setNameDialog({ mode: "new", value: "" })}>
            <Plus className="mr-1 h-4 w-4" /> New chart
          </Button>
        </div>
      )}

      {chart && (
        <Tabs value={tab} onValueChange={chooseTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="units">
              <Building2 className="mr-1.5 h-4 w-4" /> Units ({units.length})
            </TabsTrigger>
            <TabsTrigger value="reporting">
              <Workflow className="mr-1.5 h-4 w-4" /> Reporting lines (
              {roles.length + allImplied.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {chart && (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={(e) => setDropAt((e.over?.data.current as DropData | undefined) ?? null)}
          onDragCancel={() => {
            setDragging(null);
            setDropAt(null);
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 rounded-2xl border-2 border-border bg-card p-4">
              {nodesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : shown.length === 0 && impliedLines.length === 0 ? (
                <div className="py-8 text-center">
                  {kind === "unit" ? (
                    <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
                  ) : (
                    <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {kind === "unit"
                      ? "No units yet. Start with the whole organisation or its main units, such as Finance and Sales, then add the units within them."
                      : "No roles yet. Start with the top role, such as CEO, then add the roles that report to it."}
                  </p>
                  <Button className="mt-3" onClick={addAtTop}>
                    <Plus className="mr-1 h-4 w-4" />{" "}
                    {kind === "unit" ? "Add a unit" : "Add the top role"}
                  </Button>
                  {nodes.length === 0 && list.length > 1 && (
                    <CopyFromChart
                      charts={list.filter((c) => c.id !== chart.id)}
                      busy={busy}
                      onCopy={(from) =>
                        void run(
                          () => copyIntoEmptyChart(orgId!, from.id, chart.id),
                          `Copied ${from.name} into ${chart.name}`,
                        )
                      }
                    />
                  )}
                </div>
              ) : (
                <>
                  {impliedLines.length > 0 && (
                    <div className="mb-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-muted-foreground/60" />
                      Dashed: follows from the Units tab
                    </div>
                  )}
                  <TopZone active={dragging?.type === "box"} kind={kind} />
                  <div className="overflow-x-auto pb-4">
                    <div className="org-tree mx-auto w-max min-w-full">
                      <Branch parentKey="" view={view} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      {kind === "unit"
                        ? "Drag a unit onto another to make it part of it, or to its left or right edge to place it beside it. Click a unit to edit it; + adds a unit within it."
                        : "Drag a role onto another to make it report to it, or to its left or right edge to place it beside it. Click a role to edit it; + adds a role reporting to it."}
                    </p>
                    <Button size="sm" variant="outline" onClick={addAtTop}>
                      <Plus className="mr-1 h-4 w-4" />{" "}
                      {kind === "unit" ? "Add a unit at the top" : "Add a role at the top"}
                    </Button>
                  </div>
                </>
              )}
            </div>
            <PeoplePanel
              people={people}
              loading={peopleQuery.isLoading}
              placesOf={placesOf}
              unitsOf={unitsOf}
              headsOf={headsOf}
              kind={kind}
              canDrop={shown.length > 0}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="flex max-w-72 items-center gap-1.5 rounded-xl border-2 border-primary bg-background px-3 py-2 text-sm font-medium shadow-lg">
                {dragging.type === "box" ? (
                  dragging.kind === "unit" ? (
                    <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Workflow className="h-4 w-4 shrink-0 text-primary" />
                  )
                ) : (
                  <UserRound className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{dragging.label}</span>
                  <span
                    className={
                      "block truncate text-xs " +
                      (dropAt ? "font-semibold text-primary" : "text-muted-foreground")
                    }
                  >
                    {!dropAt
                      ? "Not over a place to drop"
                      : "top" in dropAt
                        ? "Put it at the top of the chart"
                        : dropOutcome(dragging, dropAt.node, dropAt.where, view)}
                  </span>
                </span>
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
                ? `${dialogKind === "unit" ? "Part of" : "Reports to"} ${nodes.find((n) => n.id === boxDialog.parentId)?.role ?? "the box above"}.`
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
                  setBoxDialog((d) => {
                    if (!d) return d;
                    const fields = { ...d.fields, ...patch };
                    // A unit's head isn't also one of its members.
                    const members =
                      fields.kind === "unit"
                        ? d.members.filter((m) => !samePerson(m, fields))
                        : d.members;
                    return { ...d, fields, members } as BoxDialog;
                  })
                }
              />
              {boxDialog.fields.kind === "role" && (
                <div className="space-y-1.5">
                  <Label>Unit (optional)</Label>
                  <Select
                    value={boxDialog.fields.unit_id ?? TOP}
                    onValueChange={(v) =>
                      setBoxDialog((d) =>
                        d
                          ? ({
                              ...d,
                              fields: { ...d.fields, unit_id: v === TOP ? null : v },
                            } as BoxDialog)
                          : d,
                      )
                    }
                  >
                    <SelectTrigger aria-label="Unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TOP}>No unit</SelectItem>
                      {unitOptions.map(({ node: u, depth }) => (
                        <SelectItem key={u.id} value={u.id}>
                          {"  ".repeat(depth)}
                          {u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {units.length === 0
                      ? "Add units on the Units tab to place roles in them."
                      : "The unit the role belongs to. It can differ from the unit of the role it reports to."}
                  </p>
                </div>
              )}
              {boxDialog.fields.kind === "role" && (
                <AlsoReportsField
                  value={boxDialog.also ?? []}
                  roles={roles.filter(
                    (r) =>
                      r.id !== (boxDialog.mode === "edit" ? boxDialog.node.id : null) &&
                      r.id !==
                        (boxDialog.mode === "edit"
                          ? boxDialog.parent === TOP
                            ? null
                            : boxDialog.parent
                          : boxDialog.parentId),
                  )}
                  nameOf={nameOf}
                  onChange={(also) => setBoxDialog((d) => (d ? ({ ...d, also } as BoxDialog) : d))}
                />
              )}
              {boxDialog.fields.kind === "unit" && (
                <MembersField
                  members={boxDialog.members}
                  people={people}
                  loading={peopleQuery.isLoading}
                  onChange={(next) =>
                    setBoxDialog((d) => {
                      if (!d) return d;
                      // Added as a member: then not the head as well.
                      const headIsMember = next.some((m) => samePerson(m, d.fields));
                      const fields = headIsMember
                        ? { ...d.fields, person_id: null, person_name: "" }
                        : d.fields;
                      return { ...d, fields, members: next } as BoxDialog;
                    })
                  }
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="box-note">Note (optional)</Label>
                <Textarea
                  id="box-note"
                  rows={2}
                  className="min-h-[3.25rem]"
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
                        <SelectItem value={TOP}>
                          {dialogKind === "unit" ? "Nothing — at the top" : "Nobody — at the top"}
                        </SelectItem>
                        {nodes
                          .filter((n) => n.kind === dialogKind && !blockedParents.has(n.id))
                          .map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.role}
                              {nameOf(n) ? ` — ${nameOf(n)}` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {/* Stays in view at the bottom of the dialog however long the form gets. */}
              <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
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

      <Dialog open={!!impliedOpen} onOpenChange={(o) => !o && setImpliedOpen(null)}>
        <DialogContent>
          {impliedOpen && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {impliedOpen.managerName
                    ? `${impliedOpen.name} reports to ${impliedOpen.managerName}`
                    : `${impliedOpen.name} heads ${impliedOpen.unitName}`}
                </DialogTitle>
                <DialogDescription>
                  {impliedOpen.isHead
                    ? impliedOpen.managerName
                      ? `${impliedOpen.name} heads ${impliedOpen.unitName}, which is part of ${impliedOpen.managerUnitName}, headed by ${impliedOpen.managerName}.`
                      : `${impliedOpen.name} heads ${impliedOpen.unitName}, and no unit above it has a head.`
                    : impliedOpen.managerUnitName === impliedOpen.unitName
                      ? `${impliedOpen.name} is in ${impliedOpen.unitName}, headed by ${impliedOpen.managerName}.`
                      : `${impliedOpen.name} is in ${impliedOpen.unitName}, which has no head of its own; the nearest head above it is ${impliedOpen.managerName} of ${impliedOpen.managerUnitName}.`}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This line follows from the Units tab and changes with it. To draw it differently,
                give {impliedOpen.name} a role here: a role's own reporting line replaces this one.
                {impliedOpen.managerName && !impliedOpen.managerRoleId
                  ? ` ${impliedOpen.managerName} has no role here yet, so the new role starts at the top.`
                  : ""}
              </p>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImpliedOpen(null);
                    chooseTab("units");
                  }}
                >
                  <Building2 className="mr-1 h-4 w-4" /> Go to Units
                </Button>
                <Button type="button" onClick={() => roleFromLine(impliedOpen)}>
                  <Plus className="mr-1 h-4 w-4" /> Give {impliedOpen.name} a role
                </Button>
              </DialogFooter>
            </>
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
              {confirmBoxDelete &&
              (kidsOf(confirmBoxDelete.kind).get(confirmBoxDelete.id) ?? []).length > 0
                ? confirmBoxDelete.kind === "unit"
                  ? "The units within it move up to the unit it is part of."
                  : "The roles reporting to it move up to report to the role above it."
                : "It is removed from the chart."}
              {confirmBoxDelete && membersOf(confirmBoxDelete.id).length > 0
                ? " Its members are removed with it."
                : ""}
              {confirmBoxDelete?.kind === "unit" && view.roleCount(confirmBoxDelete.id) > 0
                ? " Roles in it stay in Reporting lines, without a unit."
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
  // Each word on its own, so "anna stro" finds "Anna Stroikina" however it's spaced.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return people.filter((p) => {
    const text = `${p.name} ${p.email ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
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
      <ul className="max-h-32 overflow-y-auto" aria-label="People">
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

/**
 * The roles a role also reports to besides its main one (dotted lines).
 * `roles` already leaves out the role itself and its main manager.
 */
function AlsoReportsField({
  value,
  roles,
  nameOf,
  onChange,
}: {
  value: string[];
  roles: ChartNode[];
  nameOf: (n: ChartNode) => string | null;
  onChange: (next: string[]) => void;
}) {
  const label = (r: ChartNode) => r.role + (nameOf(r) ? ` — ${nameOf(r)}` : "");
  const chosen = roles.filter((r) => value.includes(r.id));
  const left = roles.filter((r) => !value.includes(r.id));
  return (
    <div className="space-y-1.5">
      <Label>Also reports to (optional)</Label>
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Also reports to">
          {chosen.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-1 rounded-full border-2 border-dotted border-primary/60 bg-background py-0.5 pl-2.5 pr-1 text-sm"
            >
              <span className="max-w-48 truncate">{label(r)}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== r.id))}
                aria-label={`Stop reporting to ${r.role}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {left.length > 0 ? (
        // Picking an option adds it; the list then starts again from "Add a role".
        <Select value="" onValueChange={(id) => id && onChange([...value, id])}>
          <SelectTrigger aria-label="Add a role it also reports to">
            <SelectValue placeholder="Add a role it also reports to" />
          </SelectTrigger>
          <SelectContent>
            {left.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {label(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        chosen.length === 0 && (
          <p className="text-xs text-muted-foreground">There are no other roles to pick yet.</p>
        )
      )}
      <p className="text-xs text-muted-foreground">
        A dotted line, for example a project or functional manager besides the main one. It shows as
        a label on the role.
      </p>
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
  unitsOf,
  headsOf,
  kind,
  canDrop,
}: {
  people: OrgPerson[];
  loading: boolean;
  placesOf: Map<string, string[]>;
  /** The units each person heads or belongs to. */
  unitsOf: Map<string, string[]>;
  /** The units each person heads. */
  headsOf: Map<string, string[]>;
  kind: NodeKind;
  canDrop: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = matchPeople(people, query);
  const [sort, chooseSort] = useRememberedTab(
    "org-chart-people",
    ["name", "unit"] as const,
    "name",
  );
  const unitsFor = (id: string) => [...(unitsOf.get(id) ?? [])].sort((a, b) => a.localeCompare(b));
  const unplaced = people.filter((p) => unitsFor(p.id).length === 0).length;
  const headedBy = (id: string) => [...(headsOf.get(id) ?? [])].sort((a, b) => a.localeCompare(b));
  // By unit: each unit in turn, then those in no unit. Each person is
  // listed once (so each row can be dragged): under the unit they head, or
  // else the first unit they belong to, alphabetically. A unit's head comes
  // first under it.
  const NO_UNIT = "";
  const groups: { unit: string; people: OrgPerson[] }[] = [];
  if (sort === "unit") {
    const byUnit = new Map<string, OrgPerson[]>();
    for (const p of matches) {
      const u = headedBy(p.id)[0] ?? unitsFor(p.id)[0] ?? NO_UNIT;
      byUnit.set(u, [...(byUnit.get(u) ?? []), p]);
    }
    // Units alphabetically, and those in no unit last.
    const order = [...byUnit.keys()].sort((a, b) =>
      a === NO_UNIT ? 1 : b === NO_UNIT ? -1 : a.localeCompare(b),
    );
    for (const u of order) {
      const heads = (p: OrgPerson) => (u && headedBy(p.id).includes(u) ? 0 : 1);
      // Stable sort: the list's own order (by name) stays within heads and members.
      groups.push({ unit: u, people: [...byUnit.get(u)!].sort((a, b) => heads(a) - heads(b)) });
    }
  } else {
    // By name, with the heads of units first.
    const heads = (p: OrgPerson) => (headedBy(p.id).length > 0 ? 0 : 1);
    groups.push({ unit: NO_UNIT, people: [...matches].sort((a, b) => heads(a) - heads(b)) });
  }
  return (
    <aside className="flex min-w-0 flex-col rounded-2xl border-2 border-border bg-card p-4 lg:max-h-[80vh]">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4" /> People
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {!canDrop
          ? kind === "unit"
            ? "Add a unit, then drag people onto it."
            : "Add a role, then drag someone onto it."
          : kind === "unit"
            ? "Drag someone onto a unit to add them to it."
            : "Drag someone onto a role to give it to them."}
      </p>
      {people.length > 0 && (
        <p
          className={
            "mt-2 text-xs font-medium " +
            (unplaced > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")
          }
        >
          {unplaced === 0
            ? "Everyone is in a unit."
            : unplaced === 1
              ? "1 person is not in any unit."
              : `${unplaced} people are not in any unit.`}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1 text-xs" role="group" aria-label="Sort People">
        <span className="mr-1 text-muted-foreground">Sort:</span>
        {(["name", "unit"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={sort === v}
            onClick={() => chooseSort(v)}
            className={
              "rounded-full border px-2.5 py-0.5 font-medium transition " +
              (sort === v
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {v === "name" ? "Name" : "Unit"}
          </button>
        ))}
      </div>
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
        {groups.map((g) => (
          <Fragment key={g.unit || "none"}>
            {sort === "unit" && (
              <li
                className={
                  "sticky top-0 z-10 flex items-center gap-1 bg-card px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide " +
                  (g.unit ? "text-primary" : "text-amber-700 dark:text-amber-400")
                }
              >
                {g.unit ? <Building2 className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{g.unit || "Not in any unit"}</span>
                <span className="font-normal text-muted-foreground">({g.people.length})</span>
              </li>
            )}
            {g.people.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                places={placesOf.get(p.id) ?? []}
                inUnit={unitsFor(p.id).length > 0}
              />
            ))}
          </Fragment>
        ))}
      </ul>
    </aside>
  );
}

function PersonRow({
  person,
  places,
  inUnit,
}: {
  person: OrgPerson;
  places: string[];
  /** Heads or belongs to a unit in this chart. */
  inUnit: boolean;
}) {
  const drag = useDraggable({
    id: `person:${person.id}`,
    data: { type: "person", personId: person.id, label: person.name } satisfies DragData,
  });
  return (
    <li
      ref={drag.setNodeRef}
      {...drag.listeners}
      className={
        "flex cursor-grab touch-manipulation select-none items-start gap-1.5 rounded-lg border px-2 py-1.5 hover:bg-muted active:cursor-grabbing " +
        (inUnit
          ? "border-transparent hover:border-border "
          : "border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10 ") +
        (drag.isDragging ? "opacity-40" : "")
      }
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        {!inUnit && (
          <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-200/70 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-500/25 dark:text-amber-200">
            Not in any unit
          </span>
        )}
        {places.length > 0 && (
          <span className="block truncate text-xs text-muted-foreground">{places.join(", ")}</span>
        )}
      </span>
    </li>
  );
}

/**
 * Above the chart: a hint, which turns into "drop here to put it at the top"
 * while a box is dragged. It keeps its size, so the chart doesn't shift under
 * the pointer when a drag starts.
 */
function TopZone({ active, kind }: { active: boolean; kind: NodeKind }) {
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
            ? "border-primary bg-primary/20 font-semibold text-foreground"
            : "border-primary/60 bg-primary/5 font-medium text-primary")
      }
    >
      {active
        ? "Drop here to put it at the top of the chart"
        : kind === "unit"
          ? "Drag units to rearrange them, and people from the People list onto units."
          : "Drag roles to change who reports to whom, and people from the People list onto roles."}
    </div>
  );
}

/** What dropping `d` on this part of box `n` does, in a few words. */
function dropOutcome(
  d: DragData,
  n: ChartNode,
  where: "before" | "after" | "into",
  view: View,
): string {
  const unit = n.kind === "unit";
  if (d.type === "box") {
    if (where === "before") return `Place left of ${n.role}`;
    if (where === "after") return `Place right of ${n.role}`;
    return unit ? `Make it part of ${n.role}` : `Report to ${n.role}`;
  }
  if (d.type === "person") {
    if (unit) {
      return view.membersOf(n.id).some((m) => m.person_id === d.personId)
        ? `Already in ${n.role}`
        : `Add ${d.label} to ${n.role}`;
    }
    const holder = view.nameOf(n);
    if (n.person_id === d.personId) return `Already ${n.role}`;
    return holder ? `Replace ${holder} as ${n.role}` : `Make ${d.label} ${n.role}`;
  }
  return `Move ${d.label} to ${n.role}`;
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
  const implied = view.implied.get(parentKey) ?? [];
  if (list.length === 0 && implied.length === 0) return null;
  return (
    <ul>
      {list.map((n) => (
        <li key={n.id}>
          <BoxCard n={n} view={view} />
          <Branch parentKey={n.id} view={view} />
        </li>
      ))}
      {implied.map((l) => (
        // org-implied: its connector is dashed, like the box (styles.css).
        <li key={l.key} className="org-implied">
          <ImpliedCard line={l} onOpen={() => view.onOpenImplied(l)} />
          <Branch parentKey={l.key} view={view} />
        </li>
      ))}
    </ul>
  );
}

/** Someone shown on Reporting lines because of the units: dashed, and not draggable. */
function ImpliedCard({ line, onOpen }: { line: ImpliedLine; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={
        line.managerName
          ? `${line.name} reports to ${line.managerName}, from the Units tab`
          : `${line.name} heads ${line.unitName}, from the Units tab`
      }
      className="block w-44 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2.5 text-center transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="block text-sm font-semibold leading-snug">{line.title}</span>
      <span className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {line.personId ? (
          <Link2 className="h-3 w-3 shrink-0 text-primary" />
        ) : (
          <UserRound className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{line.name}</span>
      </span>
    </button>
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
  // While something is dragged: every box it can land on is outlined and the
  // rest fade; the dragged chip itself says what a drop would do.
  const self = drag.isDragging;
  const canLand = !!dragging && !self && !view.blocked.has(n.id);
  const faded = !!dragging && !self && !canLand;

  return (
    <div
      ref={drag.setNodeRef}
      className={"relative transition-opacity " + (self ? "opacity-40" : faded ? "opacity-35" : "")}
    >
      <DropZones node={n} disabled={view.blocked.has(n.id)} />
      {beside && (
        <span
          aria-hidden
          className={
            "pointer-events-none absolute -inset-y-1 z-20 w-1.5 rounded-full bg-primary ring-4 ring-primary/25 " +
            (beside === "before" ? "-left-3" : "-right-3")
          }
        />
      )}
      {dragging?.type === "box" && overHere && (
        // The three places a box can go: left of it, inside it, right of it.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[1fr_2fr_1fr] overflow-hidden rounded-xl"
        >
          {(["before", "into", "after"] as const).map((w) => (
            <span
              key={w}
              className={
                "border-dashed border-primary/40 first:border-r-2 last:border-l-2 " +
                (overHere === w ? "bg-primary/20" : "")
              }
            />
          ))}
        </div>
      )}
      <div
        className={
          "rounded-xl border-2 text-center shadow-sm transition " +
          (unit ? "w-52 border-primary/50 bg-primary/10" : "w-44 border-border bg-background") +
          (asChild
            ? " ring-2 ring-primary ring-offset-2 ring-offset-card"
            : canLand
              ? " outline-dashed outline-2 outline-offset-4 outline-primary/60"
              : view.highlight.has(n.id)
                ? " outline-dotted outline-[3px] outline-offset-4 outline-primary"
                : "")
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
          {!unit && (
            <span
              className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"
              title={n.person_id ? "From People" : undefined}
            >
              {n.person_id ? (
                <Link2 className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <UserRound className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{view.nameOf(n) || "Open"}</span>
            </span>
          )}
          {!unit && view.unitName(n) && (
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{view.unitName(n)}</span>
            </span>
          )}
          {!unit && view.alsoOf(n.id).length > 0 && (
            // Pointing at it lights up those roles with a dotted outline.
            <span
              className="mt-1.5 block rounded-lg border border-dotted border-primary/60 px-1.5 py-0.5 text-[11px] leading-snug text-muted-foreground"
              onMouseEnter={() => view.onHighlight(view.alsoOf(n.id).map((r) => r.id))}
              onMouseLeave={() => view.onHighlight([])}
              title={`Also reports to ${view
                .alsoOf(n.id)
                .map((r) => r.role + (view.nameOf(r) ? ` (${view.nameOf(r)})` : ""))
                .join(", ")}`}
            >
              <span className="font-medium text-foreground">Also reports to:</span>{" "}
              {view
                .alsoOf(n.id)
                .map((r) => r.role)
                .join(", ")}
            </span>
          )}
          {unit && view.roleCount(n.id) > 0 && (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {view.roleCount(n.id)} {view.roleCount(n.id) === 1 ? "role" : "roles"} in Reporting
              lines
            </span>
          )}
          {n.note && (
            <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground/80">
              {n.note}
            </span>
          )}
        </button>
        {unit && view.nameOf(n) && (
          // Outside the box's own button, so the head can be removed from here.
          <div
            className="-mt-1.5 flex items-center justify-center gap-1 px-3 pb-2 text-xs text-muted-foreground"
            title={n.person_id ? "From People" : undefined}
          >
            {n.person_id ? (
              <Link2 className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <UserRound className="h-3 w-3 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => view.onOpen(n)}
              className="truncate hover:text-foreground"
            >
              Head: {view.nameOf(n)}
            </button>
            <RemoveButton
              label={`Remove ${view.nameOf(n)} as head of ${n.role}`}
              onClick={() => view.onRemoveHead(n)}
            />
          </div>
        )}
        {unit && (
          <div className="border-t border-primary/30 px-2 pb-4 pt-1.5">
            {shown.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet</p>
            ) : (
              // Not ul/li: the chart's tree lines are drawn on every list inside it.
              <div
                role="list"
                className="flex flex-wrap justify-center gap-1"
                aria-label={`Members of ${n.role}`}
              >
                {shown.slice(0, MEMBERS_SHOWN).map((m) => (
                  <MemberChip
                    key={m.id}
                    m={m}
                    name={view.memberName(m)}
                    unitName={n.role}
                    onOpen={() => view.onOpen(n)}
                    onRemove={() => view.onRemoveMember(m, n)}
                  />
                ))}
                {shown.length > MEMBERS_SHOWN && (
                  <div role="listitem">
                    <button
                      type="button"
                      onClick={() => view.onOpen(n)}
                      className="rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background"
                    >
                      +{shown.length - MEMBERS_SHOWN} more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => view.onAdd(n)}
        aria-label={unit ? `Add a unit within ${n.role}` : `Add a role reporting to ${n.role}`}
        title={unit ? "Add a unit within it" : "Add a role reporting to it"}
        className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** On an empty chart: fill it with a copy of another chart (units, roles and members). */
function CopyFromChart({
  charts,
  busy,
  onCopy,
}: {
  charts: OrgChart[];
  busy: boolean;
  onCopy: (from: OrgChart) => void;
}) {
  const [fromId, setFromId] = useState<string>("");
  const from = charts.find((c) => c.id === fromId) ?? null;
  return (
    <div className="mx-auto mt-6 max-w-sm border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Or start from a copy of another chart:</p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger className="w-48" aria-label="Chart to copy">
            <SelectValue placeholder="Pick a chart" />
          </SelectTrigger>
          <SelectContent>
            {charts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={!from || busy} onClick={() => from && onCopy(from)}>
          <Copy className="mr-1 h-4 w-4" /> Copy here
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Copies its units, members and reporting lines.
      </p>
    </div>
  );
}

/** A small ×: takes someone off the chart without opening the box. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="shrink-0 rounded-full p-0.5 text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

/** Someone in a unit's box; drag them onto another unit to move them there. */
function MemberChip({
  m,
  name,
  unitName,
  onOpen,
  onRemove,
}: {
  m: ChartMember;
  name: string;
  unitName: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
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
    <div
      role="listitem"
      ref={drag.setNodeRef}
      className={
        "flex max-w-44 items-center rounded-full border border-border bg-background pr-0.5 text-xs" +
        (drag.isDragging ? " opacity-40" : "")
      }
    >
      <button
        type="button"
        {...drag.listeners}
        onClick={onOpen}
        title={`${name}: drag onto another unit to move`}
        className="flex min-w-0 cursor-grab touch-manipulation items-center gap-1 rounded-full py-0.5 pl-2 pr-0.5 active:cursor-grabbing"
      >
        {m.person_id && <Link2 className="h-3 w-3 shrink-0 text-primary" />}
        <span className="truncate">{name}</span>
      </button>
      <RemoveButton label={`Remove ${name} from ${unitName}`} onClick={onRemove} />
    </div>
  );
}
