import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Coins,
  Copy,
  Eye,
  GitCompare,
  GripVertical,
  Link2,
  List,
  Maximize2,
  Minus,
  Network,
  Pencil,
  Percent,
  Printer,
  Search,
  Plus,
  Trash2,
  UserRound,
  Users,
  Wand2,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { formatDate } from "@/lib/utils";
import {
  addSalaryEntriesBulk,
  aggregateSalaryCosts,
  currentSalaryOf,
  deleteSalaryEntriesBulk,
  fetchOrgSalaries,
  formatCostMoney,
  formatCostTotals,
  formatSignedCostTotals,
  formatSignedMoney,
  formatSignedPct,
  groupSalariesByUser,
  hoursPerYearFromWorkSettings,
  orgSalariesKey,
  salaryToMonthlyAnnual,
  subtractCurrencyTotals,
  todayIsoDate,
  type CostSummary,
  type CurrencyCost,
  type SalaryEntry,
} from "@/lib/salaries";
import { BulkSalaryAdjustDialog } from "@/components/BulkSalaryAdjustDialog";
import { TeamsPanel } from "@/components/teams/TeamsPanel";
import { SupervisorsPanel } from "@/components/supervisors/SupervisorsPanel";
import {
  addSalaryPlans,
  chartSalaryPlansKey,
  copySalaryPlans,
  deleteSalaryPlans,
  fetchSalaryPlans,
  makeSalaryPlansReal,
} from "@/lib/chartSalaryPlans";
import {
  buildBulkSalaryNote,
  computeBulkSalaryPlan,
  createInitialBulkDraft,
  type BulkSalaryDraft,
  type BulkSalaryPlan,
  type BulkSalaryScope,
} from "@/lib/bulkSalaryPlan";
import { fetchWorkSettings, workSettingsKey } from "@/lib/workVacations";
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
  CHART_STATUS_LABELS,
  setActiveChart,
  setChartStatus,
  type ChartStatus,
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
  isImpliedKey,
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
import {
  compareCharts,
  impliedInCreationOrder,
  reportingConflicts,
  spanCounts,
  type ChartChange,
} from "@/lib/orgChartInsights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  head: () => ({ meta: [{ title: "Org chart & teams — Talentloom" }] }),
  validateSearch: (search: Record<string, unknown>): { section?: "teams" } => ({
    section: search["section"] === "teams" ? "teams" : undefined,
  }),
  component: OrgChartPage,
});

const TOP = "__top__";
/** How many of a unit's members its box lists before "+N more". */
const MEMBERS_SHOWN = 6;

/**
 * Whether the Reporting lines tab shows. Set to false to hide it: then only
 * Units shows and nothing on the page mentions roles, while roles, dotted
 * lines and the code stay as they are.
 */
const REPORTING_LINES_ENABLED = false;

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
  /** Where a role disagrees with the Units tab (Reporting lines only). */
  conflictsOf: (id: string) => string[];
  /** Direct reports and everyone below a role or implied line. */
  spanOf: (key: string) => { direct: number; total: number } | undefined;
  /** Branches folded away, by the key of the box above them. */
  isCollapsed: (key: string) => boolean;
  onToggle: (key: string) => void;
  /** Boxes matching the Find field, and the boxes above them. */
  found: Set<string>;
  foundChain: Set<string>;
  /** Mark roles nobody holds. */
  markOpen: boolean;
  /** Scrolls to a box and lights it up for a moment. */
  onJump: (key: string) => void;
  flash: string | null;
  /** Whether salary costs are shown on the chart. */
  showCosts: boolean;
  /** Monthly & annual salary for one employee (by People user_id), or null if unset. */
  personCost: (personId: string | null) => CurrencyCost | null;
  /** Signed monthly/annual delta for one employee during live salary preview, or null. */
  personPreviewDelta: (personId: string | null) => CurrencyCost | null;
  /** Direct and subtree-rolled-up salary costs for a unit (plus optional live preview deltas). */
  unitCost: (unitId: string) => {
    direct: CostSummary;
    total: CostSummary;
    hasSubUnits: boolean;
    directDelta: CurrencyCost[];
    totalDelta: CurrencyCost[];
  };
};

/** Many direct reports: shown in amber on the role. */
const WIDE_SPAN = 10;

const boxDomId = (key: string) => `org-box-${key}`;

function OrgChartPage() {
  const qc = useQueryClient();
  const { orgId, orgs, can } = useOrg();
  const canEditSalaries = can("change_titles");
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "your organisation";
  const [remembered, remember] = useRememberedChart(orgId);

  const charts = useQuery({
    queryKey: chartsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchCharts(orgId!),
  });
  const list = charts.data ?? [];
  // The chart last opened here, else the organisation's active one.
  const chart: OrgChart | null =
    list.find((c) => c.id === remembered) ??
    list.find((c) => c.status === "active") ??
    (list.length > 0 ? list[0]! : null);
  const activeChart = list.find((c) => c.status === "active") ?? null;
  /** Only the active chart is today's organisation; pay changed on another is a plan. */
  const planning = !!chart && chart.status !== "active";

  const nodesQuery = useQuery({
    queryKey: chartNodesKey(chart?.id ?? null),
    enabled: !!chart,
    queryFn: () => fetchNodes(chart!.id),
  });
  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data]);

  // Two trees per chart, one per tab: units, and roles with their reporting lines.
  const [savedTab, chooseTab] = useRememberedTab(
    "org-chart",
    ["units", "reporting"] as const,
    "units",
  );
  const tab = REPORTING_LINES_ENABLED ? savedTab : "units";
  // Teams (organisation-wide, not per chart) is a tab of its own beside the
  // chart's tabs; the chart picker and the chart show only on those.
  // Supervisors (organisation-wide too) is another tab beside them.
  const [section, chooseSection] = useRememberedTab(
    "org-chart-section",
    ["chart", "teams", "supervisors"] as const,
    "chart",
  );
  const linkedSection = Route.useSearch().section;
  const navigateHere = useNavigate({ from: "/org-chart" });
  useEffect(() => {
    if (linkedSection === "teams") chooseSection("teams");
  }, [linkedSection, chooseSection]);
  const onTeams = section === "teams";
  const onSupervisors = section === "supervisors";
  const kind: NodeKind = tab === "units" ? "unit" : "role";
  const units = useMemo(() => nodes.filter((n) => n.kind === "unit"), [nodes]);
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
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
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
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const personById = new Map(people.map((p) => [p.id, p]));

  const salariesQuery = useQuery({
    queryKey: orgSalariesKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgSalaries(orgId!),
  });
  const workSettingsQuery = useQuery({
    queryKey: workSettingsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchWorkSettings(orgId!),
  });
  const hoursPerYear = hoursPerYearFromWorkSettings(workSettingsQuery.data);
  const plansQuery = useQuery({
    queryKey: chartSalaryPlansKey(chart?.id ?? null),
    enabled: planning,
    queryFn: () => fetchSalaryPlans(chart!.id),
  });
  const plans = useMemo(
    () => (planning ? (plansQuery.data ?? []) : []),
    [planning, plansQuery.data],
  );
  // A chart that isn't active shows pay as it will be once its plans take effect.
  const payAsOf = useMemo(
    () =>
      plans.reduce(
        (latest, p) => (p.effective_date > latest ? p.effective_date : latest),
        todayIsoDate(),
      ),
    [plans],
  );
  const salariesByUser = useMemo(
    () => groupSalariesByUser([...(salariesQuery.data ?? []), ...plans]),
    [salariesQuery.data, plans],
  );
  const showSalariesKey = orgId ? `talentloom:org-chart:show-salaries:${orgId}` : null;
  const [showCosts, setShowCosts] = useState(true);
  useEffect(() => {
    if (!showSalariesKey) return;
    try {
      const raw = window.localStorage.getItem(showSalariesKey);
      if (raw === "false") setShowCosts(false);
      else if (raw === "true") setShowCosts(true);
    } catch {
      /* ignore */
    }
  }, [showSalariesKey]);
  const setShowSalaries = (next: boolean) => {
    setShowCosts(next);
    try {
      if (showSalariesKey) window.localStorage.setItem(showSalariesKey, String(next));
    } catch {
      /* ignore */
    }
  };

  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<BulkSalaryDraft>(() => createInitialBulkDraft());
  const [bulkPreviewActive, setBulkPreviewActive] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    setBulkDialogOpen(false);
    setBulkPreviewActive(false);
    setBulkDraft(createInitialBulkDraft());
  }, [orgId]);

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
  for (const n of nodes) {
    if (n.kind === "unit") addPlace(n.person_id, `Head of ${n.role}`);
    else if (REPORTING_LINES_ENABLED) addPlace(n.person_id, n.role);
  }
  for (const m of members) addPlace(m.person_id, nodes.find((n) => n.id === m.node_id)?.role ?? "");

  /** The units each person from People heads or belongs to, by name. */
  const unitsOf = useMemo(() => {
    const map = new Map<string, string[]>();
    const addUnit = (personId: string | null, unit: string | undefined) => {
      if (!personId || !unit) return;
      const list = map.get(personId) ?? [];
      if (!list.includes(unit)) map.set(personId, [...list, unit]);
    };
    for (const u of nodes) if (u.kind === "unit") addUnit(u.person_id, u.role);
    for (const m of members) addUnit(m.person_id, nodes.find((n) => n.id === m.node_id)?.role);
    return map;
  }, [nodes, members]);

  /** The units each person from People heads, by name. */
  const headsOf = new Map<string, string[]>();
  for (const u of nodes)
    if (u.kind === "unit" && u.person_id)
      headsOf.set(u.person_id, [...(headsOf.get(u.person_id) ?? []), u.role]);

  const bulkPlan = useMemo(
    () =>
      computeBulkSalaryPlan({
        draft: bulkDraft,
        people,
        units,
        members,
        salariesByUser,
        unitsOf,
        hoursPerYear,
        today: payAsOf,
      }),
    [bulkDraft, people, units, members, salariesByUser, unitsOf, hoursPerYear, payAsOf],
  );

  const isLivePreview =
    bulkPreviewActive &&
    bulkPlan.signedPct !== null &&
    !bulkPlan.pctError &&
    bulkPlan.selectedRows.length > 0;

  const { effectiveSalariesByUser, previewDeltaByUser } = useMemo(() => {
    if (!isLivePreview) {
      return {
        effectiveSalariesByUser: salariesByUser,
        previewDeltaByUser: new Map<string, CurrencyCost>(),
      };
    }
    const nextMap = new Map<string, SalaryEntry[]>(salariesByUser);
    const deltaMap = new Map<string, CurrencyCost>();
    const today = payAsOf;
    for (const row of bulkPlan.selectedRows) {
      const virtualEntry: SalaryEntry = {
        ...row.current,
        id: `preview:${row.userId}`,
        amount: row.newAmount,
        effective_date: today,
        created_at: "9999-12-31T23:59:59.999Z",
      };
      nextMap.set(row.userId, [virtualEntry, ...(salariesByUser.get(row.userId) ?? [])]);
      const baseCost = salaryToMonthlyAnnual(row.current, hoursPerYear);
      const nextCost = salaryToMonthlyAnnual(virtualEntry, hoursPerYear);
      deltaMap.set(row.userId, {
        currency: baseCost.currency,
        monthly: Math.round((nextCost.monthly - baseCost.monthly) * 100) / 100,
        annual: Math.round((nextCost.annual - baseCost.annual) * 100) / 100,
      });
    }
    return { effectiveSalariesByUser: nextMap, previewDeltaByUser: deltaMap };
  }, [isLivePreview, salariesByUser, bulkPlan.selectedRows, hoursPerYear, payAsOf]);

  const personCost = (personId: string | null): CurrencyCost | null => {
    if (!personId) return null;
    const cur = currentSalaryOf(effectiveSalariesByUser.get(personId) ?? [], payAsOf);
    return cur ? salaryToMonthlyAnnual(cur.entry, hoursPerYear) : null;
  };

  const personPreviewDelta = (personId: string | null): CurrencyCost | null =>
    personId ? (previewDeltaByUser.get(personId) ?? null) : null;

  const costPersonRef = (personId: string | null, name: string | null) => {
    if (personId) return { key: `p:${personId}`, personId };
    const clean = (name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    return clean ? { key: `n:${clean}`, personId: null } : null;
  };

  /** Direct people in a unit (head + members). */
  const directPeopleInUnit = (u: ChartNode) => {
    const refs: { key: string; personId: string | null }[] = [];
    const head = costPersonRef(u.person_id, nameOf(u));
    if (head) refs.push(head);
    for (const m of membersOf(u.id)) {
      const ref = costPersonRef(m.person_id, memberName(m));
      if (ref) refs.push(ref);
    }
    return refs;
  };

  const unitCostMap = useMemo(() => {
    const out = new Map<
      string,
      {
        direct: CostSummary;
        total: CostSummary;
        hasSubUnits: boolean;
        directDelta: CurrencyCost[];
        totalDelta: CurrencyCost[];
      }
    >();
    for (const u of units) {
      const directRefs = directPeopleInUnit(u);
      const subIds = subtreeIds(units, u.id);
      const subRefs: { key: string; personId: string | null }[] = [];
      for (const sid of subIds) {
        const subUnit = unitById.get(sid);
        if (subUnit) subRefs.push(...directPeopleInUnit(subUnit));
      }
      const direct = aggregateSalaryCosts(
        directRefs,
        effectiveSalariesByUser,
        hoursPerYear,
        payAsOf,
      );
      const total = aggregateSalaryCosts(subRefs, effectiveSalariesByUser, hoursPerYear, payAsOf);
      const directDelta = isLivePreview
        ? subtractCurrencyTotals(
            direct.totals,
            aggregateSalaryCosts(directRefs, salariesByUser, hoursPerYear, payAsOf).totals,
          )
        : [];
      const totalDelta = isLivePreview
        ? subtractCurrencyTotals(
            total.totals,
            aggregateSalaryCosts(subRefs, salariesByUser, hoursPerYear, payAsOf).totals,
          )
        : [];
      out.set(u.id, {
        direct,
        total,
        hasSubUnits: (unitKids.get(u.id)?.length ?? 0) > 0,
        directDelta,
        totalDelta,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    units,
    members,
    salariesByUser,
    effectiveSalariesByUser,
    isLivePreview,
    hoursPerYear,
    people,
    payAsOf,
  ]);

  const emptyCost: CostSummary = { totals: [], peopleCount: 0, pricedCount: 0 };
  const unitCost = (unitId: string) =>
    unitCostMap.get(unitId) ?? {
      direct: emptyCost,
      total: emptyCost,
      hasSubUnits: false,
      directDelta: [],
      totalDelta: [],
    };

  /** Whole company total: every unique person in the organisation's People list. */
  const { companyCost, companyCostDelta } = useMemo(() => {
    const refs = people.map((p) => ({ key: `p:${p.id}`, personId: p.id }));
    const next = aggregateSalaryCosts(refs, effectiveSalariesByUser, hoursPerYear, payAsOf);
    const delta = isLivePreview
      ? subtractCurrencyTotals(
          next.totals,
          aggregateSalaryCosts(refs, salariesByUser, hoursPerYear, payAsOf).totals,
        )
      : [];
    return { companyCost: next, companyCostDelta: delta };
  }, [people, salariesByUser, effectiveSalariesByUser, isLivePreview, hoursPerYear, payAsOf]);

  /**
   * Today's real salary costs for everyone in the organisation, without any
   * chart's plans: what a past or planned chart is compared with.
   */
  const todayCost = useMemo(
    () =>
      aggregateSalaryCosts(
        people.map((p) => ({ key: `p:${p.id}`, personId: p.id })),
        groupSalariesByUser(salariesQuery.data ?? []),
        hoursPerYear,
      ),
    [people, salariesQuery.data, hoursPerYear],
  );

  /** Total of unique people placed in this chart's units (no double-counting across units). */
  const { chartCost, chartCostDelta, hasMultiUnitPeople } = useMemo(() => {
    const refs: { key: string; personId: string | null }[] = [];
    const seen = new Set<string>();
    let multi = false;
    for (const u of units) {
      const unitRefs = directPeopleInUnit(u);
      const inThisUnit = new Set<string>();
      for (const r of unitRefs) {
        if (inThisUnit.has(r.key)) continue;
        inThisUnit.add(r.key);
        if (seen.has(r.key)) multi = true;
        seen.add(r.key);
        refs.push(r);
      }
    }
    const next = aggregateSalaryCosts(refs, effectiveSalariesByUser, hoursPerYear, payAsOf);
    const delta = isLivePreview
      ? subtractCurrencyTotals(
          next.totals,
          aggregateSalaryCosts(refs, salariesByUser, hoursPerYear, payAsOf).totals,
        )
      : [];
    return {
      chartCost: next,
      chartCostDelta: delta,
      hasMultiUnitPeople: multi,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    units,
    members,
    salariesByUser,
    effectiveSalariesByUser,
    isLivePreview,
    hoursPerYear,
    people,
    payAsOf,
  ]);

  const openBulkAdjust = (scope?: BulkSalaryScope) => {
    if (!canEditSalaries) return;
    if (scope) {
      setBulkDraft((prev) => ({
        ...(bulkPreviewActive ? prev : createInitialBulkDraft(scope)),
        scope,
        excludedIds: [],
      }));
    } else if (!bulkPreviewActive) {
      setBulkDraft(createInitialBulkDraft({ kind: "company" }));
    }
    setBulkDialogOpen(true);
  };

  const previewBulkOnChart = () => {
    if (bulkPlan.signedPct === null || bulkPlan.pctError || bulkPlan.selectedRows.length === 0) {
      return;
    }
    if (!showCosts) setShowSalaries(true);
    setBulkPreviewActive(true);
    setBulkDialogOpen(false);
  };

  const applyBulkAdjustment = async () => {
    if (!orgId || !canEditSalaries) return;
    if (bulkPlan.signedPct === null || bulkPlan.pctError || bulkPlan.selectedRows.length === 0) {
      toast.error("Select at least one person and enter a valid percentage.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulkDraft.effectiveDate)) {
      toast.error("Choose a valid effective date.");
      return;
    }
    const note = buildBulkSalaryNote(bulkDraft, bulkPlan);
    const count = bulkPlan.selectedRows.length;
    const pctLabel = formatSignedPct(bulkPlan.signedPct);
    const effDate = bulkDraft.effectiveDate;
    setBulkSaving(true);
    if (planning && chart) {
      // Not today's organisation: keep the change as a plan on this chart only.
      const c = chart;
      try {
        const planned = await addSalaryPlans(
          orgId,
          c.id,
          bulkPlan.selectedRows.map((row) => ({
            userId: row.userId,
            input: {
              amount: row.newAmount,
              currency: row.current.currency,
              period: row.current.period,
              effective_date: effDate,
              note,
            },
          })),
        );
        await qc.invalidateQueries({ queryKey: chartSalaryPlansKey(c.id) });
        setBulkDialogOpen(false);
        setBulkPreviewActive(false);
        toast.success(
          `Planned ${pctLabel} pay change for ${count} ${count === 1 ? "person" : "people"} on ${c.name}. Real pay is unchanged.`,
          {
            duration: 10000,
            action: {
              label: "Undo",
              onClick: () =>
                void deleteSalaryPlans(planned.map((x) => x.id))
                  .then(() => qc.invalidateQueries({ queryKey: chartSalaryPlansKey(c.id) }))
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Could not undo the plan"),
                  ),
            },
          },
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the planned pay change");
      } finally {
        setBulkSaving(false);
      }
      return;
    }
    try {
      const created = await addSalaryEntriesBulk(
        orgId,
        bulkPlan.selectedRows.map((row) => ({
          userId: row.userId,
          input: {
            amount: row.newAmount,
            currency: row.current.currency,
            period: row.current.period,
            effective_date: effDate,
            note,
          },
        })),
      );
      await qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) });
      setBulkDialogOpen(false);
      setBulkPreviewActive(false);
      const createdIds = created.map((e) => e.id).filter(Boolean);
      const scheduled = effDate > todayIsoDate();
      toast.success(
        scheduled
          ? `Scheduled ${pctLabel} salary change for ${count} ${count === 1 ? "person" : "people"} (${formatDate(effDate)})`
          : `Applied ${pctLabel} salary change to ${count} ${count === 1 ? "person" : "people"}`,
        createdIds.length > 0
          ? {
              duration: 10000,
              action: {
                label: "Undo",
                onClick: () => {
                  void deleteSalaryEntriesBulk(orgId, createdIds)
                    .then(() => qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) }))
                    .then(() => toast.success("Bulk salary adjustment undone"))
                    .catch((err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Could not undo salary adjustment",
                      ),
                    );
                },
              },
            }
          : undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply salary adjustment");
    } finally {
      setBulkSaving(false);
    }
  };

  const [busy, setBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [boxDialog, setBoxDialog] = useState<BoxDialog>(null);
  const [confirmChartDelete, setConfirmChartDelete] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmBoxDelete, setConfirmBoxDelete] = useState<ChartNode | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  /** Where the dragged item would land, for the label on the dragged chip. */
  const [dropAt, setDropAt] = useState<DropData | null>(null);
  const [impliedOpen, setImpliedOpen] = useState<ImpliedLine | null>(null);
  /** A drop can end in a click on the box under it; that click opens nothing. */
  const dragEndedAt = useRef(0);

  // Tools for big charts: folded branches (remembered per chart in this
  // browser), zoom, Find, and a list layout instead of the tree.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const collapsedKey = chart ? `talentloom:org-chart:collapsed:${chart.id}` : null;
  useEffect(() => {
    if (!collapsedKey) return;
    try {
      const raw = window.localStorage.getItem(collapsedKey);
      setCollapsed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [collapsedKey]);
  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try {
      if (collapsedKey) window.localStorage.setItem(collapsedKey, JSON.stringify([...next]));
    } catch {
      /* not remembered, still works */
    }
  };
  const [zoom, setZoom] = useState(1);
  const [findText, setFindText] = useState("");
  const [markOpen, setMarkOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [layout, chooseLayout] = useRememberedTab(
    "org-chart-layout",
    ["tree", "list"] as const,
    "tree",
  );
  const [confirmMakeAll, setConfirmMakeAll] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareWith, setCompareWith] = useState("");
  const compareNodes = useQuery({
    queryKey: chartNodesKey(compareWith || null),
    enabled: compareOpen && !!compareWith,
    queryFn: () => fetchNodes(compareWith),
  });
  const compareMembers = useQuery({
    queryKey: chartMembersKey(compareWith || null),
    enabled: compareOpen && !!compareWith,
    queryFn: () => fetchMembers(compareWith),
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  /** The first box Find matches, for scrolling to it once typing pauses. */
  const firstFound = useRef<string | null>(null);
  useEffect(() => {
    if (!findText.trim()) return;
    const t = setTimeout(() => {
      const key = firstFound.current;
      if (key)
        document
          .getElementById(boxDomId(key))
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 350);
    return () => clearTimeout(t);
  }, [findText]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

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
        else if (nameDialog.mode === "copy" && chart) {
          const copy = await copyChart(orgId, chart.id, name);
          // A copy is a plan; it keeps the original's planned pay.
          if (chart.status !== "active") await copySalaryPlans(orgId, chart.id, copy.id);
          remember(copy.id);
        } else
          remember(
            (
              await createChart(
                orgId,
                name,
                list.some((c) => c.status === "active") ? "planned" : "active",
              )
            ).id,
          );
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
  const allImplied = impliedReporting(nodes, members, nameOf, memberName, dotted);
  const impliedLines = kind === "role" ? allImplied : [];
  const implied = new Map<string, ImpliedLine[]>();
  for (const l of impliedLines) implied.set(l.parent, [...(implied.get(l.parent) ?? []), l]);
  const impliedByParent = new Map<string, ImpliedLine[]>();
  for (const l of allImplied)
    impliedByParent.set(l.parent, [...(impliedByParent.get(l.parent) ?? []), l]);
  const impliedByKey = new Map(allImplied.map((l) => [l.key, l]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Notes where Reporting lines and Units disagree, team sizes, open roles.
  const conflicts = reportingConflicts(nodes, members, nameOf, memberName);
  const conflictCount = [...conflicts.values()].reduce((sum, l) => sum + l.length, 0);
  const keysBelow = (key: string) => [
    ...(roleKids.get(key) ?? []).map((r) => r.id),
    ...(impliedByParent.get(key) ?? []).map((l) => l.key),
  ];
  const spans = spanCounts(keysBelow(""), keysBelow);
  const openRoles = roles.filter((r) => !nameOf(r));

  /** The boxes above a box or implied line, nearest first. */
  const ancestorsOf = (key: string) => {
    const out: string[] = [];
    let cur: string | null = key;
    for (let i = 0; cur && i < 1000; i++) {
      const n = nodeById.get(cur);
      const up: string | null = n ? n.parent_id : impliedByKey.get(cur)?.parent || null;
      if (!up) break;
      out.push(up);
      cur = up;
    }
    return out;
  };

  // Find: boxes on this tab whose name, holder or members hold every word typed.
  const findWords = findText.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesFind = (texts: (string | null | undefined)[]) => {
    const hay = texts.filter(Boolean).join(" ").toLowerCase();
    return findWords.every((w) => hay.includes(w));
  };
  const found = new Set<string>();
  if (findWords.length > 0) {
    for (const n of shown) {
      const texts = [
        n.role,
        nameOf(n),
        ...(n.kind === "unit" ? membersOf(n.id).map(memberName) : []),
      ];
      if (matchesFind(texts)) found.add(n.id);
    }
    for (const l of impliedLines) if (matchesFind([l.title, l.name])) found.add(l.key);
  }
  const foundChain = new Set<string>();
  for (const k of found) for (const a of ancestorsOf(k)) foundChain.add(a);
  firstFound.current = [...found][0] ?? null;

  /** Keys on this tab that have something below them, for folding everything. */
  const foldable = [
    ...shown.filter((n) => (kids.get(n.id) ?? []).length > 0).map((n) => n.id),
    ...(kind === "role"
      ? [...shown.map((n) => n.id), ...impliedLines.map((l) => l.key)].filter(
          (k) => (implied.get(k) ?? []).length > 0,
        )
      : []),
  ];

  const jumpTo = (key: string) => {
    const above = ancestorsOf(key).filter((a) => collapsed.has(a));
    if (above.length > 0) saveCollapsed(new Set([...collapsed].filter((k) => !above.includes(k))));
    if (layout === "tree" && zoom < 0.6) setZoom(1);
    setFlash(key);
    setTimeout(
      () =>
        document
          .getElementById(boxDomId(key))
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }),
      80,
    );
  };

  /** Shrinks the tree until it fits the width of the chart area. */
  const fitToWidth = () => {
    const area = scrollRef.current;
    const tree = treeRef.current;
    if (!area || !tree) return;
    const natural = tree.getBoundingClientRect().width / zoom;
    if (natural > 0) setZoom(Math.max(0.3, Math.min(1, (area.clientWidth - 8) / natural)));
  };

  /** Every implied line becomes a role of its own, reporting where it did. */
  const makeAllRoles = () => {
    if (!chart) return;
    const c = chart;
    const lines = impliedInCreationOrder(allImplied);
    void run(
      async () => {
        const created = new Map<string, string>();
        const nextPos = new Map<string, number>();
        for (const l of lines) {
          const parentId =
            l.parent === ""
              ? null
              : isImpliedKey(l.parent)
                ? (created.get(l.parent) ?? null)
                : l.parent;
          const slot = parentId ?? "";
          const pos = nextPos.get(slot) ?? nextPosition(parentId, "role");
          nextPos.set(slot, pos + 1);
          const id = await addNode(orgId, c.id, parentId, pos, {
            ...emptyFields,
            kind: "role",
            // A head's role is "Head of HR"; a member's is named after the unit.
            role: (l.isHead ? l.title : l.unitName).slice(0, MAX_ROLE),
            person_id: l.personId,
            person_name: l.name.slice(0, MAX_PERSON),
            unit_id: l.unitId,
          });
          created.set(l.key, id);
        }
      },
      `Added ${lines.length} ${lines.length === 1 ? "role" : "roles"} from the Units tab`,
    );
  };

  /** Prints just the chart (or saves it as PDF), fitted across a landscape page. */
  const printChart = () => {
    const before = zoom;
    const tree = treeRef.current;
    if (layout === "tree" && tree) {
      // About the width of a landscape A4 page at 96 dpi, inside the margins.
      const natural = tree.getBoundingClientRect().width / zoom;
      setZoom(Math.min(1, 1040 / Math.max(natural, 1)));
    }
    const page = document.createElement("style");
    page.textContent = "@page { size: landscape; margin: 10mm; }";
    document.head.appendChild(page);
    document.body.classList.add("printing-org-chart");
    const done = () => {
      document.body.classList.remove("printing-org-chart");
      page.remove();
      setZoom(before);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    // Let the zoom apply before the print preview is taken.
    setTimeout(() => window.print(), 150);
  };
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
    conflictsOf: (id) => (kind === "role" ? (conflicts.get(id) ?? []) : []),
    spanOf: (key) => (kind === "role" ? spans.get(key) : undefined),
    // Find opens the branches it found something in.
    isCollapsed: (key) => collapsed.has(key) && !foundChain.has(key),
    onToggle: (key) => {
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
    },
    found,
    foundChain,
    markOpen: markOpen && kind === "role",
    onJump: jumpTo,
    flash,
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
    showCosts,
    personCost,
    personPreviewDelta,
    unitCost,
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
        <h1 className="text-2xl font-bold">Org chart &amp; teams</h1>
        <p className="text-sm text-muted-foreground">
          {REPORTING_LINES_ENABLED ? (
            <>
              Draw how {orgName} is organised. <strong>Units</strong> shows what is part of what,
              such as Finance and Accounting, and who is in each. <strong>Reporting lines</strong>{" "}
              shows the roles and who reports to whom, which can cross units.
            </>
          ) : (
            <>
              Draw how {orgName} is organised: its units, such as Finance and Accounting, what is
              part of what, and who is in each.
            </>
          )}{" "}
          Keep as many charts as you like, for example today's and a planned one. Everyone in the
          organisation can see and edit them. <strong>Supervisors</strong> lists who supervises
          whom, and <strong>Teams</strong> the organisation's teams and who is in each.
        </p>
      </div>

      <Tabs
        value={onTeams ? "teams" : onSupervisors ? "supervisors" : tab}
        onValueChange={(v) => {
          // A link to Teams (?section=teams) has done its job once a tab is picked.
          if (linkedSection) void navigateHere({ search: {}, replace: true });
          if (v === "teams") chooseSection("teams");
          else if (v === "supervisors") chooseSection("supervisors");
          else {
            chooseSection("chart");
            chooseTab(v);
          }
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="units">
            <Building2 className="mr-1.5 h-4 w-4" /> Units{chart ? ` (${units.length})` : ""}
          </TabsTrigger>
          {REPORTING_LINES_ENABLED && (
            <TabsTrigger value="reporting">
              <Workflow className="mr-1.5 h-4 w-4" /> Reporting lines
              {chart ? ` (${roles.length + allImplied.length})` : ""}
            </TabsTrigger>
          )}
          <TabsTrigger value="supervisors">
            <Workflow className="mr-1.5 h-4 w-4" /> Supervisors
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Users className="mr-1.5 h-4 w-4" /> Teams
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {onTeams ? (
        <TeamsPanel />
      ) : onSupervisors ? (
        <SupervisorsPanel />
      ) : (
        <>
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
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        · {CHART_STATUS_LABELS[c.status]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {charts.isLoading ? "Loading…" : "No charts yet."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {chart && (
                <label
                  htmlFor="org-chart-show-salaries"
                  className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  <Switch
                    id="org-chart-show-salaries"
                    checked={showCosts}
                    onCheckedChange={setShowSalaries}
                  />
                  <span>Show salaries</span>
                </label>
              )}
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
                  {list.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!compareWith || compareWith === chart.id)
                          setCompareWith(list.find((c) => c.id !== chart.id)?.id ?? "");
                        setCompareOpen(true);
                      }}
                    >
                      <GitCompare className="mr-1 h-4 w-4" /> Compare
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={printChart}>
                    <Printer className="mr-1 h-4 w-4" /> Print / PDF
                  </Button>
                </>
              )}
            </div>
          </div>

          {chart && (
            <ChartStatusBar
              chart={chart}
              activeName={list.find((c) => c.status === "active")?.name ?? null}
              planCount={plans.length}
              canEditPay={canEditSalaries}
              busy={busy}
              onMakeActive={() => setConfirmActivate(true)}
              onMark={(status) =>
                void run(
                  () => setChartStatus(chart.id, status),
                  `Marked ${chart.name} as ${CHART_STATUS_LABELS[status].toLowerCase()}`,
                )
              }
              onDiscardPlans={() =>
                void run(async () => {
                  await deleteSalaryPlans(plans.map((p) => p.id));
                  await qc.invalidateQueries({ queryKey: chartSalaryPlansKey(chart.id) });
                }, "Discarded the planned pay changes")
              }
            />
          )}

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
                <div
                  id="org-chart-print"
                  className="min-w-0 rounded-2xl border-2 border-border bg-card p-4"
                >
                  <h2 className="mb-3 hidden text-lg font-bold print:block">
                    {chart.name} — {kind === "unit" ? "Units" : "Reporting lines"}
                  </h2>
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
                      {isLivePreview && (
                        <LiveSalaryPreviewBanner
                          draft={bulkDraft}
                          plan={bulkPlan}
                          busy={bulkSaving}
                          onEdit={() => setBulkDialogOpen(true)}
                          onDiscard={() => setBulkPreviewActive(false)}
                          onApply={() => void applyBulkAdjustment()}
                          planning={planning}
                        />
                      )}
                      {showCosts && (
                        <CompanyCostsBanner
                          orgName={orgName}
                          companyCost={companyCost}
                          companyCostDelta={companyCostDelta}
                          chartCost={chartCost}
                          chartCostDelta={chartCostDelta}
                          hasUnits={units.length > 0}
                          hasMultiUnitPeople={hasMultiUnitPeople}
                          planning={planning ? (chart?.status ?? null) : null}
                          todayCost={todayCost}
                          isLivePreview={isLivePreview}
                          canEditSalaries={canEditSalaries}
                          onOpenBulkAdjust={() => openBulkAdjust()}
                        />
                      )}
                      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
                        <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-border px-2 py-1">
                          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <input
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && firstFound.current)
                                jumpTo(firstFound.current);
                            }}
                            placeholder={
                              kind === "unit" ? "Find a unit or person" : "Find a role or person"
                            }
                            aria-label="Find in the chart"
                            className="w-full bg-transparent text-sm outline-none"
                          />
                          {findWords.length > 0 && (
                            <span
                              className="shrink-0 text-xs text-muted-foreground"
                              aria-live="polite"
                            >
                              {found.size === 0 ? "None found" : `${found.size} found`}
                            </span>
                          )}
                        </label>
                        <div
                          className="flex items-center rounded-lg border border-border"
                          role="group"
                          aria-label="Layout"
                        >
                          {(["tree", "list"] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              aria-pressed={layout === v}
                              onClick={() => chooseLayout(v)}
                              className={
                                "flex items-center gap-1 px-2 py-1 text-xs font-medium first:rounded-l-lg last:rounded-r-lg " +
                                (layout === v
                                  ? "bg-primary/15 text-foreground"
                                  : "text-muted-foreground hover:text-foreground")
                              }
                            >
                              {v === "tree" ? (
                                <Network className="h-3.5 w-3.5" />
                              ) : (
                                <List className="h-3.5 w-3.5" />
                              )}
                              {v === "tree" ? "Tree" : "List"}
                            </button>
                          ))}
                        </div>
                        {layout === "tree" && (
                          <div
                            className="flex items-center rounded-lg border border-border"
                            role="group"
                            aria-label="Zoom"
                          >
                            <button
                              type="button"
                              aria-label="Zoom out"
                              onClick={() =>
                                setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))
                              }
                              className="px-2 py-1 text-muted-foreground hover:text-foreground"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setZoom(1)}
                              title="Back to 100%"
                              className="w-12 py-1 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
                            >
                              {Math.round(zoom * 100)}%
                            </button>
                            <button
                              type="button"
                              aria-label="Zoom in"
                              onClick={() =>
                                setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))
                              }
                              className="px-2 py-1 text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={fitToWidth}
                              title="Fit the chart to the width"
                              className="flex items-center gap-1 border-l border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Maximize2 className="h-3.5 w-3.5" /> Fit
                            </button>
                          </div>
                        )}
                        {foldable.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              saveCollapsed(collapsed.size > 0 ? new Set() : new Set(foldable))
                            }
                          >
                            {collapsed.size > 0 ? (
                              <>
                                <ChevronsUpDown className="mr-1 h-3.5 w-3.5" /> Expand all
                              </>
                            ) : (
                              <>
                                <ChevronsDownUp className="mr-1 h-3.5 w-3.5" /> Collapse all
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {kind === "role" && (
                        <ReportingSummary
                          conflictCount={conflictCount}
                          conflicts={[...conflicts.entries()].flatMap(([id, notes]) => {
                            const r = nodeById.get(id);
                            return r ? [{ role: r, notes }] : [];
                          })}
                          showNotes={showNotes}
                          onShowNotes={setShowNotes}
                          openCount={openRoles.length}
                          markOpen={markOpen}
                          onMarkOpen={setMarkOpen}
                          impliedCount={impliedLines.length}
                          onMakeAll={() => setConfirmMakeAll(true)}
                          busy={busy}
                          nameOf={nameOf}
                          onJump={jumpTo}
                        />
                      )}
                      {impliedLines.length > 0 && (
                        <div className="mb-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-muted-foreground/60" />
                          Dashed: follows from the Units tab
                        </div>
                      )}
                      {layout === "tree" ? (
                        <>
                          <TopZone active={dragging?.type === "box"} kind={kind} />
                          <div
                            ref={scrollRef}
                            className="overflow-x-auto pb-4 print:overflow-visible"
                          >
                            <div ref={treeRef} className="org-tree mx-auto w-max" style={{ zoom }}>
                              <Branch parentKey="" view={view} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <OutlineList parentKey="" view={view} depth={0} />
                      )}
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
                  showCosts={showCosts}
                  personCost={personCost}
                  personPreviewDelta={personPreviewDelta}
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
        </>
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
              {boxDialog.mode === "edit" && boxDialog.fields.kind === "unit" && canEditSalaries && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      Bulk adjust unit salaries
                    </p>
                    <p className="text-[11px] text-foreground/75">
                      Apply a percentage increase or decrease to this unit (and optional sub-units).
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const targetId = boxDialog.node.id;
                      setBoxDialog(null);
                      openBulkAdjust({ kind: "unit", unitId: targetId, includeSubUnits: true });
                    }}
                  >
                    <Percent className="mr-1 h-3.5 w-3.5" /> Adjust unit %
                  </Button>
                </div>
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

      {canEditSalaries && (
        <BulkSalaryAdjustDialog
          open={bulkDialogOpen}
          draft={bulkDraft}
          plan={bulkPlan}
          unitOptions={unitOptions}
          busy={bulkSaving}
          isLivePreview={isLivePreview}
          onChangeDraft={setBulkDraft}
          onClose={() => setBulkDialogOpen(false)}
          onPreviewOnChart={previewBulkOnChart}
          onApply={() => void applyBulkAdjustment()}
          planningChart={planning ? (chart?.name ?? null) : null}
        />
      )}

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

      <AlertDialog open={confirmMakeAll} onOpenChange={setConfirmMakeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make{" "}
              {allImplied.length === 1
                ? "the dashed box a role"
                : `all ${allImplied.length} dashed boxes roles`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each one becomes a role of its own, held by the same person, in the same unit and
              reporting where the dashed line does. A head's role is called “Head of …”; a member's
              role is named after their unit, so you may want to rename those.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={makeAllRoles}>Make them roles</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare charts</DialogTitle>
            <DialogDescription>
              What changes going from the chart you pick to “{chart?.name}”. Units and roles are
              matched by their names.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={compareWith} onValueChange={setCompareWith}>
              <SelectTrigger aria-label="Chart to compare with">
                <SelectValue placeholder="Pick a chart" />
              </SelectTrigger>
              <SelectContent>
                {list
                  .filter((c) => c.id !== chart?.id)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {compareWith && (compareNodes.isLoading || compareMembers.isLoading) && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {compareWith && compareNodes.data && compareMembers.data && (
            <CompareResult
              changes={compareCharts(
                { nodes: compareNodes.data, members: compareMembers.data },
                { nodes, members },
                nameOf,
                memberName,
              )}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make “{chart?.name}” the active chart?</AlertDialogTitle>
            <AlertDialogDescription>
              The active chart is today's organisation: bonus schemes count people by its units.
              {activeChart && activeChart.id !== chart?.id
                ? ` “${activeChart.name}” becomes a past chart.`
                : ""}
              {plans.length > 0 &&
                ` This chart has ${plans.length} planned pay ${plans.length === 1 ? "change" : "changes"}: make ${plans.length === 1 ? "it" : "them"} real now, or keep ${plans.length === 1 ? "it" : "them"} as a plan only.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {plans.length > 0 && canEditSalaries && (
              <AlertDialogAction
                onClick={() => {
                  if (!chart) return;
                  const c = chart;
                  void run(async () => {
                    await setActiveChart(c.id);
                    const n = await makeSalaryPlansReal(orgId, c.id);
                    await qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) });
                    await qc.invalidateQueries({ queryKey: chartSalaryPlansKey(c.id) });
                    toast.success(
                      `${n} planned pay ${n === 1 ? "change is" : "changes are"} now real`,
                    );
                  }, `${c.name} is now the active chart`);
                }}
              >
                Make active and make pay real
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => {
                if (!chart) return;
                const c = chart;
                void run(() => setActiveChart(c.id), `${c.name} is now the active chart`);
              }}
            >
              {plans.length > 0 ? "Make active only" : "Make active"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {REPORTING_LINES_ENABLED &&
              confirmBoxDelete?.kind === "unit" &&
              view.roleCount(confirmBoxDelete.id) > 0
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
  showCosts,
  personCost,
  personPreviewDelta,
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
  showCosts: boolean;
  personCost: (personId: string | null) => CurrencyCost | null;
  personPreviewDelta: (personId: string | null) => CurrencyCost | null;
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
                cost={showCosts ? personCost(p.id) : null}
                previewDelta={showCosts ? personPreviewDelta(p.id) : null}
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
  cost,
  previewDelta,
}: {
  person: OrgPerson;
  places: string[];
  /** Heads or belongs to a unit in this chart. */
  inUnit: boolean;
  cost: CurrencyCost | null;
  previewDelta: CurrencyCost | null;
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
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        {!inUnit && (
          <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-200/70 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-500/25 dark:text-amber-200">
            Not in any unit
          </span>
        )}
        {places.length > 0 && (
          <span className="block truncate text-xs text-muted-foreground">{places.join(", ")}</span>
        )}
        {cost && (
          <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-foreground/85">
            {formatCostMoney(cost.monthly, cost.currency)}/mo ·{" "}
            {formatCostMoney(cost.annual, cost.currency)}/yr
            {previewDelta && (
              <span
                className={
                  "ml-1 font-semibold " +
                  (previewDelta.monthly >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400")
                }
              >
                ({formatSignedMoney(previewDelta.monthly, previewDelta.currency)}/mo)
              </span>
            )}
          </span>
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
        "mb-3 truncate rounded-xl border-2 border-dashed px-3 py-2 text-center text-xs transition print:hidden " +
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

/**
 * Above Reporting lines: where it disagrees with Units, how many roles are
 * open, and a way to make every dashed (implied) box a role at once.
 */
function ReportingSummary({
  conflictCount,
  conflicts,
  showNotes,
  onShowNotes,
  openCount,
  markOpen,
  onMarkOpen,
  impliedCount,
  onMakeAll,
  busy,
  nameOf,
  onJump,
}: {
  conflictCount: number;
  conflicts: { role: ChartNode; notes: string[] }[];
  showNotes: boolean;
  onShowNotes: (v: boolean) => void;
  openCount: number;
  markOpen: boolean;
  onMarkOpen: (v: boolean) => void;
  impliedCount: number;
  onMakeAll: () => void;
  busy: boolean;
  nameOf: (n: ChartNode) => string | null;
  onJump: (key: string) => void;
}) {
  if (conflictCount === 0 && openCount === 0 && impliedCount === 0) return null;
  return (
    <div className="mb-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {conflictCount > 0 && (
          <button
            type="button"
            aria-expanded={showNotes}
            onClick={() => onShowNotes(!showNotes)}
            className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {conflictCount} {conflictCount === 1 ? "difference" : "differences"} from Units
            {showNotes ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        {openCount > 0 && (
          <button
            type="button"
            aria-pressed={markOpen}
            onClick={() => onMarkOpen(!markOpen)}
            title="Outline the roles nobody holds"
            className={
              "rounded-full border px-2.5 py-1 font-semibold transition " +
              (markOpen
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {openCount} open {openCount === 1 ? "role" : "roles"}
            {markOpen ? " · shown" : ""}
          </button>
        )}
        {impliedCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={onMakeAll}
          >
            <Wand2 className="mr-1 h-3.5 w-3.5" /> Make all {impliedCount} dashed boxes roles
          </Button>
        )}
      </div>
      {showNotes && conflictCount > 0 && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
          {conflicts.map(({ role, notes }) => (
            <li key={role.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onJump(role.id)}
                className="shrink-0 font-semibold text-foreground underline-offset-2 hover:underline"
              >
                {role.role}
                {nameOf(role) ? ` (${nameOf(role)})` : ""}
              </button>
              <span className="text-muted-foreground">{notes.join(" ")}</span>
            </li>
          ))}
          <li className="pt-1 text-muted-foreground">
            Sometimes this is on purpose, for example in a matrix organisation. Change the role's
            unit or manager, or the Units tab, to line them up.
          </li>
        </ul>
      )}
    </div>
  );
}

/** The differences between two charts, units first. */
function CompareResult({ changes }: { changes: { units: ChartChange[]; roles: ChartChange[] } }) {
  const total = changes.units.length + changes.roles.length;
  if (total === 0) return <p className="text-sm text-muted-foreground">No differences.</p>;
  const label = { added: "Added", removed: "Removed", changed: "Changed" } as const;
  const tone = {
    added: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
    removed: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200",
    changed: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  } as const;
  const section = (title: string, list: ChartChange[]) =>
    list.length > 0 && (
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">
          {title} ({list.length})
        </h3>
        <ul className="space-y-1">
          {(["added", "removed", "changed"] as const).flatMap((k) =>
            list
              .filter((c) => c.kind === k)
              .map((c, i) => (
                <li key={`${k}-${i}-${c.what}`} className="flex items-start gap-2 text-sm">
                  <span
                    className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold ${tone[k]}`}
                  >
                    {label[k]}
                  </span>
                  <span>
                    <span className="font-medium">{c.what}</span>
                    {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                  </span>
                </li>
              )),
          )}
        </ul>
      </div>
    );
  return (
    <div className="space-y-4">
      {section("Units", changes.units)}
      {REPORTING_LINES_ENABLED && section("Reporting lines", changes.roles)}
    </div>
  );
}

/**
 * The chart as an indented list: easier on a phone, with a screen reader, and
 * for long charts. Editing works as in the tree; moving is done in the box's
 * own dialog (Below).
 */
function OutlineList({ parentKey, view, depth }: { parentKey: string; view: View; depth: number }) {
  const list = view.kids.get(parentKey) ?? [];
  const implied = view.implied.get(parentKey) ?? [];
  if (list.length === 0 && implied.length === 0) return null;
  const row = (
    key: string,
    content: React.ReactNode,
    hasKids: boolean,
    extra?: React.ReactNode,
  ) => {
    const folded = view.isCollapsed(key);
    return (
      <li key={key}>
        <div
          id={boxDomId(key)}
          className={
            "flex items-center gap-1.5 rounded-lg px-1.5 py-1 " +
            (view.flash === key
              ? "bg-primary/20"
              : view.found.has(key)
                ? "bg-amber-100 dark:bg-amber-500/20"
                : "hover:bg-muted")
          }
          style={{ paddingLeft: `${depth * 1.25 + 0.375}rem` }}
        >
          {hasKids ? (
            <button
              type="button"
              aria-label={folded ? "Expand" : "Collapse"}
              aria-expanded={!folded}
              onClick={() => view.onToggle(key)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {folded ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          {content}
          {extra}
        </div>
        {!folded && <OutlineList parentKey={key} view={view} depth={depth + 1} />}
      </li>
    );
  };
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "space-y-0.5"}>
      {list.map((n) => {
        const unit = n.kind === "unit";
        const name = view.nameOf(n);
        const span = view.spanOf(n.id);
        const notes = view.conflictsOf(n.id);
        const kidsHere =
          (view.kids.get(n.id) ?? []).length + (view.implied.get(n.id) ?? []).length > 0;
        const unitCosts = unit && view.showCosts ? view.unitCost(n.id) : null;
        const headCost = view.showCosts ? view.personCost(n.person_id) : null;
        const unitMembers = unit ? view.membersOf(n.id) : [];
        return row(
          n.id,
          <button
            type="button"
            onClick={() => view.onOpen(n)}
            className="flex min-w-0 flex-1 flex-col gap-0.5 text-left text-sm"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">
                {unit && <Building2 className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                {n.role}
              </span>
              <span
                className={
                  "text-xs " +
                  (!unit && !name
                    ? "font-medium text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground")
                }
              >
                {unit
                  ? [
                      name &&
                        `Head: ${name}${
                          headCost
                            ? ` (${formatCostMoney(headCost.monthly, headCost.currency)}/mo · ${formatCostMoney(headCost.annual, headCost.currency)}/yr)`
                            : ""
                        }`,
                      `${unitMembers.length} ${unitMembers.length === 1 ? "member" : "members"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : name || "Open"}
              </span>
              {!unit && headCost && (
                <span className="text-xs font-medium tabular-nums text-foreground">
                  {formatCostMoney(headCost.monthly, headCost.currency)}/mo ·{" "}
                  {formatCostMoney(headCost.annual, headCost.currency)}/yr
                </span>
              )}
              {!unit && view.unitName(n) && (
                <span className="text-xs text-primary">{view.unitName(n)}</span>
              )}
              {span && span.direct > 0 && (
                <span className="text-xs text-muted-foreground">
                  {span.direct} direct · {span.total} in total
                </span>
              )}
              {unitCosts &&
                (unitCosts.direct.totals.length > 0 || unitCosts.total.totals.length > 0) && (
                  <span className="ml-auto flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
                    {unitCosts.hasSubUnits ? (
                      <>
                        <span className="text-foreground/80">
                          Unit:{" "}
                          {unitCosts.direct.totals.length > 0
                            ? `${formatCostTotals(unitCosts.direct.totals, "monthly", true)} · ${formatCostTotals(unitCosts.direct.totals, "annual", true)}`
                            : "—"}
                        </span>
                        <span className="font-semibold text-foreground">
                          Total: {formatCostTotals(unitCosts.total.totals, "monthly", true)} ·{" "}
                          {formatCostTotals(unitCosts.total.totals, "annual", true)}
                        </span>
                        {unitCosts.totalDelta.length > 0 && (
                          <DeltaBadge deltas={unitCosts.totalDelta} compact />
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">
                          {formatCostTotals(unitCosts.direct.totals, "monthly", true)} ·{" "}
                          {formatCostTotals(unitCosts.direct.totals, "annual", true)}
                        </span>
                        {unitCosts.directDelta.length > 0 && (
                          <DeltaBadge deltas={unitCosts.directDelta} compact />
                        )}
                      </>
                    )}
                  </span>
                )}
            </span>
            {unit && view.showCosts && unitMembers.length > 0 && (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground/80">
                {unitMembers.map((m) => {
                  const mc = view.personCost(m.person_id);
                  const md = view.personPreviewDelta(m.person_id);
                  return (
                    <span key={m.id} className="tabular-nums">
                      {view.memberName(m)}
                      {mc
                        ? `: ${formatCostMoney(mc.monthly, mc.currency)}/mo · ${formatCostMoney(mc.annual, mc.currency)}/yr`
                        : ""}
                      {md && (
                        <span
                          className={
                            "ml-1 font-semibold " +
                            (md.monthly >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-rose-700 dark:text-rose-400")
                          }
                        >
                          ({formatSignedMoney(md.monthly, md.currency)}/mo)
                        </span>
                      )}
                    </span>
                  );
                })}
              </span>
            )}
          </button>,
          kidsHere,
          <>
            {notes.length > 0 && (
              <span title={notes.join("\n")} aria-label={notes.join(" ")}>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              </span>
            )}
            <button
              type="button"
              onClick={() => view.onAdd(n)}
              aria-label={
                unit ? `Add a unit within ${n.role}` : `Add a role reporting to ${n.role}`
              }
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </>,
        );
      })}
      {implied.map((l) =>
        row(
          l.key,
          <button
            type="button"
            onClick={() => view.onOpenImplied(l)}
            className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 rounded border border-dashed border-muted-foreground/40 px-1.5 text-left text-sm"
          >
            <span className="font-medium">{l.title}</span>
            <span className="text-xs text-muted-foreground">{l.name} · from Units</span>
          </button>,
          (view.implied.get(l.key) ?? []).length > 0,
        ),
      )}
    </ul>
  );
}

/** Folds or unfolds what hangs below a box; shows how many are hidden. */
function FoldButton({ k, view }: { k: string; view: View }) {
  const folded = view.isCollapsed(k);
  const hidden = view.spanOf(k)?.total;
  return (
    <button
      type="button"
      onClick={() => view.onToggle(k)}
      aria-expanded={!folded}
      aria-label={folded ? "Show the boxes below" : "Hide the boxes below"}
      title={folded ? "Show the boxes below" : "Hide the boxes below"}
      className={
        "absolute -bottom-3 left-1/2 z-10 ml-4 flex h-6 items-center gap-0.5 rounded-full border-2 px-1.5 text-[11px] font-semibold transition print:hidden " +
        (folded
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground")
      }
    >
      {folded ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {folded && hidden ? hidden : null}
    </button>
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
          {!view.isCollapsed(n.id) && <Branch parentKey={n.id} view={view} />}
        </li>
      ))}
      {implied.map((l) => (
        // org-implied: its connector is dashed, like the box (styles.css).
        <li key={l.key} className="org-implied">
          <ImpliedCard line={l} view={view} onOpen={() => view.onOpenImplied(l)} />
          {!view.isCollapsed(l.key) && <Branch parentKey={l.key} view={view} />}
        </li>
      ))}
    </ul>
  );
}

/** Someone shown on Reporting lines because of the units: dashed, and not draggable. */
function ImpliedCard({
  line,
  view,
  onOpen,
}: {
  line: ImpliedLine;
  view: View;
  onOpen: () => void;
}) {
  const hasKids = (view.implied.get(line.key) ?? []).length > 0;
  return (
    <div id={boxDomId(line.key)} className="relative">
      <button
        type="button"
        onClick={onOpen}
        title={
          line.managerName
            ? `${line.name} reports to ${line.managerName}, from the Units tab`
            : `${line.name} heads ${line.unitName}, from the Units tab`
        }
        className={
          "block w-44 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2.5 text-center transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" +
          (view.flash === line.key
            ? " ring-4 ring-primary ring-offset-2 ring-offset-card"
            : view.found.has(line.key)
              ? " ring-4 ring-amber-400 ring-offset-2 ring-offset-card"
              : view.found.size > 0 && !view.foundChain.has(line.key)
                ? " opacity-50"
                : "")
        }
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
        {(view.spanOf(line.key)?.direct ?? 0) > 0 && (
          <span
            className={
              "mt-1 block text-[11px] " +
              (view.spanOf(line.key)!.direct > WIDE_SPAN
                ? "font-semibold text-amber-700 dark:text-amber-400"
                : "text-muted-foreground")
            }
          >
            {view.spanOf(line.key)!.direct} direct · {view.spanOf(line.key)!.total} in total
          </span>
        )}
      </button>
      {hasKids && <FoldButton k={line.key} view={view} />}
    </div>
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
  const notes = view.conflictsOf(n.id);
  const span = view.spanOf(n.id);
  const open = !unit && !view.nameOf(n);
  const hasKids = (view.kids.get(n.id) ?? []).length + (view.implied.get(n.id) ?? []).length > 0;
  const finding = view.found.size > 0;
  const dimmed = finding && !view.found.has(n.id) && !view.foundChain.has(n.id);
  const headCost = view.showCosts ? view.personCost(n.person_id) : null;
  const headPreviewDelta = view.showCosts ? view.personPreviewDelta(n.person_id) : null;
  const unitCosts = unit && view.showCosts ? view.unitCost(n.id) : null;

  return (
    <div
      ref={drag.setNodeRef}
      id={boxDomId(n.id)}
      className={
        "relative transition-opacity " +
        (self ? "opacity-40" : faded ? "opacity-35" : dimmed ? "opacity-50" : "")
      }
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
          (unit
            ? (view.showCosts ? "w-64 " : "w-52 ") + "border-primary/50 bg-primary/10"
            : "w-48 border-border bg-background") +
          (asChild
            ? " ring-2 ring-primary ring-offset-2 ring-offset-card"
            : canLand
              ? " outline-dashed outline-2 outline-offset-4 outline-primary/60"
              : view.highlight.has(n.id)
                ? " outline-dotted outline-[3px] outline-offset-4 outline-primary"
                : view.flash === n.id
                  ? " ring-4 ring-primary ring-offset-2 ring-offset-card"
                  : view.found.has(n.id)
                    ? " ring-4 ring-amber-400 ring-offset-2 ring-offset-card"
                    : view.markOpen && open
                      ? " outline-dashed outline-2 outline-offset-4 outline-amber-500"
                      : "")
        }
      >
        {notes.length > 0 && (
          <span
            role="img"
            aria-label={`Differs from Units: ${notes.join(" ")}`}
            title={notes.join(" ")}
            className="absolute -right-2 -top-2 z-20 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950 shadow print:hidden"
          >
            <AlertTriangle className="h-3 w-3" />
            {notes.length > 1 ? notes.length : null}
          </span>
        )}
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
              <span
                className={
                  "truncate " +
                  (open ? "font-medium italic text-amber-700 dark:text-amber-400" : "")
                }
              >
                {view.nameOf(n) || "Open"}
              </span>
            </span>
          )}
          {!unit && headCost && (
            <span className="mt-1 block text-[11px] font-medium tabular-nums text-foreground/85">
              {formatCostMoney(headCost.monthly, headCost.currency)}/mo ·{" "}
              {formatCostMoney(headCost.annual, headCost.currency)}/yr
            </span>
          )}
          {!unit && view.unitName(n) && (
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{view.unitName(n)}</span>
            </span>
          )}
          {REPORTING_LINES_ENABLED && unit && view.roleCount(n.id) > 0 && (
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
          {span && span.direct > 0 && (
            <span
              className={
                "mt-1 block text-[11px] " +
                (span.direct > WIDE_SPAN
                  ? "font-semibold text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground")
              }
              title={span.direct > WIDE_SPAN ? "Many direct reports" : undefined}
            >
              {span.direct} direct · {span.total} in total
            </span>
          )}
        </button>
        {!unit && view.alsoOf(n.id).length > 0 && (
          // Outside the box's own button, so each name can take you to its role.
          // Pointing at it lights those roles up with a dotted outline.
          <div
            className="mx-2 -mt-1 mb-2 rounded-lg border border-dotted border-primary/60 px-1.5 py-0.5 text-[11px] leading-snug text-muted-foreground"
            onMouseEnter={() => view.onHighlight(view.alsoOf(n.id).map((r) => r.id))}
            onMouseLeave={() => view.onHighlight([])}
          >
            <span className="font-medium text-foreground">Also reports to:</span>{" "}
            {view.alsoOf(n.id).map((r, i) => (
              <Fragment key={r.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  onClick={() => view.onJump(r.id)}
                  title={`Go to ${r.role}${view.nameOf(r) ? ` (${view.nameOf(r)})` : ""}`}
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {r.role}
                </button>
              </Fragment>
            ))}
          </div>
        )}
        {unit && view.nameOf(n) && (
          // Outside the box's own button, so the head can be removed from here.
          <div className="-mt-1.5 px-3 pb-2 text-xs text-muted-foreground">
            <div
              className="flex items-center justify-center gap-1"
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
            {headCost && (
              <p className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground/85">
                {formatCostMoney(headCost.monthly, headCost.currency)}/mo ·{" "}
                {formatCostMoney(headCost.annual, headCost.currency)}/yr
                {headPreviewDelta && (
                  <span
                    className={
                      "ml-1 font-semibold " +
                      (headPreviewDelta.monthly >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400")
                    }
                  >
                    ({formatSignedMoney(headPreviewDelta.monthly, headPreviewDelta.currency)}/mo)
                  </span>
                )}
              </p>
            )}
          </div>
        )}
        {unit && (
          <div
            className={"border-t border-primary/30 px-2 pt-1.5 " + (unitCosts ? "pb-2" : "pb-4")}
          >
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
                    cost={view.showCosts ? view.personCost(m.person_id) : null}
                    previewDelta={view.showCosts ? view.personPreviewDelta(m.person_id) : null}
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
        {unitCosts && <UnitCostFooter unitCosts={unitCosts} />}
      </div>
      <button
        type="button"
        onClick={() => view.onAdd(n)}
        aria-label={unit ? `Add a unit within ${n.role}` : `Add a role reporting to ${n.role}`}
        title={unit ? "Add a unit within it" : "Add a role reporting to it"}
        className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground print:hidden"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {hasKids && <FoldButton k={n.id} view={view} />}
    </div>
  );
}

/**
 * Under the chart picker: whether this chart is today's organisation (active)
 * or a past or planned one, where pay changes are only a plan.
 */
function ChartStatusBar({
  chart,
  activeName,
  planCount,
  canEditPay,
  busy,
  onMakeActive,
  onMark,
  onDiscardPlans,
}: {
  chart: OrgChart;
  activeName: string | null;
  planCount: number;
  canEditPay: boolean;
  busy: boolean;
  onMakeActive: () => void;
  onMark: (status: "past" | "planned") => void;
  onDiscardPlans: () => void;
}) {
  if (chart.status === "active") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground print:hidden">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">
          Active
        </span>
        Today's organisation. Pay changes here are real, and bonus schemes count people by its
        units.
      </p>
    );
  }
  const past = chart.status === "past";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100">
      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold dark:bg-amber-500/30">
        {CHART_STATUS_LABELS[chart.status as ChartStatus]}
      </span>
      <span className="min-w-0 flex-1">
        {past ? "A past structure" : "A plan for a future structure"}
        {activeName ? `, not the active chart (“${activeName}”).` : ". No chart is active yet."} Pay
        changes here are only a plan and don't change anyone's real pay or bonuses.
        {planCount > 0 &&
          ` ${planCount} planned pay ${planCount === 1 ? "change" : "changes"} on this chart.`}
      </span>
      <span className="flex flex-wrap gap-2">
        {planCount > 0 && canEditPay && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onDiscardPlans}>
            Discard planned pay
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onMark(past ? "planned" : "past")}
        >
          Mark as {past ? "planned" : "past"}
        </Button>
        <Button size="sm" disabled={busy} onClick={onMakeActive}>
          Make active
        </Button>
      </span>
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
  cost,
  previewDelta,
  onOpen,
  onRemove,
}: {
  m: ChartMember;
  name: string;
  unitName: string;
  cost: CurrencyCost | null;
  previewDelta: CurrencyCost | null;
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
        "flex items-center border bg-background text-xs " +
        (previewDelta
          ? previewDelta.monthly >= 0
            ? "border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/30 "
            : "border-rose-400 bg-rose-50/50 dark:border-rose-700 dark:bg-rose-950/30 "
          : "border-border ") +
        (cost
          ? "w-full justify-between rounded-xl px-2 py-1 text-left"
          : "max-w-44 rounded-full pr-0.5") +
        (drag.isDragging ? " opacity-40" : "")
      }
    >
      <button
        type="button"
        {...drag.listeners}
        onClick={onOpen}
        title={`${name}: drag onto another unit to move`}
        className={
          "flex min-w-0 cursor-grab touch-manipulation active:cursor-grabbing " +
          (cost
            ? "flex-1 flex-col items-start gap-0.5"
            : "items-center gap-1 rounded-full py-0.5 pl-2 pr-0.5")
        }
      >
        <span className="flex max-w-full items-center gap-1">
          {m.person_id && <Link2 className="h-3 w-3 shrink-0 text-primary" />}
          <span className="truncate font-medium text-foreground">{name}</span>
        </span>
        {cost && (
          <span className="text-[11px] font-normal tabular-nums text-foreground/80">
            {formatCostMoney(cost.monthly, cost.currency)}/mo ·{" "}
            {formatCostMoney(cost.annual, cost.currency)}/yr
            {previewDelta && (
              <span
                className={
                  "ml-1 font-semibold " +
                  (previewDelta.monthly >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400")
                }
              >
                ({formatSignedMoney(previewDelta.monthly, previewDelta.currency)}/mo)
              </span>
            )}
          </span>
        )}
      </button>
      <RemoveButton label={`Remove ${name} from ${unitName}`} onClick={onRemove} />
    </div>
  );
}

/** Compact signed delta indicator shown during live bulk salary preview. */
function DeltaBadge({ deltas, compact = false }: { deltas: CurrencyCost[]; compact?: boolean }) {
  if (!deltas.length) return null;
  const positive = deltas[0]!.annual >= 0;
  return (
    <span
      className={
        "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums " +
        (compact ? "text-[10px] " : "text-xs ") +
        (positive
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
          : "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200")
      }
    >
      {formatSignedCostTotals(deltas, "monthly", true)}
      {!compact && ` · ${formatSignedCostTotals(deltas, "annual", true)}`}
    </span>
  );
}

/** Salary cost summary shown at the bottom of each Unit card (monthly & annual). */
function UnitCostFooter({
  unitCosts,
}: {
  unitCosts: {
    direct: CostSummary;
    total: CostSummary;
    hasSubUnits: boolean;
    directDelta: CurrencyCost[];
    totalDelta: CurrencyCost[];
  };
}) {
  const { direct, total, hasSubUnits, directDelta, totalDelta } = unitCosts;
  const activeSummary = hasSubUnits ? total : direct;
  const activeDelta = hasSubUnits ? totalDelta : directDelta;

  return (
    <div className="rounded-b-[10px] border-t border-primary/25 bg-background/80 px-2.5 pb-4 pt-2 text-left text-[11px]">
      {hasSubUnits ? (
        <div className="space-y-1.5">
          <div>
            <div className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              <span>This unit</span>
              {direct.peopleCount > 0 && (
                <span className="font-normal normal-case">
                  {direct.pricedCount}/{direct.peopleCount}
                </span>
              )}
            </div>
            {direct.totals.length > 0 ? (
              <>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums text-foreground/90">
                  <span className="font-semibold">
                    {formatCostTotals(direct.totals, "monthly", true)}
                  </span>
                  <span>{formatCostTotals(direct.totals, "annual", true)}</span>
                </div>
                {directDelta.length > 0 && (
                  <div className="mt-0.5">
                    <DeltaBadge deltas={directDelta} compact />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-0.5 text-foreground/65">No salaries set</p>
            )}
          </div>
          <div className="border-t border-border/70 pt-1.5">
            <div className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <span>Unit + sub-units</span>
              {total.peopleCount > 0 && (
                <span className="font-normal normal-case text-foreground/70">
                  {total.pricedCount}/{total.peopleCount}
                </span>
              )}
            </div>
            {total.totals.length > 0 ? (
              <>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums text-foreground">
                  <span className="font-bold">
                    {formatCostTotals(total.totals, "monthly", true)}
                  </span>
                  <span className="font-semibold">
                    {formatCostTotals(total.totals, "annual", true)}
                  </span>
                </div>
                {totalDelta.length > 0 && (
                  <div className="mt-0.5">
                    <DeltaBadge deltas={totalDelta} compact />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-0.5 text-foreground/65">No salaries set</p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/75">
            <span>Unit cost</span>
            {activeSummary.peopleCount > 0 && (
              <span className="font-normal normal-case">
                {activeSummary.pricedCount}/{activeSummary.peopleCount}
              </span>
            )}
          </div>
          {activeSummary.totals.length > 0 ? (
            <>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums text-foreground">
                <span className="font-bold">
                  {formatCostTotals(activeSummary.totals, "monthly", true)}
                </span>
                <span className="font-medium text-foreground/85">
                  {formatCostTotals(activeSummary.totals, "annual", true)}
                </span>
              </div>
              {activeDelta.length > 0 && (
                <div className="mt-0.5">
                  <DeltaBadge deltas={activeDelta} compact />
                </div>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-foreground/65">No salaries set</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Active what-if banner above the chart while previewing a bulk salary adjustment. */
function LiveSalaryPreviewBanner({
  draft,
  plan,
  busy,
  onEdit,
  onDiscard,
  onApply,
  planning = false,
}: {
  draft: BulkSalaryDraft;
  plan: BulkSalaryPlan;
  busy: boolean;
  onEdit: () => void;
  onDiscard: () => void;
  onApply: () => void;
  /** On a chart that isn't active: applying only saves a plan. */
  planning?: boolean;
}) {
  const isIncrease = (plan.signedPct ?? 0) >= 0;
  return (
    <div
      className={
        "mb-3 rounded-xl border-2 px-3.5 py-2.5 print:hidden " +
        (isIncrease
          ? "border-emerald-400 bg-emerald-50/75 dark:border-emerald-700 dark:bg-emerald-950/35"
          : "border-rose-400 bg-rose-50/75 dark:border-rose-700 dark:bg-rose-950/35")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-foreground">
            <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Live salary preview · {plan.signedPct !== null ? formatSignedPct(plan.signedPct) : ""}
            </span>
            <span className="font-medium text-foreground/80">
              · {plan.scopeLabel} · {plan.selectedRows.length}{" "}
              {plan.selectedRows.length === 1 ? "person" : "people"} · effective{" "}
              {formatDate(draft.effectiveDate)}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-foreground">
            <span className="font-medium">Total impact:</span>
            <DeltaBadge deltas={plan.deltaTotals} />
            <span className="text-foreground/75">
              {planning
                ? "Not saved yet. Saving keeps it as a plan on this chart; real pay doesn't change."
                : "Not saved yet — figures below are projected."}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={busy}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={onApply} disabled={busy}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {busy
              ? planning
                ? "Saving…"
                : "Applying…"
              : planning
                ? "Save as plan"
                : "Apply changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Company-wide and chart-wide monthly & annual salary totals above the org chart. */
function CompanyCostsBanner({
  orgName,
  companyCost,
  companyCostDelta,
  chartCost,
  chartCostDelta,
  hasUnits,
  hasMultiUnitPeople,
  planning,
  todayCost,
  isLivePreview,
  canEditSalaries,
  onOpenBulkAdjust,
}: {
  orgName: string;
  companyCost: CostSummary;
  companyCostDelta: CurrencyCost[];
  chartCost: CostSummary;
  chartCostDelta: CurrencyCost[];
  hasUnits: boolean;
  hasMultiUnitPeople: boolean;
  /** "past" or "planned" when the chart isn't the active one, else null. */
  planning: string | null;
  /** Today's real costs for the whole organisation, for comparing a plan with. */
  todayCost: CostSummary;
  isLivePreview: boolean;
  canEditSalaries: boolean;
  onOpenBulkAdjust: () => void;
}) {
  // A past or planned chart is costed by the people placed in it (with its
  // planned pay), and compared with today's real costs; the active chart by
  // everyone in People, with the chart's share beside it.
  if (planning) {
    companyCost = chartCost;
    companyCostDelta = chartCostDelta;
  }
  const versusToday = planning ? subtractCurrencyTotals(chartCost.totals, todayCost.totals) : [];
  const showChartBreakdown =
    !planning &&
    hasUnits &&
    (chartCost.peopleCount !== companyCost.peopleCount ||
      chartCost.pricedCount !== companyCost.pricedCount);

  return (
    <div className="mb-3 rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/75">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span>
              {isLivePreview ? "Preview · " : ""}
              {planning === "past"
                ? "Salary costs in this past structure"
                : planning
                  ? "Planned salary costs"
                  : "Company salary costs"}{" "}
              · {orgName}
            </span>
          </p>
          {companyCost.totals.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
              <span className="text-base font-bold text-foreground">
                {formatCostTotals(companyCost.totals, "monthly")}
              </span>
              <span className="text-sm font-semibold text-foreground/85">
                {formatCostTotals(companyCost.totals, "annual")}
              </span>
              {companyCostDelta.length > 0 && <DeltaBadge deltas={companyCostDelta} />}
              <span className="text-xs text-foreground/75">
                {companyCost.pricedCount === companyCost.peopleCount
                  ? `${companyCost.peopleCount} ${companyCost.peopleCount === 1 ? "person" : "people"}`
                  : `${companyCost.pricedCount} of ${companyCost.peopleCount} people with salary`}
                {planning ? " in this chart" : ""}
                {hasMultiUnitPeople ? " · unique people (counted once)" : ""}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-foreground/80">
              No salaries set yet.{" "}
              <Link to="/people" className="font-semibold text-primary hover:underline">
                Add salaries on the People page
              </Link>{" "}
              to see employee, unit and company costs here.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showChartBreakdown && (
            <div className="border-t border-border/70 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/75">
                Placed in this chart
              </p>
              {chartCost.totals.length > 0 ? (
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
                  <span className="text-sm font-bold text-foreground">
                    {formatCostTotals(chartCost.totals, "monthly")}
                  </span>
                  <span className="text-xs font-semibold text-foreground/85">
                    {formatCostTotals(chartCost.totals, "annual")}
                  </span>
                  {chartCostDelta.length > 0 && <DeltaBadge deltas={chartCostDelta} compact />}
                  <span className="text-xs text-foreground/75">
                    ({chartCost.pricedCount}/{chartCost.peopleCount})
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-foreground/70">
                  0/{chartCost.peopleCount} with salary
                </p>
              )}
            </div>
          )}

          {planning && todayCost.totals.length > 0 && (
            <div className="border-t border-border/70 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/75">
                Today, whole organisation
              </p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
                <span className="text-sm font-bold text-foreground">
                  {formatCostTotals(todayCost.totals, "monthly")}
                </span>
                <span className="text-xs font-semibold text-foreground/85">
                  {formatCostTotals(todayCost.totals, "annual")}
                </span>
                <span className="text-xs text-foreground/75">
                  ({todayCost.pricedCount}/{todayCost.peopleCount})
                </span>
              </div>
              {versusToday.length > 0 && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/80">
                  This chart vs today: <DeltaBadge deltas={versusToday} compact />
                </p>
              )}
            </div>
          )}

          {canEditSalaries && !isLivePreview && companyCost.pricedCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenBulkAdjust}
              className="bg-background print:hidden"
            >
              <Percent className="mr-1.5 h-3.5 w-3.5" />
              Bulk adjust %
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
