import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { readSkills, skillLevelLabel, type SkillLevel } from "@/lib/skills";
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
              : "Skills are added on the People page — each person's skills show up here grouped by skill."}
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
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${levelBadge(p.level)}`}
                  >
                    {p.level === null ? "no level" : skillLevelLabel(p.level, levelNames)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
