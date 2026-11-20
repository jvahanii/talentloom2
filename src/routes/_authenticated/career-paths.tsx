import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUp,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey } from "@/lib/orgCharts";
import { fetchMemberSkills } from "@/lib/skillLevels";
import { fetchOrgSkills, orgSkillListKey } from "@/lib/orgSkills";
import { skillLevelLabel, skillLevelValues, type Skill } from "@/lib/skills";
import { formatMoney, SALARY_CURRENCIES, type SalaryCurrency } from "@/lib/salaries";
import {
  MAX_DESCRIPTION,
  MAX_LEVEL_NAME,
  MAX_NAME,
  addMove,
  assign,
  careersKey,
  deleteMove,
  deleteStep,
  deleteTrack,
  fetchCareers,
  fitOf,
  mapLevels,
  nextSteps,
  readiness,
  saveLevels,
  saveStep,
  saveTrack,
  type Careers,
  type Fit,
  type Readiness,
  type SalaryPeriod,
  type Step,
  type StepInput,
} from "@/lib/careers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/career-paths")({
  head: () => ({ meta: [{ title: "Career paths — Talentloom" }] }),
  component: CareerMapPage,
});

const NOBODY = "__nobody__";
const PER: Record<SalaryPeriod, string> = {
  monthly: "/ month",
  annual: "/ year",
  hourly: "/ hour",
};

/** How the map colours a role for someone; none: the role asks for no skills to compare. */
type MapFit = Fit | "none";

const FIT_STYLE: Record<MapFit, string> = {
  ready: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
  close: "border-amber-400 bg-amber-50 dark:bg-amber-950/50",
  far: "border-border bg-background",
  none: "border-border bg-background",
};
const FIT_LABEL: Record<MapFit, string> = {
  ready: "Ready",
  close: "Close",
  far: "Further",
  none: "No skills to compare",
};

const parseNum = (s: string) => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
};

function salaryRange(s: Step) {
  if (s.salary_min === null && s.salary_max === null) return null;
  const cur = (
    (SALARY_CURRENCIES as readonly string[]).includes(s.currency) ? s.currency : "EUR"
  ) as SalaryCurrency;
  const [a, b] = [s.salary_min, s.salary_max].map((v) => (v === null ? "…" : formatMoney(v, cur)));
  return `${a}–${b} ${PER[s.salary_period]}`;
}

type Panel = { mode: "view"; stepId: string } | { mode: "edit"; step: StepInput } | null;
type FamilyDialog = { id?: string; name: string; description: string } | null;

function CareerMapPage() {
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const levelNames = useSkillLevelNames();
  const careersQ = useQuery({
    queryKey: careersKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchCareers(orgId!),
  });
  const peopleQ = useQuery({
    queryKey: orgPeopleKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgPeople(orgId!),
  });
  const skillsQ = useQuery({
    queryKey: ["career-member-skills", orgId],
    enabled: !!orgId,
    queryFn: () => fetchMemberSkills(orgId!),
  });
  const orgSkillsQ = useQuery({
    queryKey: orgSkillListKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgSkills(orgId!),
  });
  const c: Careers = careersQ.data ?? {
    levels: [],
    tracks: [],
    steps: [],
    skills: [],
    moves: [],
    assignments: [],
  };
  const people = peopleQ.data ?? [];
  const memberSkills = skillsQ.data ?? new Map<string, Skill[]>();

  const [viewAs, setViewAs] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [family, setFamily] = useState<FamilyDialog>(null);
  const [editingLevels, setEditingLevels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    action: () => Promise<void>;
  } | null>(null);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(
        e && typeof e === "object" && "message" in e ? String(e.message) : "Something went wrong",
      );
      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: careersKey(orgId) });
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const levels = mapLevels(c);
  const levelName = (rank: number) => levels.find((l) => l.rank === rank)?.name ?? `Level ${rank}`;
  const familyName = (id: string) => c.tracks.find((t) => t.id === id)?.name ?? "?";
  const stepById = (id: string) => c.steps.find((s) => s.id === id);
  const asks = (stepId: string) => c.skills.filter((k) => k.step_id === stepId);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone who left";
  const skillNames = [
    ...new Set([
      ...(orgSkillsQ.data ?? []).map((s) => s.name),
      ...[...memberSkills.values()].flat().map((s) => s.name),
      ...c.skills.map((s) => s.skill),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  // The person the map is coloured for.
  const person = viewAs ? people.find((p) => p.id === viewAs) : undefined;
  const personStep = viewAs
    ? c.assignments.find((a) => a.person_id === viewAs)?.step_id
    : undefined;
  const options = personStep ? nextSteps(c, personStep) : { up: [], sideways: [] };
  const optionIds = new Set([
    ...options.up.map((s) => s.id),
    ...options.sideways.map((x) => x.step.id),
  ]);
  const fitFor = (stepId: string): { r: Readiness; fit: MapFit } | null => {
    if (!viewAs) return null;
    const r = readiness(memberSkills.get(viewAs) ?? [], asks(stepId));
    return { r, fit: r.total ? fitOf(r) : "none" };
  };
  const missingText = (r: Readiness) =>
    r.missing
      .map(
        (x) =>
          `${x.skill}: ${skillLevelLabel(x.need, levelNames)}${x.have ? ` (now ${skillLevelLabel(x.have, levelNames)})` : " (not yet)"}`,
      )
      .join(", ");

  const blankRole = (trackId: string, level: number): StepInput => ({
    track_id: trackId,
    name: "",
    description: "",
    level,
    salary_min: null,
    salary_max: null,
    currency: "EUR",
    salary_period: "monthly",
    // A new role starts from what the role below it in the family asks for.
    skills: (() => {
      const below = c.steps
        .filter((s) => s.track_id === trackId && s.level < level)
        .sort((a, b) => b.level - a.level)[0];
      return below ? asks(below.id).map(({ skill, min_level }) => ({ skill, min_level })) : [];
    })(),
  });
  const editRole = (s: Step): StepInput => ({
    ...s,
    description: s.description ?? "",
    skills: asks(s.id).map(({ skill, min_level }) => ({ skill, min_level })),
  });

  return (
    <div className="mx-auto max-w-[96rem] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold">Career paths</h1>
          <p className="text-sm text-muted-foreground">
            The career map: job families side by side, levels from bottom to top. Moving up a column
            is a promotion; an arrow is a move sideways to another family. Pick a person to see
            where they are and which roles they are ready for.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditingLevels(true)}>
            <Layers className="mr-1 h-4 w-4" /> Levels
          </Button>
          <Button onClick={() => setFamily({ name: "", description: "" })}>
            <Plus className="mr-1 h-4 w-4" /> Job family
          </Button>
        </div>
      </div>

      {/* Whose view the map shows. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-3">
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <Select value={viewAs ?? NOBODY} onValueChange={(v) => setViewAs(v === NOBODY ? null : v)}>
          <SelectTrigger className="h-9 w-64" aria-label="Show the map for">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOBODY}>Everyone (no one picked)</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {person ? (
          personStep ? (
            <p className="min-w-0 flex-1 text-sm">
              <strong>{person.name}</strong> is a {stepById(personStep)?.name} (
              {familyName(stepById(personStep)!.track_id)}, {levelName(stepById(personStep)!.level)}
              ).{" "}
              {options.up.length + options.sideways.length === 0
                ? "No moves up or sideways are set from here yet."
                : "Their next options are outlined on the map."}
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {person.name} isn't in a role yet: click a role and choose{" "}
              <em>Place {person.name} here</em>. Colours show how their skills fit every role.
            </p>
          )
        ) : (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Pick a person to colour the map by how their skills fit each role.
          </p>
        )}
        {person && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(["ready", "close", "far"] as Fit[]).map((f) => (
              <span key={f} className={cn("rounded-md border-2 px-1.5", FIT_STYLE[f])}>
                {FIT_LABEL[f]}
              </span>
            ))}
          </div>
        )}
      </div>

      {careersQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : c.tracks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <RouteIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Start the career map</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a job family, such as Engineering or Sales, then its roles level by level.
          </p>
          <Button className="mt-4" onClick={() => setFamily({ name: "", description: "" })}>
            <Plus className="mr-1 h-4 w-4" /> Job family
          </Button>
        </div>
      ) : (
        <CareerMap
          c={c}
          levels={levels}
          viewAs={viewAs}
          personStep={personStep}
          optionIds={optionIds}
          fitFor={fitFor}
          missingText={missingText}
          onOpen={(id) => setPanel({ mode: "view", stepId: id })}
          onAdd={(trackId, level) => setPanel({ mode: "edit", step: blankRole(trackId, level) })}
          onEditFamily={(id) => {
            const t = c.tracks.find((x) => x.id === id)!;
            setFamily({ id, name: t.name, description: t.description ?? "" });
          }}
        />
      )}

      <Sheet open={!!panel} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {panel?.mode === "view" && stepById(panel.stepId) && (
            <RoleView
              c={c}
              step={stepById(panel.stepId)!}
              levelName={levelName}
              familyName={familyName}
              levelNames={levelNames}
              people={people}
              nameOf={nameOf}
              viewAs={viewAs}
              fit={fitFor(panel.stepId)}
              missingText={missingText}
              busy={busy}
              onEdit={(s) => setPanel({ mode: "edit", step: editRole(s) })}
              onPlace={(personId, stepId) =>
                run(
                  () => assign(orgId, personId, stepId, new Date().toISOString().slice(0, 10)),
                  stepId ? `Placed ${nameOf(personId)}` : `Took ${nameOf(personId)} off the map`,
                )
              }
              onAddMove={(from, to) => run(() => addMove(orgId, from, to, ""), "Added the move")}
              onDeleteMove={(id) => run(() => deleteMove(id), "Removed the move")}
              onOpen={(id) => setPanel({ mode: "view", stepId: id })}
            />
          )}
          {panel?.mode === "edit" && (
            <RoleEditor
              key={panel.step.id ?? `new-${panel.step.track_id}-${panel.step.level}`}
              value={panel.step}
              onChange={(step) => setPanel({ mode: "edit", step })}
              c={c}
              levels={levels}
              skillNames={skillNames}
              levelNames={levelNames}
              busy={busy}
              onCancel={() =>
                setPanel(panel.step.id ? { mode: "view", stepId: panel.step.id } : null)
              }
              onSave={async (s) => {
                const ok = await run(
                  () => saveStep(orgId, s),
                  s.id ? "Saved the role" : `Added ${s.name.trim()}`,
                );
                if (ok) setPanel(s.id ? { mode: "view", stepId: s.id } : null);
              }}
              onDelete={(s) =>
                setConfirm({
                  title: `Delete ${s.name}?`,
                  text: "Its moves are deleted too, and the people in it are taken off the map. This can't be undone.",
                  action: async () => {
                    if (await run(() => deleteStep(s.id!), "Deleted the role")) setPanel(null);
                  },
                })
              }
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!family} onOpenChange={(o) => !o && setFamily(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{family?.id ? "Edit the job family" : "New job family"}</DialogTitle>
            <DialogDescription>
              A column of the map, such as Engineering or Sales.
            </DialogDescription>
          </DialogHeader>
          {family && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!family.name.trim()) return;
                if (
                  await run(
                    () => saveTrack(orgId, { ...family, position: c.tracks.length }),
                    family.id ? "Saved the family" : `Added ${family.name.trim()}`,
                  )
                )
                  setFamily(null);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="family-name">Name</Label>
                <Input
                  id="family-name"
                  autoFocus
                  maxLength={MAX_NAME}
                  value={family.name}
                  onChange={(e) => setFamily({ ...family, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="family-desc">Description (optional)</Label>
                <Textarea
                  id="family-desc"
                  rows={2}
                  maxLength={1000}
                  value={family.description}
                  onChange={(e) => setFamily({ ...family, description: e.target.value })}
                />
              </div>
              <DialogFooter className="gap-2">
                {family.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    onClick={() => {
                      const id = family.id!;
                      setConfirm({
                        title: `Delete ${family.name}?`,
                        text: "Its roles and their moves are deleted too, and the people in them are taken off the map. This can't be undone.",
                        action: async () => {
                          if (await run(() => deleteTrack(id), "Deleted the family"))
                            setFamily(null);
                        },
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setFamily(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !family.name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <LevelsDialog
        open={editingLevels}
        onClose={() => setEditingLevels(false)}
        levels={levels}
        used={new Set(c.steps.map((s) => s.level))}
        busy={busy}
        onSave={async (next) => {
          if (await run(() => saveLevels(orgId, next), "Saved the levels")) setEditingLevels(false);
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm?.action()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------- the map

function CareerMap({
  c,
  levels,
  viewAs,
  personStep,
  optionIds,
  fitFor,
  missingText,
  onOpen,
  onAdd,
  onEditFamily,
}: {
  c: Careers;
  levels: { rank: number; name: string; description: string | null }[];
  viewAs: string | null;
  personStep: string | undefined;
  optionIds: Set<string>;
  fitFor: (stepId: string) => { r: Readiness; fit: MapFit } | null;
  missingText: (r: Readiness) => string;
  onOpen: (stepId: string) => void;
  onAdd: (trackId: string, level: number) => void;
  onEditFamily: (trackId: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [arrows, setArrows] = useState<{ id: string; d: string; strong: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Draws the sideways moves as arrows between the role cards.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const draw = () => {
      const box = el.getBoundingClientRect();
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
      const out: { id: string; d: string; strong: boolean }[] = [];
      for (const m of c.moves) {
        const a = cards.current.get(m.from_step)?.getBoundingClientRect();
        const b = cards.current.get(m.to_step)?.getBoundingClientRect();
        if (!a || !b) continue;
        const rightward = b.left >= a.right;
        const x1 = (rightward ? a.right : a.left) - box.left + el.scrollLeft;
        const x2 = (rightward ? b.left : b.right) - box.left + el.scrollLeft;
        const y1 = a.top + a.height / 2 - box.top + el.scrollTop;
        const y2 = b.top + b.height / 2 - box.top + el.scrollTop;
        const bend = Math.max(30, Math.abs(x2 - x1) / 2);
        const dir = rightward ? 1 : -1;
        out.push({
          id: m.id,
          d: `M ${x1} ${y1} C ${x1 + dir * bend} ${y1}, ${x2 - dir * bend} ${y2}, ${x2} ${y2}`,
          strong: !!personStep && m.from_step === personStep,
        });
      }
      setArrows(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    window.addEventListener("resize", draw);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [c, personStep]);

  const cols = `9rem repeat(${c.tracks.length}, minmax(13rem, 1fr))`;
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
      <div ref={wrap} className="relative min-w-max p-3">
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-10"
          width={size.w}
          height={size.h}
        >
          <defs>
            <marker
              id="cm-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-sky-500" />
            </marker>
          </defs>
          {arrows.map((a) => (
            <path
              key={a.id}
              d={a.d}
              fill="none"
              markerEnd="url(#cm-arrow)"
              className={cn(
                "stroke-sky-500",
                a.strong ? "opacity-100" : viewAs ? "opacity-25" : "opacity-70",
              )}
              strokeWidth={a.strong ? 2.5 : 1.5}
              strokeDasharray="5 4"
            />
          ))}
        </svg>
        <div className="grid gap-x-3" style={{ gridTemplateColumns: cols }}>
          <div />
          {c.tracks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onEditFamily(t.id)}
              title={t.description ?? "Edit the family"}
              className="group mb-2 flex items-center justify-center gap-1 rounded-xl bg-muted/60 px-2 py-2 text-sm font-semibold hover:bg-muted"
            >
              <span className="truncate">{t.name}</span>
              <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60" />
            </button>
          ))}
          {levels.map((l, li) => (
            <Row key={l.rank}>
              <div
                className={cn(
                  "flex flex-col justify-center border-t border-border/70 py-3 pr-2",
                  li === 0 && "border-t-0",
                )}
                title={l.description ?? undefined}
              >
                <span className="text-sm font-semibold">{l.name}</span>
                <span className="text-[11px] text-muted-foreground">Level {l.rank}</span>
              </div>
              {c.tracks.map((t) => {
                const roles = c.steps.filter((s) => s.track_id === t.id && s.level === l.rank);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex min-h-20 flex-col justify-center gap-1.5 border-t border-border/70 py-2",
                      li === 0 && "border-t-0",
                    )}
                  >
                    {roles.map((s) => {
                      const f = fitFor(s.id);
                      const here = c.assignments.filter((a) => a.step_id === s.id).length;
                      const isNow = s.id === personStep;
                      const isOption = optionIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          ref={(el) => {
                            if (el) cards.current.set(s.id, el);
                            else cards.current.delete(s.id);
                          }}
                          type="button"
                          onClick={() => onOpen(s.id)}
                          title={
                            f && !isNow
                              ? `${FIT_LABEL[f.fit]}: ${f.r.met}/${f.r.total} skills${f.r.missing.length ? `. Missing ${missingText(f.r)}` : ""}`
                              : undefined
                          }
                          className={cn(
                            "relative z-20 rounded-xl border-2 px-2.5 py-1.5 text-left shadow-sm transition hover:-translate-y-px hover:shadow",
                            isNow
                              ? "border-primary bg-primary text-primary-foreground"
                              : f
                                ? FIT_STYLE[f.fit]
                                : "border-border bg-background",
                            viewAs && personStep && !isNow && !isOption && "opacity-55",
                            isOption && "ring-2 ring-sky-400 ring-offset-1 ring-offset-card",
                          )}
                        >
                          <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
                            {isNow && <MapPin className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 flex items-center gap-2 text-[11px]",
                              isNow ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {f && !isNow ? (
                              <span>
                                {f.r.total ? `${f.r.met}/${f.r.total} skills` : "No skills asked"}
                              </span>
                            ) : (
                              salaryRange(s) && <span className="truncate">{salaryRange(s)}</span>
                            )}
                            {here > 0 && (
                              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                                <UserRound className="h-3 w-3" />
                                {here}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => onAdd(t.id, l.rank)}
                      aria-label={`Add a role in ${t.name} at ${l.name}`}
                      className={cn(
                        "rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground",
                        roles.length
                          ? "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                          : "",
                      )}
                    >
                      <Plus className="mr-0.5 inline h-3 w-3" /> Role
                    </button>
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <ArrowUp className="inline h-3 w-3" /> Up a column: promotion ·{" "}
        <span className="text-sky-600 dark:text-sky-400">- - →</span> a move sideways to another
        family · Click a role for its details, people and moves.
      </p>
    </div>
  );
}

/** A grid row's cells, placed straight into the parent grid. */
function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------- one role

function RoleView({
  c,
  step,
  levelName,
  familyName,
  levelNames,
  people,
  nameOf,
  viewAs,
  fit,
  missingText,
  busy,
  onEdit,
  onPlace,
  onAddMove,
  onDeleteMove,
  onOpen,
}: {
  c: Careers;
  step: Step;
  levelName: (rank: number) => string;
  familyName: (id: string) => string;
  levelNames: string[];
  people: { id: string; name: string }[];
  nameOf: (id: string) => string;
  viewAs: string | null;
  fit: { r: Readiness; fit: MapFit } | null;
  missingText: (r: Readiness) => string;
  busy: boolean;
  onEdit: (s: Step) => void;
  onPlace: (personId: string, stepId: string | null) => void;
  onAddMove: (from: string, to: string) => void;
  onDeleteMove: (id: string) => void;
  onOpen: (stepId: string) => void;
}) {
  const asks = c.skills.filter((k) => k.step_id === step.id);
  const here = c.assignments.filter((a) => a.step_id === step.id);
  const out = c.moves.filter((m) => m.from_step === step.id);
  const into = c.moves.filter((m) => m.to_step === step.id);
  const label = (id: string) => {
    const s = c.steps.find((x) => x.id === id);
    return s ? `${s.name} · ${familyName(s.track_id)}` : "?";
  };
  const viewing = viewAs ? people.find((p) => p.id === viewAs) : undefined;
  const viewingHere = here.some((a) => a.person_id === viewAs);
  const notHere = people.filter((p) => !here.some((a) => a.person_id === p.id));
  const targets = c.steps.filter((s) => s.id !== step.id && !out.some((m) => m.to_step === s.id));

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {step.name}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => onEdit(step)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </SheetTitle>
        <SheetDescription>
          {familyName(step.track_id)} · {levelName(step.level)}
          {salaryRange(step) ? ` · ${salaryRange(step)}` : ""}
        </SheetDescription>
      </SheetHeader>
      {step.description && <p className="whitespace-pre-line text-sm">{step.description}</p>}

      {viewing && fit && !viewingHere && (
        <section className={cn("space-y-2 rounded-xl border-2 p-3", FIT_STYLE[fit.fit])}>
          <p className="text-sm font-semibold">
            {viewing.name}: {FIT_LABEL[fit.fit].toLowerCase()} —{" "}
            {fit.r.total ? `${fit.r.met} of ${fit.r.total} skills` : "this role asks for no skills"}
          </p>
          {fit.r.missing.length > 0 && (
            <p className="text-sm text-muted-foreground">Missing: {missingText(fit.r)}.</p>
          )}
          <Button size="sm" disabled={busy} onClick={() => onPlace(viewing.id, step.id)}>
            <MapPin className="mr-1 h-3.5 w-3.5" /> Place {viewing.name} here
          </Button>
        </section>
      )}

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Skills it asks for</h3>
        {asks.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet: add them with Edit.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {asks.map((k) => (
              <li key={k.skill} className="rounded-full border-2 border-border px-2 py-0.5 text-xs">
                {k.skill} · at least {skillLevelLabel(k.min_level, levelNames)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">People in this role ({here.length})</h3>
        <ul className="space-y-1">
          {here.map((a) => (
            <li key={a.person_id} className="flex items-center gap-2 text-sm">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">{nameOf(a.person_id)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={busy}
                aria-label={`Take ${nameOf(a.person_id)} off this role`}
                onClick={() => onPlace(a.person_id, null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {notHere.length > 0 && (
          <Select value="" onValueChange={(v) => v && onPlace(v, step.id)}>
            <SelectTrigger className="h-8" aria-label="Place someone in this role">
              <SelectValue placeholder="Place someone in this role" />
            </SelectTrigger>
            <SelectContent>
              {notHere.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {c.assignments.some((a) => a.person_id === p.id)
                    ? " (moves from their role)"
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">Moves sideways from here</h3>
        <ul className="space-y-1">
          {out.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <ArrowRight className="h-3.5 w-3.5 text-sky-500" />
              <button
                type="button"
                className="flex-1 text-left hover:underline"
                onClick={() => onOpen(m.to_step)}
              >
                {label(m.to_step)}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={busy}
                aria-label={`Remove the move to ${label(m.to_step)}`}
                onClick={() => onDeleteMove(m.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {out.length === 0 && <li className="text-sm text-muted-foreground">None yet.</li>}
        </ul>
        {targets.length > 0 && (
          <Select value="" onValueChange={(v) => v && onAddMove(step.id, v)}>
            <SelectTrigger className="h-8" aria-label="Add a move sideways">
              <SelectValue placeholder="Add a move to another role" />
            </SelectTrigger>
            <SelectContent>
              {c.tracks.map((t) => {
                const list = targets
                  .filter((s) => s.track_id === t.id)
                  .sort((a, b) => a.level - b.level);
                return list.length ? (
                  <SelectGroup key={t.id}>
                    <SelectLabel>{t.name}</SelectLabel>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({levelName(s.level)})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null;
              })}
            </SelectContent>
          </Select>
        )}
        {into.length > 0 && (
          <p className="text-xs text-muted-foreground">
            People come here sideways from:{" "}
            {into.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onOpen(m.from_step)}
                >
                  {label(m.from_step)}
                </button>
              </span>
            ))}
            .
          </p>
        )}
      </section>
    </div>
  );
}

function RoleEditor({
  value: s,
  onChange,
  c,
  levels,
  skillNames,
  levelNames,
  busy,
  onCancel,
  onSave,
  onDelete,
}: {
  value: StepInput;
  onChange: (s: StepInput) => void;
  c: Careers;
  levels: { rank: number; name: string }[];
  skillNames: string[];
  levelNames: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (s: StepInput) => void;
  onDelete: (s: StepInput) => void;
}) {
  const [min, setMin] = useState(s.salary_min === null ? "" : String(s.salary_min));
  const [max, setMax] = useState(s.salary_max === null ? "" : String(s.salary_max));
  const minN = parseNum(min);
  const maxN = parseNum(max);
  const bad =
    Number.isNaN(minN) || Number.isNaN(maxN) || (minN !== null && maxN !== null && maxN < minN);
  const set = (patch: Partial<StepInput>) => onChange({ ...s, ...patch });
  const free = skillNames.filter((n) => !s.skills.some((k) => k.skill === n));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!s.name.trim() || bad) return;
        onSave({ ...s, salary_min: minN, salary_max: maxN });
      }}
    >
      <SheetHeader>
        <SheetTitle>{s.id ? `Edit ${s.name || "the role"}` : "New role"}</SheetTitle>
        <SheetDescription>A role in a job family, at a level.</SheetDescription>
      </SheetHeader>
      <div className="space-y-1.5">
        <Label htmlFor="role-name">Name</Label>
        <Input
          id="role-name"
          autoFocus
          maxLength={MAX_NAME}
          placeholder="e.g. Senior developer"
          value={s.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Job family</Label>
          <Select value={s.track_id} onValueChange={(v) => set({ track_id: v })}>
            <SelectTrigger aria-label="Job family">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {c.tracks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Level</Label>
          <Select value={String(s.level)} onValueChange={(v) => set({ level: Number(v) })}>
            <SelectTrigger aria-label="Level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.rank} value={String(l.rank)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="role-desc">What the role means (optional)</Label>
        <Textarea
          id="role-desc"
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={s.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Salary range (optional)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="decimal"
            placeholder="From"
            aria-label="Salary from"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
          <Input
            inputMode="decimal"
            placeholder="To"
            aria-label="Salary to"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
          <Select value={s.currency} onValueChange={(v) => set({ currency: v })}>
            <SelectTrigger aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALARY_CURRENCIES.map((cur) => (
                <SelectItem key={cur} value={cur}>
                  {cur}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={s.salary_period}
            onValueChange={(v) => set({ salary_period: v as SalaryPeriod })}
          >
            <SelectTrigger aria-label="Per">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">a month</SelectItem>
              <SelectItem value="annual">a year</SelectItem>
              <SelectItem value="hourly">an hour</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {bad && <p className="text-xs text-destructive">Use numbers, and "to" at least "from".</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Skills it asks for</Label>
        <ul className="space-y-1.5">
          {s.skills.map((k, i) => (
            <li key={k.skill} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{k.skill}</span>
              <Select
                value={String(k.min_level)}
                onValueChange={(v) =>
                  set({
                    skills: s.skills.map((x, j) => (j === i ? { ...x, min_level: Number(v) } : x)),
                  })
                }
              >
                <SelectTrigger className="h-8 w-40" aria-label={`Level of ${k.skill}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {skillLevelValues(levelNames).map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      at least {skillLevelLabel(l, levelNames)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={`Remove ${k.skill}`}
                onClick={() => set({ skills: s.skills.filter((_, j) => j !== i) })}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {free.length > 0 ? (
          <Select
            value=""
            onValueChange={(v) =>
              v &&
              set({
                skills: [...s.skills, { skill: v, min_level: Math.min(2, levelNames.length) }],
              })
            }
          >
            <SelectTrigger className="h-8" aria-label="Add a skill">
              <SelectValue placeholder="Add a skill" />
            </SelectTrigger>
            <SelectContent>
              {free.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            {skillNames.length
              ? "Every skill is already listed."
              : "Add skills on the Skills page first."}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {s.id && (
          <Button type="button" variant="outline" onClick={() => onDelete(s)}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !s.name.trim() || bad}>
          {s.id ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- levels

function LevelsDialog({
  open,
  onClose,
  levels,
  used,
  busy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  levels: { rank: number; name: string; description: string | null }[];
  used: Set<number>;
  busy: boolean;
  onSave: (next: { rank: number; name: string; description: string }[]) => void;
}) {
  const [draft, setDraft] = useState<{ rank: number; name: string; description: string }[]>([]);
  useLayoutEffect(() => {
    if (open)
      setDraft(
        [...levels]
          .sort((a, b) => b.rank - a.rank)
          .map((l) => ({ rank: l.rank, name: l.name, description: l.description ?? "" })),
      );
    // Filled each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const top = draft.length ? Math.max(...draft.map((l) => l.rank)) : 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Levels</DialogTitle>
          <DialogDescription>
            The map's rows, shared by every job family: the highest first. For example Junior, Mid,
            Senior, Lead, Head.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {draft.map((l, i) => (
            <li key={l.rank} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                {l.rank}
              </span>
              <Input
                value={l.name}
                maxLength={MAX_LEVEL_NAME}
                aria-label={`Name of level ${l.rank}`}
                onChange={(e) =>
                  setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={used.has(l.rank)}
                title={
                  used.has(l.rank) ? "Roles sit on this level; move them first" : "Remove the level"
                }
                aria-label={`Remove level ${l.rank}`}
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDraft([{ rank: top + 1, name: "", description: "" }, ...draft])}
        >
          <Plus className="mr-1 h-4 w-4" /> A level at the top
        </Button>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || draft.some((l) => !l.name.trim())}
            onClick={() => onSave(draft)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
