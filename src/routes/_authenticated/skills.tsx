import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { updatePersonSkills } from "@/lib/people.functions";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { readSkills, skillLevelLabel, SKILL_LEVEL_VALUES, type Skill, type SkillLevel } from "@/lib/skills";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
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
};

const levelBadge = (level: SkillLevel | null) =>
  level === null
    ? "bg-secondary text-muted-foreground"
    : [
        "",
        "bg-[#FFE9A8] text-[#7A5C00]", // 1 butter
        "bg-[#BDF5E0] text-[#0B6B4F]", // 2 mint
        "bg-[#CDBCF5] text-[#4A3A7A]", // 3 lavender
        "bg-[#FF9EC7] text-[#7A1F4B]", // 4 bubblegum
      ][level];

function SkillsPage() {
  const { orgId, orgs } = useOrg();
  const levelNames = useSkillLevelNames();
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "this organisation";
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [addTo, setAddTo] = useState<Record<string, { person: string; level: string }>>({});

  const save = async (userId: string, change: (list: Skill[]) => Skill[], ok?: string) => {
    const person = people.data?.find((p) => p.userId === userId);
    if (!person || !orgId) return false;
    setBusy(true);
    try {
      await updatePersonSkills({ data: { orgId, userId, skills: change(person.skills) } });
      await qc.invalidateQueries({ queryKey: ["org-skills", orgId] });
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
  const removeSkill = (userId: string, name: string) =>
    save(userId, (list) => list.filter((s) => s.name.toLowerCase() !== name.toLowerCase()), "Removed");
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
    const list = [...bySkill.values()];
    for (const g of list) {
      g.people.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.label.localeCompare(b.label));
    }
    list.sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));
    return list;
  }, [people.data]);

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
      </div>

      <form
        className="flex flex-col gap-2 rounded-2xl border-2 border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = newSkill.trim();
          if (!name || !newPerson) return;
          if (await addSkill(newPerson, name, toLevel(newLevel))) {
            setNewSkill("");
            setNewLevel("");
          }
        }}
      >
        <span className="text-sm font-semibold">Add a skill to a person</span>
        <Input
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          placeholder="Skill, e.g. Facilitation"
          maxLength={60}
          className="sm:max-w-xs"
          aria-label="Skill name"
        />
        <select className={selectCls} value={newPerson} onChange={(e) => setNewPerson(e.target.value)} aria-label="Person">
          <option value="">Choose a person</option>
          {(people.data ?? []).map((p) => (
            <option key={p.userId} value={p.userId}>{p.name || p.email || "Unnamed"}</option>
          ))}
        </select>
        <select className={selectCls} value={newLevel} onChange={(e) => setNewLevel(e.target.value)} aria-label="Level">
          <option value="">No level</option>
          {SKILL_LEVEL_VALUES.map((l) => (
            <option key={l} value={l}>{skillLevelLabel(l, levelNames)}</option>
          ))}
        </select>
        <Button type="submit" disabled={busy || !newSkill.trim() || !newPerson}>Add</Button>
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
              <span className="shrink-0 text-xs text-muted-foreground">
                {g.people.length} {g.people.length === 1 ? "person" : "people"}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {g.people.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{p.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <select
                      className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium ${levelBadge(p.level)}`}
                      value={p.level ?? ""}
                      disabled={busy}
                      onChange={(e) => setLevel(p.userId, g.name, toLevel(e.target.value))}
                      aria-label={`${p.label} level in ${g.name}`}
                    >
                      <option value="">no level</option>
                      {SKILL_LEVEL_VALUES.map((l) => (
                        <option key={l} value={l}>{skillLevelLabel(l, levelNames)}</option>
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
              ))}
            </ul>
            {(() => {
              const others = (people.data ?? []).filter((p) => !g.people.some((x) => x.userId === p.userId));
              if (!others.length) return null;
              const st = addTo[g.name] ?? { person: "", level: "" };
              const set = (v: Partial<typeof st>) => setAddTo((a) => ({ ...a, [g.name]: { ...st, ...v } }));
              return (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-border pt-3">
                  <select className={`${selectCls} min-w-0 flex-1`} value={st.person} onChange={(e) => set({ person: e.target.value })} aria-label={`Add person to ${g.name}`}>
                    <option value="">+ Add person</option>
                    {others.map((p) => (
                      <option key={p.userId} value={p.userId}>{p.name || p.email || "Unnamed"}</option>
                    ))}
                  </select>
                  <select className={selectCls} value={st.level} onChange={(e) => set({ level: e.target.value })} aria-label="Level">
                    <option value="">No level</option>
                    {SKILL_LEVEL_VALUES.map((l) => (
                      <option key={l} value={l}>{skillLevelLabel(l, levelNames)}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || !st.person}
                    onClick={async () => {
                      if (await addSkill(st.person, g.name, toLevel(st.level))) set({ person: "", level: "" });
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
