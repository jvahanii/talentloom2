import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import {
  MAX_TEAM_DESCRIPTION,
  MAX_TEAM_NAME,
  addToTeam,
  createTeam,
  deleteTeam,
  fetchTeams,
  removeFromTeam,
  teamsKey,
  updateTeam,
  type Team,
} from "@/lib/teams";
import {
  readSkills,
  skillLevelColor,
  skillLevelLabel,
  type Skill,
  type SkillLevel,
} from "@/lib/skills";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — Talentloom" }] }),
  component: TeamsPage,
});

type Member = { userId: string; label: string; skills: Skill[] };

/** A skill in a team: who has it, and the highest level among them. */
type TeamSkill = {
  name: string;
  best: SkillLevel | null;
  holders: { label: string; level: SkillLevel | null }[];
};

function teamSkills(memberIds: string[], people: Member[]): TeamSkill[] {
  const byKey = new Map<string, TeamSkill>();
  for (const p of people) {
    if (!memberIds.includes(p.userId)) continue;
    for (const s of p.skills) {
      const key = s.name.toLowerCase();
      const entry = byKey.get(key) ?? { name: s.name, best: null, holders: [] };
      entry.holders.push({ label: p.label, level: s.level });
      if (s.level !== null && (entry.best === null || s.level > entry.best)) entry.best = s.level;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.holders.length - a.holders.length ||
      (b.best ?? 0) - (a.best ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

const selectCls =
  "h-9 min-w-0 rounded-xl border border-input bg-white/70 px-2 text-sm outline-none focus:border-teal-500 dark:bg-white/5";

function TeamsPage() {
  const { orgId, orgs, can } = useOrg();
  const canManage = can("change_titles");
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "this organisation";
  const qc = useQueryClient();

  const teams = useQuery({
    queryKey: teamsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchTeams(orgId!),
  });

  const members = useQuery({
    queryKey: ["org-team-people", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Member[]> => {
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("org_id", orgId!);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        // The skill columns live in the external database; Lovable regenerates types.ts without them.
        .select("id, full_name, email, skills, skill_levels" as "id, full_name, email")
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
      )
        .map((p) => ({
          userId: p.id,
          label: p.full_name || p.email || "Unnamed",
          skills: readSkills(p.skills, p.skill_levels),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the teams");
      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: teamsKey(orgId) });
      setBusy(false);
    }
  };

  if (!orgId) return null;

  const people = members.data ?? [];
  const label = new Map(people.map((p) => [p.userId, p.label]));
  const inATeam = new Set((teams.data ?? []).flatMap((t) => t.members));
  const withoutTeam = people.filter((p) => !inATeam.has(p.userId));

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if ((teams.data ?? []).some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("There's already a team with that name");
      return;
    }
    if (await run(() => createTeam(orgId, trimmed, description), `Created ${trimmed}`)) {
      setName("");
      setDescription("");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="text-sm text-muted-foreground">
          The teams in {orgName} and who is in each. A person can be in several teams.
          {!canManage && " Your title lets you see the teams but not change them."}
        </p>
      </div>

      {canManage && (
        <form
          className="space-y-2 rounded-2xl border-2 border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <p className="font-medium">Create a team</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name, e.g. Customer success"
              maxLength={MAX_TEAM_NAME}
              className="sm:max-w-xs"
              aria-label="Team name"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the team does (optional)"
              maxLength={MAX_TEAM_DESCRIPTION}
              className="min-w-0 flex-1"
              aria-label="Team description"
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Create
            </Button>
          </div>
        </form>
      )}

      {teams.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!teams.isLoading && !(teams.data ?? []).length && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No teams yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Create the first team above, then add people to it here or on the People page."
              : "Someone who can manage people can create teams."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(teams.data ?? []).map((t) => (
          <TeamCard
            key={t.id}
            orgId={orgId}
            team={t}
            people={people}
            label={label}
            canManage={canManage}
            busy={busy}
            run={run}
          />
        ))}
      </div>

      {!!(teams.data ?? []).length && withoutTeam.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-4">
          <p className="text-sm font-semibold">Not in a team yet</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {withoutTeam.map((p) => (
              <span key={p.userId} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({
  orgId,
  team,
  people,
  label,
  canManage,
  busy,
  run,
}: {
  orgId: string;
  team: Team;
  people: Member[];
  label: Map<string, string>;
  canManage: boolean;
  busy: boolean;
  run: (action: () => Promise<void>, ok?: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState("");
  const others = people.filter((p) => !team.members.includes(p.userId));
  const members = team.members
    .filter((m) => label.has(m))
    .sort((a, b) => (label.get(a) ?? "").localeCompare(label.get(b) ?? ""));

  const rename = (value: string) => {
    const next = value.trim();
    if (!next || next === team.name) return;
    void run(() => updateTeam(team.id, { name: next }), "Team renamed");
  };
  const describe = (value: string) => {
    const next = value.trim() || null;
    if (next === (team.description ?? null)) return;
    void run(() => updateTeam(team.id, { description: next }));
  };

  return (
    <div className="flex flex-col rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-start gap-2">
        {canManage ? (
          <input
            defaultValue={team.name}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            maxLength={MAX_TEAM_NAME}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-semibold outline-none hover:border-input focus:border-teal-500"
            aria-label="Team name"
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate font-semibold">{team.name}</h2>
        )}
        <span className="shrink-0 pt-1 text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"}
        </span>
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Delete the team "${team.name}"? Its people stay in the organisation.`,
                )
              ) {
                void run(() => deleteTeam(team.id), `Deleted ${team.name}`);
              }
            }}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${team.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {canManage ? (
        <textarea
          defaultValue={team.description ?? ""}
          onBlur={(e) => describe(e.target.value)}
          placeholder="Add a description"
          maxLength={MAX_TEAM_DESCRIPTION}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm text-muted-foreground outline-none hover:border-input focus:border-teal-500"
          aria-label={`Description of ${team.name}`}
        />
      ) : (
        team.description && <p className="mt-1 text-sm text-muted-foreground">{team.description}</p>
      )}

      <ul className="mt-2 flex-1 space-y-1">
        {members.map((m) => (
          <li key={m} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{label.get(m)}</span>
            {canManage && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => removeFromTeam(team.id, m), `${label.get(m)} left ${team.name}`)
                }
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                aria-label={`Take ${label.get(m)} out of ${team.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        {!members.length && <li className="text-sm text-muted-foreground">Nobody yet</li>}
      </ul>

      {members.length > 0 && <TeamSkills skills={teamSkills(members, people)} />}

      {canManage && others.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 border-t-2 border-dashed border-border pt-3">
          <select
            className={`${selectCls} flex-1`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            aria-label={`Add a person to ${team.name}`}
          >
            <option value="">+ Add person</option>
            {others.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy || !adding}
            onClick={async () => {
              if (await run(() => addToTeam(orgId, team.id, adding), `Added to ${team.name}`)) {
                setAdding("");
              }
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** Every skill someone in the team has, coloured by the best level in the team. */
function TeamSkills({ skills }: { skills: TeamSkill[] }) {
  const levelNames = useSkillLevelNames();
  return (
    <div className="mt-3 border-t-2 border-dashed border-border pt-3">
      <p className="text-xs font-semibold text-muted-foreground">Skills in the team</p>
      {skills.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {skills.map((s) => (
            <span
              key={s.name}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${skillLevelColor(s.best)}`}
              title={s.holders
                .map(
                  (h) =>
                    `${h.label}${h.level !== null ? ` · ${skillLevelLabel(h.level, levelNames)}` : ""}`,
                )
                .join("\n")}
            >
              {s.name}
              {s.holders.length > 1 && (
                <span className="ml-1 opacity-70">· {s.holders.length}</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Nobody in the team has added skills yet.
        </p>
      )}
    </div>
  );
}
