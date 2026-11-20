import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, ArrowUp, Pencil, Plus, Route as RouteIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { useRememberedTab } from "@/hooks/useRememberedTab";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey } from "@/lib/orgCharts";
import { fetchMemberSkills } from "@/lib/skillLevels";
import { fetchOrgSkills, orgSkillListKey } from "@/lib/orgSkills";
import { skillLevelLabel, skillLevelValues, type Skill } from "@/lib/skills";
import { formatMoney, SALARY_CURRENCIES, type SalaryCurrency } from "@/lib/salaries";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  addMove,
  assign,
  careersKey,
  deleteMove,
  deleteStep,
  deleteTrack,
  fetchCareers,
  nextSteps,
  readiness,
  saveStep,
  saveTrack,
  type Careers,
  type SalaryPeriod,
  type Step,
  type StepInput,
  type Track,
} from "@/lib/careers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  component: CareerPage,
});

const NONE = "__none__";
const PERIOD: Record<SalaryPeriod, string> = {
  monthly: "/ month",
  annual: "/ year",
  hourly: "/ hour",
};

type TrackDialog = { id?: string; name: string; description: string } | null;
type MoveDialog = { from: Step; to: string; note: string } | null;

const parseNum = (s: string) => {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
};

function salaryRange(s: Step) {
  const cur = (SALARY_CURRENCIES as readonly string[]).includes(s.currency)
    ? (s.currency as SalaryCurrency)
    : "EUR";
  if (s.salary_min === null && s.salary_max === null) return null;
  const parts = [s.salary_min, s.salary_max].map((v) => (v === null ? "…" : formatMoney(v, cur)));
  return `${parts[0]}–${parts[1]} ${PERIOD[s.salary_period]}`;
}

function CareerPage() {
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const levelNames = useSkillLevelNames();
  const [tab, chooseTab] = useRememberedTab("career-paths", ["paths", "people"] as const, "paths");
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
    tracks: [],
    steps: [],
    skills: [],
    moves: [],
    assignments: [],
  };
  const people = peopleQ.data ?? [];
  const memberSkills = skillsQ.data ?? new Map<string, Skill[]>();

  const [busy, setBusy] = useState(false);
  const [trackDialog, setTrackDialog] = useState<TrackDialog>(null);
  const [stepDialog, setStepDialog] = useState<StepInput | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialog>(null);
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

  const stepsOf = (trackId: string) =>
    c.steps.filter((s) => s.track_id === trackId).sort((a, b) => a.level - b.level);
  const trackOf = (stepId: string) =>
    c.tracks.find((t) => t.id === c.steps.find((s) => s.id === stepId)?.track_id);
  const stepLabel = (stepId: string) => {
    const s = c.steps.find((x) => x.id === stepId);
    return s ? `${s.name} (${trackOf(stepId)?.name ?? "?"})` : "?";
  };
  const skillNames = [
    ...new Set([
      ...(orgSkillsQ.data ?? []).map((s) => s.name),
      ...[...memberSkills.values()].flat().map((s) => s.name),
      ...c.skills.map((s) => s.skill),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const newStep = (t: Track): StepInput => {
    const top = stepsOf(t.id).at(-1);
    return {
      track_id: t.id,
      name: "",
      description: "",
      level: (top?.level ?? 0) + 1,
      salary_min: null,
      salary_max: null,
      currency: top?.currency ?? "EUR",
      salary_period: top?.salary_period ?? "monthly",
      // A new step up starts from what the step below it asks for.
      skills: top
        ? c.skills
            .filter((k) => k.step_id === top.id)
            .map(({ skill, min_level }) => ({ skill, min_level }))
        : [],
    };
  };
  const editStep = (s: Step): StepInput => ({
    ...s,
    description: s.description ?? "",
    skills: c.skills
      .filter((k) => k.step_id === s.id)
      .map(({ skill, min_level }) => ({ skill, min_level })),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Career paths</h1>
          <p className="text-sm text-muted-foreground">
            Paths up through the organisation, step by step, and the moves sideways between them.
            Each step says what skills it asks for, so everyone can see how ready they are for the
            next one. Everyone in the organisation can see and edit them.
          </p>
        </div>
        <Button onClick={() => setTrackDialog({ name: "", description: "" })}>
          <Plus className="mr-1 h-4 w-4" /> New path
        </Button>
      </div>

      <Tabs value={tab} onValueChange={chooseTab}>
        <TabsList>
          <TabsTrigger value="paths">Paths ({c.tracks.length})</TabsTrigger>
          <TabsTrigger value="people">People ({c.assignments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="paths">
          {careersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : c.tracks.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
              <RouteIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold">Start your first career path</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                For example "Software engineering": Junior developer, Developer, Senior developer,
                Lead.
              </p>
              <Button
                className="mt-4"
                onClick={() => setTrackDialog({ name: "", description: "" })}
              >
                <Plus className="mr-1 h-4 w-4" /> New path
              </Button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-3">
              {c.tracks.map((t) => {
                const steps = stepsOf(t.id);
                return (
                  <section
                    key={t.id}
                    className="flex w-80 shrink-0 flex-col gap-2 rounded-2xl border-2 border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-semibold">{t.name}</h2>
                        {t.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Edit ${t.name}`}
                        onClick={() =>
                          setTrackDialog({
                            id: t.id,
                            name: t.name,
                            description: t.description ?? "",
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setStepDialog(newStep(t))}>
                      <Plus className="mr-1 h-4 w-4" /> Add a step at the top
                    </Button>
                    {/* The ladder, its top step first. */}
                    {[...steps].reverse().map((s, i) => {
                      const asks = c.skills.filter((k) => k.step_id === s.id);
                      const here = c.assignments.filter((a) => a.step_id === s.id);
                      const out = c.moves.filter((m) => m.from_step === s.id);
                      const range = salaryRange(s);
                      return (
                        <div key={s.id}>
                          {i > 0 && (
                            <ArrowUp
                              aria-hidden
                              className="mx-auto mb-1 h-4 w-4 text-muted-foreground"
                            />
                          )}
                          <div className="space-y-1.5 rounded-xl border-2 border-border bg-background p-2.5">
                            <div className="flex items-start gap-1">
                              <span className="rounded bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                                {s.level}
                              </span>
                              <button
                                type="button"
                                onClick={() => setStepDialog(editStep(s))}
                                className="min-w-0 flex-1 text-left text-sm font-semibold hover:underline"
                              >
                                {s.name}
                              </button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                aria-label={`Add a move sideways from ${s.name}`}
                                title="Add a move sideways"
                                onClick={() => setMoveDialog({ from: s, to: "", note: "" })}
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {range && <p className="text-xs text-muted-foreground">{range}</p>}
                            {asks.length > 0 && (
                              <ul className="flex flex-wrap gap-1">
                                {asks.map((k) => (
                                  <li
                                    key={k.skill}
                                    className="rounded-full border border-border px-1.5 text-[11px]"
                                  >
                                    {k.skill} · {skillLevelLabel(k.min_level, levelNames)}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {here.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {here
                                  .map((a) => people.find((p) => p.id === a.person_id)?.name)
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            )}
                            {out.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center gap-1 rounded-lg bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                                title={m.note ?? undefined}
                              >
                                <ArrowRight className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">
                                  {stepLabel(m.to_step)}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remove the move to ${stepLabel(m.to_step)}`}
                                  disabled={busy}
                                  onClick={() => run(() => deleteMove(m.id), "Removed the move")}
                                  className="rounded p-0.5 hover:bg-sky-200 dark:hover:bg-sky-900"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {steps.length === 0 && (
                      <p className="text-sm text-muted-foreground">No steps yet.</p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Going up a path is a vertical move; <ArrowRight className="inline h-3 w-3" /> adds a
            horizontal move to a step on another path. Click a step to edit it.
          </p>
        </TabsContent>

        <TabsContent value="people">
          <PeopleTab
            c={c}
            people={people}
            memberSkills={memberSkills}
            levelNames={levelNames}
            stepLabel={stepLabel}
            busy={busy}
            onAssign={(personId, stepId) =>
              run(
                () => assign(orgId, personId, stepId, new Date().toISOString().slice(0, 10)),
                stepId ? "Saved the step" : "Taken off the paths",
              )
            }
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!trackDialog} onOpenChange={(o) => !o && setTrackDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trackDialog?.id ? "Edit the path" : "New career path"}</DialogTitle>
            <DialogDescription>A ladder of steps, such as Software engineering.</DialogDescription>
          </DialogHeader>
          {trackDialog && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!trackDialog.name.trim()) return;
                if (
                  await run(
                    () => saveTrack(orgId, { ...trackDialog, position: c.tracks.length }),
                    trackDialog.id ? "Saved the path" : `Added ${trackDialog.name.trim()}`,
                  )
                )
                  setTrackDialog(null);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="track-name">Name</Label>
                <Input
                  id="track-name"
                  autoFocus
                  maxLength={MAX_NAME}
                  value={trackDialog.name}
                  onChange={(e) => setTrackDialog({ ...trackDialog, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="track-desc">Description (optional)</Label>
                <Textarea
                  id="track-desc"
                  rows={2}
                  maxLength={1000}
                  value={trackDialog.description}
                  onChange={(e) => setTrackDialog({ ...trackDialog, description: e.target.value })}
                />
              </div>
              <DialogFooter className="gap-2">
                {trackDialog.id && (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    onClick={() => {
                      const id = trackDialog.id!;
                      setConfirm({
                        title: `Delete ${trackDialog.name}?`,
                        text: "Its steps, their moves and who is on them are deleted too. This can't be undone.",
                        action: async () => {
                          if (await run(() => deleteTrack(id), "Deleted the path"))
                            setTrackDialog(null);
                        },
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setTrackDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !trackDialog.name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <StepDialog
        value={stepDialog}
        onChange={setStepDialog}
        skillNames={skillNames}
        levelNames={levelNames}
        busy={busy}
        trackName={
          stepDialog ? (c.tracks.find((t) => t.id === stepDialog.track_id)?.name ?? "") : ""
        }
        onSave={async (s) => {
          if (
            await run(() => saveStep(orgId, s), s.id ? "Saved the step" : `Added ${s.name.trim()}`)
          )
            setStepDialog(null);
        }}
        onDelete={(s) =>
          setConfirm({
            title: `Delete ${s.name}?`,
            text: "Its moves and who is on it are deleted too. This can't be undone.",
            action: async () => {
              if (await run(() => deleteStep(s.id!), "Deleted the step")) setStepDialog(null);
            },
          })
        }
      />

      <Dialog open={!!moveDialog} onOpenChange={(o) => !o && setMoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A move sideways from {moveDialog?.from.name}</DialogTitle>
            <DialogDescription>
              A horizontal move: to a step on another path, such as from Senior developer to Product
              manager.
            </DialogDescription>
          </DialogHeader>
          {moveDialog && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!moveDialog.to) return;
                if (
                  await run(
                    () => addMove(orgId, moveDialog.from.id, moveDialog.to, moveDialog.note),
                    "Added the move",
                  )
                )
                  setMoveDialog(null);
              }}
            >
              <div className="space-y-1.5">
                <Label>To</Label>
                <Select
                  value={moveDialog.to}
                  onValueChange={(v) => setMoveDialog({ ...moveDialog, to: v })}
                >
                  <SelectTrigger aria-label="To">
                    <SelectValue placeholder="Pick a step" />
                  </SelectTrigger>
                  <SelectContent>
                    {c.tracks.map((t) => {
                      const options = stepsOf(t.id).filter(
                        (s) =>
                          s.id !== moveDialog.from.id &&
                          !c.moves.some(
                            (m) => m.from_step === moveDialog.from.id && m.to_step === s.id,
                          ),
                      );
                      return options.length ? (
                        <SelectGroup key={t.id}>
                          <SelectLabel>{t.name}</SelectLabel>
                          {options.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.level}. {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="move-note">Note (optional)</Label>
                <Textarea
                  id="move-note"
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Usually after a year in a product team"
                  value={moveDialog.note}
                  onChange={(e) => setMoveDialog({ ...moveDialog, note: e.target.value })}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setMoveDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !moveDialog.to}>
                  Add
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

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

function StepDialog({
  value,
  onChange,
  skillNames,
  levelNames,
  busy,
  trackName,
  onSave,
  onDelete,
}: {
  value: StepInput | null;
  onChange: (s: StepInput | null) => void;
  skillNames: string[];
  levelNames: string[];
  busy: boolean;
  trackName: string;
  onSave: (s: StepInput) => void;
  onDelete: (s: StepInput) => void;
}) {
  const [min, setMin] = useState<string | null>(null);
  const [max, setMax] = useState<string | null>(null);
  const s = value;
  if (!s) return null;
  const minText = min ?? (s.salary_min === null ? "" : String(s.salary_min));
  const maxText = max ?? (s.salary_max === null ? "" : String(s.salary_max));
  const minN = parseNum(minText);
  const maxN = parseNum(maxText);
  const bad =
    Number.isNaN(minN) || Number.isNaN(maxN) || (minN !== null && maxN !== null && maxN < minN);
  const set = (patch: Partial<StepInput>) => onChange({ ...s, ...patch });
  const free = skillNames.filter((n) => !s.skills.some((k) => k.skill === n));
  const close = () => {
    setMin(null);
    setMax(null);
    onChange(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s.id ? "Edit the step" : "Add a step"}</DialogTitle>
          <DialogDescription>On the path {trackName}.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!s.name.trim() || bad) return;
            onSave({ ...s, salary_min: minN, salary_max: maxN });
            setMin(null);
            setMax(null);
          }}
        >
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="step-name">Name</Label>
              <Input
                id="step-name"
                autoFocus
                maxLength={MAX_NAME}
                placeholder="e.g. Senior developer"
                value={s.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="step-level">Step</Label>
              <Input
                id="step-level"
                type="number"
                min={1}
                max={100}
                value={s.level}
                onChange={(e) =>
                  set({ level: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step-desc">What the step means (optional)</Label>
            <Textarea
              id="step-desc"
              rows={2}
              className="min-h-[3.25rem]"
              maxLength={MAX_DESCRIPTION}
              value={s.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Salary range (optional)</Label>
            <div className="grid grid-cols-[1fr_1fr_5.5rem_7rem] gap-2">
              <Input
                inputMode="decimal"
                placeholder="From"
                aria-label="Salary from"
                value={minText}
                onChange={(e) => setMin(e.target.value)}
              />
              <Input
                inputMode="decimal"
                placeholder="To"
                aria-label="Salary to"
                value={maxText}
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
            {bad && (
              <p className="text-xs text-destructive">Use numbers, and "to" at least "from".</p>
            )}
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
                        skills: s.skills.map((x, j) =>
                          j === i ? { ...x, min_level: Number(v) } : x,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-36" aria-label={`Level of ${k.skill}`}>
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
                <SelectTrigger aria-label="Add a skill">
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
          <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 gap-2 border-t border-border bg-background px-6 py-3">
            {s.id && (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto"
                onClick={() => onDelete(s)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !s.name.trim() || bad}>
              {s.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeopleTab({
  c,
  people,
  memberSkills,
  levelNames,
  stepLabel,
  busy,
  onAssign,
}: {
  c: Careers;
  people: { id: string; name: string }[];
  memberSkills: Map<string, Skill[]>;
  levelNames: string[];
  stepLabel: (id: string) => string;
  busy: boolean;
  onAssign: (personId: string, stepId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = people.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  const asks = (stepId: string) => c.skills.filter((k) => k.step_id === stepId);
  const missingText = (m: ReturnType<typeof readiness>["missing"]) =>
    m
      .map(
        (x) =>
          `${x.skill}: ${skillLevelLabel(x.need, levelNames)}${x.have ? ` (now ${skillLevelLabel(x.have, levelNames)})` : " (not yet)"}`,
      )
      .join("\n");

  return (
    <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          Put each person on their step. Readiness compares their skills on the Skills page with
          what the next step asks for; point at it to see what is missing.
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a person"
          aria-label="Find a person"
          className="h-8 sm:max-w-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Person</th>
              <th className="py-2 pr-3 font-semibold">Step now</th>
              <th className="py-2 pr-3 font-semibold">Up the path</th>
              <th className="py-2 font-semibold">Sideways</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const a = c.assignments.find((x) => x.person_id === p.id);
              const has = memberSkills.get(p.id) ?? [];
              const next = a ? nextSteps(c, a.step_id) : null;
              const up = next?.up ? readiness(has, asks(next.up.id)) : null;
              const side = (next?.sideways ?? [])
                .map((x) => ({ ...x, r: readiness(has, asks(x.step.id)) }))
                .sort((x, y) => y.r.pct - x.r.pct);
              return (
                <tr key={p.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-medium">{p.name}</td>
                  <td className="py-2 pr-3">
                    <Select
                      value={a?.step_id ?? NONE}
                      disabled={busy}
                      onValueChange={(v) => onAssign(p.id, v === NONE ? null : v)}
                    >
                      <SelectTrigger className="h-8 w-56" aria-label={`Step of ${p.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not on a path</SelectItem>
                        {c.tracks.map((t) => (
                          <SelectGroup key={t.id}>
                            <SelectLabel>{t.name}</SelectLabel>
                            {c.steps
                              .filter((s) => s.track_id === t.id)
                              .sort((x, y) => x.level - y.level)
                              .map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.level}. {s.name}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 pr-3">
                    {!a ? (
                      <span className="text-muted-foreground">—</span>
                    ) : next?.up && up ? (
                      <ReadinessBar label={next.up.name} r={up} missing={missingText(up.missing)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">At the top of the path</span>
                    )}
                  </td>
                  <td className="py-2">
                    {side.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        {side.slice(0, 3).map((x) => (
                          <ReadinessBar
                            key={x.move.id}
                            label={stepLabel(x.step.id)}
                            r={x.r}
                            missing={missingText(x.r.missing)}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {people.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No one in People yet.</p>
        )}
      </div>
    </div>
  );
}

function ReadinessBar({
  label,
  r,
  missing,
}: {
  label: string;
  r: ReturnType<typeof readiness>;
  missing: string;
}) {
  return (
    <div className="w-56" title={missing ? `Missing:\n${missing}` : "Has every skill it asks for"}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium">{label}</span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            r.pct === 100 && "font-semibold text-emerald-700 dark:text-emerald-300",
          )}
        >
          {r.total ? `${r.met}/${r.total} skills` : "no skills asked"}
        </span>
      </div>
      <Progress value={r.pct} className="mt-0.5 h-1.5" />
    </div>
  );
}
