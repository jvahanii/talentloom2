import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import {
  MAX_CHART_NAME,
  MAX_NOTE,
  MAX_PERSON,
  MAX_ROLE,
  addNode,
  chartNodesKey,
  chartsKey,
  childrenOf,
  copyChart,
  createChart,
  deleteChart,
  deleteNode,
  fetchCharts,
  fetchNodes,
  renameChart,
  subtreeIds,
  updateNode,
  type ChartNode,
  type NodeFields,
  type OrgChart,
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

type NameDialog = { mode: "new" | "rename" | "copy"; value: string } | null;
type BoxDialog =
  | { mode: "add"; parentId: string | null; fields: NodeFields }
  | { mode: "edit"; node: ChartNode; fields: NodeFields; parent: string }
  | null;

const emptyFields: NodeFields = { role: "", person_name: "", note: "" };

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

  const [busy, setBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [boxDialog, setBoxDialog] = useState<BoxDialog>(null);
  const [confirmChartDelete, setConfirmChartDelete] = useState(false);
  const [confirmBoxDelete, setConfirmBoxDelete] = useState<ChartNode | null>(null);

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
      await qc.invalidateQueries({ queryKey: chartsKey(orgId) });
      if (chart) await qc.invalidateQueries({ queryKey: chartNodesKey(chart.id) });
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const nextPosition = (parentId: string | null) => {
    const siblings = kids.get(parentId ?? "") ?? [];
    return siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0;
  };

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
    const ok = await run(async () => {
      if (boxDialog.mode === "add") {
        await addNode(
          orgId,
          chart.id,
          boxDialog.parentId,
          nextPosition(boxDialog.parentId),
          boxDialog.fields,
        );
      } else {
        const parent = boxDialog.parent === TOP ? null : boxDialog.parent;
        const moved = parent !== boxDialog.node.parent_id;
        await updateNode(boxDialog.node.id, {
          ...boxDialog.fields,
          ...(moved ? { parent_id: parent, position: nextPosition(parent) } : {}),
        });
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

  const editing = boxDialog?.mode === "edit" ? boxDialog.node : null;
  const blocked = editing ? subtreeIds(nodes, editing.id) : new Set<string>();
  const siblingsOfEditing = editing ? (kids.get(editing.parent_id ?? "") ?? []) : [];
  const editingIndex = editing ? siblingsOfEditing.findIndex((s) => s.id === editing.id) : -1;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Org chart</h1>
        <p className="text-sm text-muted-foreground">
          Draw how {orgName} is organised: roles, who holds them and who reports to whom. Keep as
          many charts as you like, for example today's and a planned one. Everyone in the
          organisation can see and edit them.
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
        <div className="rounded-2xl border-2 border-border bg-card p-4">
          {nodesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : nodes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">This chart has no boxes yet.</p>
              <Button
                className="mt-3"
                onClick={() => setBoxDialog({ mode: "add", parentId: null, fields: emptyFields })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add the top role
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto pb-4">
                <div className="org-tree mx-auto w-max min-w-full">
                  <Branch
                    parentKey=""
                    kids={kids}
                    onOpen={(n) =>
                      setBoxDialog({
                        mode: "edit",
                        node: n,
                        parent: n.parent_id ?? TOP,
                        fields: {
                          role: n.role,
                          person_name: n.person_name ?? "",
                          note: n.note ?? "",
                        },
                      })
                    }
                    onAdd={(n) =>
                      setBoxDialog({ mode: "add", parentId: n.id, fields: emptyFields })
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Click a box to edit or move it; + adds a role below it.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBoxDialog({ mode: "add", parentId: null, fields: emptyFields })}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add a role at the top
                </Button>
              </div>
            </>
          )}
        </div>
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
                ? "A copy keeps every box, so you can sketch changes without touching the original."
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{boxDialog?.mode === "edit" ? "Edit the role" : "Add a role"}</DialogTitle>
            <DialogDescription>
              {boxDialog?.mode === "add" && boxDialog.parentId
                ? `Reports to ${nodes.find((n) => n.id === boxDialog.parentId)?.role ?? "the box above"}.`
                : boxDialog?.mode === "add"
                  ? "At the top of the chart."
                  : "Names are typed here; they aren't linked to People."}
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
                <Label htmlFor="box-role">Role</Label>
                <Input
                  id="box-role"
                  autoFocus
                  placeholder="e.g. Head of Sales"
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
              <div className="space-y-1.5">
                <Label htmlFor="box-person">Name (optional)</Label>
                <Input
                  id="box-person"
                  placeholder="Who holds the role; leave empty if open"
                  value={boxDialog.fields.person_name}
                  maxLength={MAX_PERSON}
                  onChange={(e) =>
                    setBoxDialog((d) =>
                      d
                        ? ({
                            ...d,
                            fields: { ...d.fields, person_name: e.target.value },
                          } as BoxDialog)
                        : d,
                    )
                  }
                />
              </div>
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
                    <Label>Reports to</Label>
                    <Select
                      value={boxDialog.parent}
                      onValueChange={(v) =>
                        setBoxDialog((d) => (d && d.mode === "edit" ? { ...d, parent: v } : d))
                      }
                    >
                      <SelectTrigger aria-label="Reports to">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TOP}>Nobody — at the top</SelectItem>
                        {nodes
                          .filter((n) => !blocked.has(n.id))
                          .map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.role}
                              {n.person_name ? ` — ${n.person_name}` : ""}
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
                      onClick={() =>
                        setBoxDialog({
                          mode: "add",
                          parentId: boxDialog.node.id,
                          fields: emptyFields,
                        })
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add a role below
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
                ? "The roles below it move up to report to the role above it."
                : "The box is removed from the chart."}
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

function Branch({
  parentKey,
  kids,
  onOpen,
  onAdd,
}: {
  parentKey: string;
  kids: Map<string, ChartNode[]>;
  onOpen: (n: ChartNode) => void;
  onAdd: (n: ChartNode) => void;
}) {
  const list = kids.get(parentKey) ?? [];
  if (list.length === 0) return null;
  return (
    <ul>
      {list.map((n) => (
        <li key={n.id}>
          <div className="relative">
            <button
              type="button"
              onClick={() => onOpen(n)}
              className="block w-44 rounded-xl border-2 border-border bg-background px-3 py-2.5 text-center shadow-sm transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="block text-sm font-semibold leading-snug">{n.role}</span>
              <span className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{n.person_name || "Open"}</span>
              </span>
              {n.note && (
                <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground/80">
                  {n.note}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onAdd(n)}
              aria-label={`Add a role below ${n.role}`}
              title="Add a role below"
              className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <Branch parentKey={n.id} kids={kids} onOpen={onOpen} onAdd={onAdd} />
        </li>
      ))}
    </ul>
  );
}
