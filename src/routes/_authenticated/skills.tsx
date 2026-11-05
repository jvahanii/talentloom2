import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GripVertical, Trash2, X } from "lucide-react";
import { addOrgSkill, fetchOrgSkills, orgSkillListKey, removeOrgSkill } from "@/lib/orgSkills";
import { getMyProfileId } from "@/lib/auth";
import {
  fetchLearningGroups,
  groupOf,
  learnTogether,
  learningGroupsKey,
  leaveLearningGroup,
  type LearningGroup,
} from "@/lib/learning";
import { updatePersonSkills } from "@/lib/people.functions";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import {
  readSkills,
  skillLevelLabel,
  skillLevelColor,
  SKILL_LEVEL_VALUES,
  type Skill,
  type SkillLevel,
} from "@/lib/skills";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
import { orgSkillNamesKey, useOrgSkillNames } from "@/hooks/useOrgSkillNames";
import { SkillNameInput } from "@/components/SkillsInput";
import { ManualSkillMerge, SkillMergeSuggestions } from "@/components/SkillMergeSuggestions";
import { canonicalSkillName } from "@/lib/skills";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => ({ meta: [{ title: "Skills — Talentloom" }] }),
  component: SkillsPage,
});

type PersonSkills = {
  userId: string;
  name: string | null;
  email: string | null;
  skills: { name: string; level: SkillLevel | null }[];
};

type SkillGroup = {
  name: string;
  people: { userId: string; label: string; level: SkillLevel | null }[];
  /** Set when the skill is on the organisation's own list (it may have no holders). */
  listId?: string;
};

function SkillsPage() {
  const { orgId, orgs, can } = useOrg();
  const levelNames = useSkillLevelNames();
  const knownSkills = useOrgSkillNames();
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "this organisation";
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [addTo, setAddTo] = useState<Record<string, { person: string; level: string }>>({});
  // Learning together: drag a name onto another in the same skill, or tap one and then the other.
  const [picked, setPicked] = useState<{ userId: string; skill: string } | null>(null);
  const [dragging, setDragging] = useState<{ userId: string; skill: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const learning = useQuery({
    queryKey: learningGroupsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchLearningGroups(orgId!),
  });
  const learningGroups = learning.data ?? [];

  const linkPeople = async (skill: string, mover: string, target: string) => {
    setPicked(null);
    if (!orgId || mover === target) return;
    setBusy(true);
    try {
      const created = await learnTogether({
        orgId,
        topic: skill,
        mover,
        target,
        me: await getMyProfileId(),
        groups: learningGroups,
      });
      const who = (id: string) => {
        const p = people.data?.find((x) => x.userId === id);
        return p?.name || p?.email || "Someone";
      };
      if (created) toast.success(`${who(mover)} is learning ${skill} with ${who(target)}`);
      else toast.info("They already learn this together");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link them");
    } finally {
      await qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) });
      setBusy(false);
    }
  };

  const leaveGroup = async (group: LearningGroup, userId: string) => {
    setBusy(true);
    try {
      await leaveLearningGroup(group, userId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the group");
    } finally {
      await qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) });
      setBusy(false);
    }
  };

  const save = async (userId: string, change: (list: Skill[]) => Skill[], ok?: string) => {
    const person = people.data?.find((p) => p.userId === userId);
    if (!person || !orgId) return false;
    setBusy(true);
    try {
      await updatePersonSkills({ data: { orgId, userId, skills: change(person.skills) } });
      await qc.invalidateQueries({ queryKey: ["org-skills", orgId] });
      void qc.invalidateQueries({ queryKey: orgSkillNamesKey(orgId) });
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toLevel = (v: string) => (v ? (Number(v) as SkillLevel) : null);
  const addSkill = (userId: string, name: string, level: SkillLevel | null) =>
    save(
      userId,
      (list) =>
        list.some((s) => s.name.toLowerCase() === name.toLowerCase())
          ? list.map((s) => (s.name.toLowerCase() === name.toLowerCase() ? { ...s, level } : s))
          : [...list, { name, level }],
      "Skill saved",
    );
  const setLevel = (userId: string, name: string, level: SkillLevel | null) =>
    save(userId, (list) =>
      list.map((s) => (s.name.toLowerCase() === name.toLowerCase() ? { ...s, level } : s)),
    );
  const removeSkill = async (userId: string, name: string) => {
    const ok = await save(
      userId,
      (list) => list.filter((s) => s.name.toLowerCase() !== name.toLowerCase()),
      "Removed",
    );
    // Without the skill there's nothing to learn together in it.
    const group = groupOf(learningGroups, name, userId);
    if (ok && group) await leaveGroup(group, userId);
  };
  const selectCls =
    "h-9 rounded-full border-2 border-border bg-background px-3 text-sm disabled:opacity-50";

  const people = useQuery({
    queryKey: ["org-skills", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PersonSkills[]> => {
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("org_id", orgId!);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("id, full_name, email, skills, skill_levels")
        .in("id", ids);
      if (pError) throw pError;
      return (
        (profiles ?? []) as unknown as {
          id: string;
          full_name: string | null;
          email: string | null;
          skills: string[] | null;
          skill_levels: unknown;
        }[]
      ).map((p) => ({
        userId: p.id,
        name: p.full_name,
        email: p.email,
        skills: readSkills(p.skills, p.skill_levels),
      }));
    },
  });

  const orgSkills = useQuery({
    queryKey: orgSkillListKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgSkills(orgId!),
  });

  const groups = useMemo<SkillGroup[]>(() => {
    const bySkill = new Map<string, SkillGroup>();
    for (const p of people.data ?? []) {
      const label = p.name || p.email || "Unnamed";
      for (const s of p.skills) {
        const key = s.name.toLowerCase();
        let g = bySkill.get(key);
        if (!g) {
          g = { name: s.name, people: [] };
          bySkill.set(key, g);
        }
        g.people.push({ userId: p.userId, label, level: s.level });
      }
    }
    // Skills on the organisation's list show even when nobody has them yet.
    for (const o of orgSkills.data ?? []) {
      const g = bySkill.get(o.name.toLowerCase());
      if (g) g.listId = o.id;
      else bySkill.set(o.name.toLowerCase(), { name: o.name, people: [], listId: o.id });
    }
    const list = [...bySkill.values()];
    for (const g of list) {
      g.people.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.label.localeCompare(b.label));
    }
    list.sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));
    return list;
  }, [people.data, orgSkills.data]);

  const canManageList = can("change_titles");

  const refreshList = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: orgSkillListKey(orgId) }),
      qc.invalidateQueries({ queryKey: orgSkillNamesKey(orgId) }),
    ]);

  const addToList = async (name: string) => {
    if (!orgId) return false;
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      toast.info(`${name} is already in the organisation's skills`);
      return true;
    }
    setBusy(true);
    try {
      await addOrgSkill(orgId, name, await getMyProfileId());
      await refreshList();
      toast.success(`Added ${name} to the organisation's skills`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the skill");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const removeFromList = async (id: string, name: string) => {
    setBusy(true);
    try {
      await removeOrgSkill(id);
      await refreshList();
      toast.success(`Removed ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the skill");
    } finally {
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const q = filter.trim().toLowerCase();
  const visible = q
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.people.some((p) => p.label.toLowerCase().includes(q)),
      )
    : groups;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Every skill in {orgName}, who has it, and at what level.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          To have people learn a skill together, drag a name onto another name in the same skill —
          or tap one name and then the other.
        </p>
      </div>

      {can("change_titles") && (
        <>
          <SkillMergeSuggestions
            orgId={orgId}
            skills={groups.map((g) => ({ name: g.name, count: g.people.length }))}
          />
          <ManualSkillMerge
            orgId={orgId}
            skills={groups.map((g) => ({ name: g.name, count: g.people.length }))}
          />
        </>
      )}

      <form
        className="flex flex-col gap-2 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = canonicalSkillName(knownSkills, newSkill);
          if (!name) return;
          if (!newPerson) {
            if (canManageList && (await addToList(name))) setNewSkill("");
            return;
          }
          if (await addSkill(newPerson, name, toLevel(newLevel))) {
            setNewSkill("");
            setNewLevel("");
          }
        }}
      >
        <span className="text-sm font-semibold">
          {canManageList ? "Add a skill" : "Add a skill to a person"}
        </span>
        <SkillNameInput
          value={newSkill}
          onChange={setNewSkill}
          placeholder="Skill, e.g. Facilitation"
          className="sm:w-72"
        />
        <select
          className={selectCls}
          value={newPerson}
          onChange={(e) => setNewPerson(e.target.value)}
          aria-label="Person"
        >
          <option value="">
            {canManageList ? "Nobody yet — just add the skill" : "Choose a person"}
          </option>
          {(people.data ?? []).map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name || p.email || "Unnamed"}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={newLevel}
          onChange={(e) => setNewLevel(e.target.value)}
          aria-label="Level"
        >
          <option value="">No level</option>
          {SKILL_LEVEL_VALUES.map((l) => (
            <option key={l} value={l}>
              {skillLevelLabel(l, levelNames)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy || !newSkill.trim() || (!newPerson && !canManageList)}>
          Add
        </Button>
      </form>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find a skill or a person"
        className="max-w-sm"
        aria-label="Find a skill or a person"
      />

      {people.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!people.isLoading && visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">{q ? "Nothing matches" : "No skills yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Try a different word."
              : "Add the first skill above — each person's skills show up here grouped by skill."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((g) => (
          <div key={g.name} className="rounded-2xl border-2 border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate font-semibold">{g.name}</h2>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {g.people.length} {g.people.length === 1 ? "person" : "people"}
                {canManageList && g.listId && !g.people.length && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeFromList(g.listId!, g.name)}
                    className="rounded-md p-1 hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${g.name} from the organisation's skills`}
                    title="Remove from the organisation's skills"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </div>
            {!g.people.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Nobody has this skill yet. Add someone below.
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {g.people.map((p) => {
                const key = `${g.name}|${p.userId}`;
                const isPicked = picked?.skill === g.name && picked.userId === p.userId;
                const canDrop =
                  (dragging?.skill === g.name && dragging.userId !== p.userId) ||
                  (picked?.skill === g.name && picked.userId !== p.userId);
                const together = groupOf(learningGroups, g.name, p.userId);
                return (
                  <li
                    key={p.userId}
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "link";
                      e.dataTransfer.setData("text/plain", p.label);
                      setDragging({ userId: p.userId, skill: g.name });
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropOn(null);
                    }}
                    onDragOver={(e) => {
                      if (dragging?.skill !== g.name || dragging.userId === p.userId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "link";
                      if (dropOn !== key) setDropOn(key);
                    }}
                    onDragLeave={() => dropOn === key && setDropOn(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragging;
                      setDragging(null);
                      setDropOn(null);
                      if (from && from.skill === g.name)
                        void linkPeople(g.name, from.userId, p.userId);
                    }}
                    className={`-mx-1.5 flex items-center justify-between gap-2 rounded-lg px-1.5 py-0.5 text-sm transition-colors ${
                      dropOn === key
                        ? "bg-primary/20 ring-2 ring-primary"
                        : isPicked
                          ? "bg-primary/10 ring-2 ring-primary/60"
                          : canDrop
                            ? "hover:bg-primary/10"
                            : ""
                    }`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (isPicked) setPicked(null);
                        else if (picked?.skill === g.name)
                          void linkPeople(g.name, picked.userId, p.userId);
                        else setPicked({ userId: p.userId, skill: g.name });
                      }}
                      className="flex min-w-0 cursor-grab items-center gap-1 text-left active:cursor-grabbing"
                      title={
                        picked?.skill === g.name && !isPicked
                          ? `Learn ${g.name} together with this person`
                          : "Drag onto someone to learn together, or tap and then tap someone"
                      }
                      aria-pressed={isPicked}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{p.label}</span>
                      {together && (
                        <span
                          className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"
                          title="Learning together"
                        >
                          {learningGroups
                            .filter((x) => x.topic.toLowerCase() === g.name.toLowerCase())
                            .indexOf(together) + 1}
                        </span>
                      )}
                    </button>
                    <span className="flex shrink-0 items-center gap-1">
                      <select
                        className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium ${skillLevelColor(p.level)}`}
                        value={p.level ?? ""}
                        disabled={busy}
                        onChange={(e) => setLevel(p.userId, g.name, toLevel(e.target.value))}
                        aria-label={`${p.label} level in ${g.name}`}
                      >
                        <option value="">no level</option>
                        {SKILL_LEVEL_VALUES.map((l) => (
                          <option key={l} value={l}>
                            {skillLevelLabel(l, levelNames)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeSkill(p.userId, g.name)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                        aria-label={`Remove ${g.name} from ${p.label}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            {(() => {
              const known = new Map(g.people.map((p) => [p.userId, p.label]));
              const together = learningGroups
                .filter((x) => x.topic.toLowerCase() === g.name.toLowerCase())
                .map((x) => ({ ...x, members: x.members.filter((m) => known.has(m)) }));
              if (!together.length) return null;
              return (
                <div className="mt-3 space-y-1.5 border-t-2 border-dashed border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground">Learning with</p>
                  {together.map((lg, i) => (
                    <div key={lg.id} className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="rounded-full bg-primary/15 px-1.5 font-semibold text-primary">
                        {i + 1}
                      </span>
                      {lg.members.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5"
                        >
                          {known.get(m)}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const full = learningGroups.find((x) => x.id === lg.id);
                              if (full) void leaveGroup(full, m);
                            }}
                            className="rounded-full text-muted-foreground hover:text-destructive"
                            aria-label={`Take ${known.get(m)} out of this learning group`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const others = (people.data ?? []).filter(
                (p) => !g.people.some((x) => x.userId === p.userId),
              );
              if (!others.length) return null;
              const st = addTo[g.name] ?? { person: "", level: "" };
              const set = (v: Partial<typeof st>) =>
                setAddTo((a) => ({ ...a, [g.name]: { ...st, ...v } }));
              return (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-border pt-3">
                  <select
                    className={`${selectCls} min-w-0 flex-1`}
                    value={st.person}
                    onChange={(e) => set({ person: e.target.value })}
                    aria-label={`Add person to ${g.name}`}
                  >
                    <option value="">+ Add person</option>
                    {others.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.name || p.email || "Unnamed"}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={st.level}
                    onChange={(e) => set({ level: e.target.value })}
                    aria-label="Level"
                  >
                    <option value="">No level</option>
                    {SKILL_LEVEL_VALUES.map((l) => (
                      <option key={l} value={l}>
                        {skillLevelLabel(l, levelNames)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || !st.person}
                    onClick={async () => {
                      if (await addSkill(st.person, g.name, toLevel(st.level)))
                        set({ person: "", level: "" });
                    }}
                  >
                    Add
                  </Button>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
