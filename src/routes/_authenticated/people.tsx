import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, History, Link2, Mail, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { getMyProfileId } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { addPersonToOrg, updatePersonName, updatePersonSkills } from "@/lib/people.functions";
import { SkillsInput } from "@/components/SkillsInput";
import { PersonSalaryDialog } from "@/components/PersonSalaryDialog";
import { fetchMemberSkills, setMemberSkillLevel } from "@/lib/skillLevels";
import { skillLevelLabel, type Skill } from "@/lib/skills";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";
import { orgSkillNamesKey } from "@/hooks/useOrgSkillNames";
import { addToTeam, fetchTeams, removeFromTeam, teamsKey, type Team } from "@/lib/teams";
import {
  fetchLearningGroups,
  groupOf,
  learnTogether,
  learningGroupsKey,
  leaveLearningGroup,
  type LearningGroup,
} from "@/lib/learning";
import {
  currentSalaryOf,
  fetchOrgSalaries,
  formatSalary,
  formatSignedPct,
  groupSalariesByUser,
  orgSalariesKey,
  salaryDelta,
  type SalaryEntry,
} from "@/lib/salaries";
import { sendInviteEmail } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "People — Talentloom" }] }),
  component: PeoplePage,
});

type Person = {
  memberId: string;
  userId: string;
  name: string | null;
  email: string | null;
  skills: Skill[];
  titleName: string | null;
  joinedAt: string;
  accountCreatedAt: string | null;
  isSelf: boolean;
};

const selectCls =
  "h-9 rounded-xl border border-input bg-white/70 px-2 text-sm outline-none focus:border-teal-500 dark:bg-white/5";
const th = "py-2 text-xs font-semibold text-muted-foreground";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy — select and copy manually");
  }
}
// One row per person: five columns on wide screens, two on medium, stacked on phones.
const rowGrid =
  "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,1.35fr)_minmax(0,1.15fr)_minmax(0,0.9fr)] lg:gap-4";
const cellLabel = "mb-1 text-xs font-semibold text-muted-foreground lg:hidden";

function PeoplePage() {
  const qc = useQueryClient();
  const { orgId, orgs, refresh } = useOrg();
  const levelNames = useSkillLevelNames();
  const teams = useQuery({
    queryKey: teamsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchTeams(orgId!),
  });
  // The same "Learning with" groups as on the Skills page.
  const learning = useQuery({
    queryKey: learningGroupsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchLearningGroups(orgId!),
  });
  const salaries = useQuery({
    queryKey: orgSalariesKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgSalaries(orgId!),
  });
  const salariesByUser = useMemo(() => groupSalariesByUser(salaries.data ?? []), [salaries.data]);
  const [salaryPersonId, setSalaryPersonId] = useState<string | null>(null);
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "this organisation";

  const people = useQuery({
    queryKey: ["org-people", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Person[]> => {
      const me = await getMyProfileId();
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("id, user_id, created_at, organization_titles(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email, created_at").in("id", ids)
        : { data: [] };
      const byId = new Map(
        (
          (profiles ?? []) as unknown as {
            id: string;
            full_name: string | null;
            email: string | null;
            created_at: string;
          }[]
        ).map((p) => [p.id, p]),
      );
      // Levels are this organisation's own; the same skill may have none elsewhere.
      // Skills and levels are this organisation's own; other organisations keep theirs.
      const skillsOf = await fetchMemberSkills(orgId!, ids);
      return (rows ?? []).map((r) => {
        const p = byId.get(r.user_id);
        return {
          memberId: r.id,
          userId: r.user_id,
          name: p?.full_name ?? null,
          email: p?.email ?? null,
          skills: skillsOf.get(r.user_id) ?? [],
          titleName:
            (r as unknown as { organization_titles: { name: string } | null }).organization_titles
              ?.name ?? null,
          joinedAt: r.created_at as string,
          accountCreatedAt: p?.created_at ?? null,
          isSelf: r.user_id === me,
        };
      });
    },
  });

  const invites = useQuery({
    queryKey: ["org-invites", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_invites")
        .select("id, email, token, expires_at")
        .eq("org_id", orgId!)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        email: string | null;
        token: string;
        expires_at: string;
      }[];
    },
  });

  // Add / invite form
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  // Sign-up link: creates accounts; someone in the organisation then adds each person by hand.
  const [creatingLink, setCreatingLink] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const joinRequests = useQuery({
    queryKey: ["org-join-requests", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // list_join_requests lives in the external database; the generated types don't know it.
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc("list_join_requests", { _org: orgId });
      if (error) throw new Error(error.message);
      return (data ?? []) as {
        id: string;
        user_id: string;
        full_name: string | null;
        email: string | null;
        created_at: string;
      }[];
    },
  });

  // Name and skill editing
  const [names, setNames] = useState<Record<string, string>>({});
  const [skillDrafts, setSkillDrafts] = useState<Record<string, Skill[]>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    void qc.invalidateQueries({ queryKey: ["org-people", orgId] });
    void qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
    void qc.invalidateQueries({ queryKey: ["org-join-requests", orgId] });
    void qc.invalidateQueries({ queryKey: orgSalariesKey(orgId) });
  };

  if (!orgId) return null;
  const createLink = async () => {
    setCreatingLink(true);
    try {
      const me = await getMyProfileId();
      if (!me) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({
          org_id: orgId,
          email: null as unknown as string,
          invited_by: me,
        })
        .select("token")
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/invite/${data.token}`;
      setLastLink(link);
      await copyText(link);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setCreatingLink(false);
    }
  };

  const dismissRequest = async (id: string) => {
    // The table lives in the external database; the generated types don't know it.
    const db = supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await db.from("organization_join_requests").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    reload();
  };

  const addRequest = async (r: { id: string; email: string | null; full_name: string | null }) => {
    if (!r.email) return;
    setBusy(r.id);
    try {
      const res = await addPersonToOrg({ data: { orgId, email: r.email } });
      if (res.status === "invited") toast.info(`${r.email} was emailed an invite`);
      else if (res.status === "already") {
        toast.info(`${r.full_name || r.email} is already in ${orgName}`);
        await dismissRequest(r.id);
      } else toast.success(`${r.full_name || r.email} added to ${orgName}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the person");
    } finally {
      setBusy(null);
    }
  };
  const addPerson = async () => {
    if (!email.trim()) return;
    setAdding(true);
    try {
      const r = await addPersonToOrg({ data: { orgId, email: email.trim() } });
      if (r.status === "added") toast.success(`${r.name} added to ${orgName}`);
      else if (r.status === "already") toast.info(`${r.name} is already in ${orgName}`);
      else {
        try {
          await sendInviteEmail({ data: { inviteId: r.inviteId } });
          toast.success(`${r.email} has no account yet, so an invite was emailed`);
        } catch (e) {
          toast.error(
            `Invite created for ${r.email}, but the email couldn't be sent — copy its link below. (${e instanceof Error ? e.message : String(e)})`,
          );
        }
      }
      setEmail("");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the person");
    } finally {
      setAdding(false);
    }
  };

  const saveName = async (p: Person) => {
    const next = (names[p.userId] ?? "").trim();
    if (!next || next === (p.name ?? "")) return;
    setBusy(p.memberId);
    try {
      await updatePersonName({ data: { orgId, userId: p.userId, fullName: next } });
      toast.success("Name updated");
      setNames((n) => {
        const { [p.userId]: _done, ...rest } = n;
        return rest;
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the name");
    } finally {
      setBusy(null);
    }
  };

  const saveSkills = async (p: Person, skills: Skill[]) => {
    // Only a level changed: show it at once and save that one row.
    const changed = skills.filter((s, i) => p.skills[i]?.level !== s.level);
    if (
      skills.length === p.skills.length &&
      skills.every((s, i) => s.name === p.skills[i]?.name) &&
      changed.length === 1
    ) {
      const key = ["org-people", orgId];
      const before = qc.getQueryData<Person[]>(key);
      qc.setQueryData<Person[]>(key, (old) =>
        (old ?? []).map((x) => (x.userId === p.userId ? { ...x, skills } : x)),
      );
      try {
        await setMemberSkillLevel(orgId, p.userId, changed[0].name, changed[0].level);
      } catch (e) {
        qc.setQueryData(key, before);
        toast.error(e instanceof Error ? e.message : "Could not change the level");
      }
      return;
    }
    setSkillDrafts((d) => ({ ...d, [p.userId]: skills }));
    try {
      await updatePersonSkills({ data: { orgId, userId: p.userId, skills } });
      // Without the skill there's nothing to learn together in it.
      const kept = new Set(skills.map((s) => s.name.toLowerCase()));
      const dropped = p.skills.filter((s) => !kept.has(s.name.toLowerCase()));
      for (const s of dropped) {
        const group = groupOf(learning.data ?? [], s.name, p.userId);
        if (group) await leaveLearningGroup(group, p.userId);
      }
      if (dropped.length) await qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) });
      await qc.invalidateQueries({ queryKey: ["org-people", orgId] });
      void qc.invalidateQueries({ queryKey: orgSkillNamesKey(orgId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the skills");
    } finally {
      setSkillDrafts((d) => {
        const { [p.userId]: _done, ...rest } = d;
        return rest;
      });
    }
  };

  const remove = async (p: Person) => {
    const who = p.name || p.email || "this person";
    if (
      !window.confirm(
        p.isSelf ? `Leave ${orgName}?` : `Remove ${who} from ${orgName}? Their account stays.`,
      )
    )
      return;
    setBusy(p.memberId);
    const { error } = await supabase.from("organization_members").delete().eq("id", p.memberId);
    setBusy(null);
    if (error) return void toast.error(error.message);
    toast.success(p.isSelf ? `You left ${orgName}` : `${who} removed`);
    reload();
    if (p.isSelf) refresh();
  };

  const resend = async (id: string, to: string) => {
    try {
      await sendInviteEmail({ data: { inviteId: id } });
      toast.success(`Invite emailed to ${to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the invite");
    }
  };
  const revoke = async (id: string) => {
    const { error } = await supabase.from("organization_invites").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    reload();
  };
  const copyLink = (token: string) => copyText(`${window.location.origin}/invite/${token}`);

  const salaryPerson = salaryPersonId
    ? ((people.data ?? []).find((x) => x.userId === salaryPersonId) ?? null)
    : null;
  const nameOf = (uid: string) => {
    const found = (people.data ?? []).find((x) => x.userId === uid);
    return found?.name || found?.email || "Member";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in {orgName}, people who signed up with a link, and the invites and links that
          are still open.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
        <p className="font-medium">Add or invite a person</p>
        <p className="text-xs text-muted-foreground">
          Everyone you add is an Admin. If the email already has a Talentloom account, they're added
          straight away. Otherwise they're emailed an invite link that works once, only for that
          email address, and expires in 7 days. They are not added to any organisation until they
          open the link and sign in.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addPerson()}
            placeholder="name@company.com"
            className="min-w-56 flex-1"
            aria-label="Email"
          />
          <Button onClick={addPerson} disabled={adding || !email.trim()}>
            <UserPlus className="mr-1 h-4 w-4" /> {adding ? "Adding…" : "Add"}
          </Button>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium">Or share an invite link</p>
          <p className="text-xs text-muted-foreground">
            Send this link to anyone you want to invite. They create a Talentloom account with it,
            but they don't join this organisation until you add them here.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={createLink} disabled={creatingLink}>
              <Link2 className="mr-1 h-4 w-4" /> {creatingLink ? "Creating…" : "Create link"}
            </Button>
          </div>
          {lastLink && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs">{lastLink}</p>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => copyText(lastLink)}
                aria-label="Copy invite link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find people by name, email, skill or level"
        className="max-w-sm"
        aria-label="Find people"
      />

      <div className="rounded-2xl border-2 border-border bg-card">
        <div className={`hidden border-b border-border px-3 lg:grid ${rowGrid}`}>
          {["Person", "Title & teams", "Skills", "Learning with", "Salary"].map((h) => (
            <p key={h} className={th}>
              {h}
            </p>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {people.isLoading && <li className="p-3 text-sm">Loading…</li>}
          {(people.data ?? [])
            .filter((p) => {
              const q = filter.trim().toLowerCase();
              if (!q) return true;
              return [
                p.name ?? "",
                p.email ?? "",
                ...p.skills.map((s) => `${s.name} ${skillLevelLabel(s.level, levelNames) ?? ""}`),
              ].some((v) => v.toLowerCase().includes(q));
            })
            .map((p) => {
              const draft = names[p.userId];
              const changed =
                draft !== undefined && draft.trim() !== (p.name ?? "") && draft.trim() !== "";
              return (
                <li key={p.memberId} className={`grid gap-3 p-3 sm:grid-cols-2 ${rowGrid}`}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <>
                        <Input
                          value={draft ?? p.name ?? ""}
                          placeholder="No name"
                          onChange={(e) => setNames((n) => ({ ...n, [p.userId]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && void saveName(p)}
                          className="h-9 min-w-0 flex-1"
                          aria-label={`Name of ${p.email ?? "member"}`}
                          maxLength={200}
                        />
                        {changed && (
                          <Button
                            size="sm"
                            onClick={() => saveName(p)}
                            disabled={busy === p.memberId}
                          >
                            Save
                          </Button>
                        )}
                      </>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy === p.memberId}
                        onClick={() => remove(p)}
                        aria-label={
                          p.isSelf
                            ? "Leave organisation"
                            : `Remove ${p.name ?? p.email ?? "member"}`
                        }
                        title={p.isSelf ? "Leave organisation" : "Remove from organisation"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="break-all text-sm text-muted-foreground">
                      {p.email || "—"}
                      {p.isSelf && <span className="ml-1 text-xs">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDate(p.joinedAt)}
                      {p.accountCreatedAt && <> · account {formatDate(p.accountCreatedAt)}</>}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className={cellLabel}>Title & teams</p>
                    <p className="text-sm">{p.titleName ?? "—"}</p>
                    <PersonTeams orgId={orgId} person={p} teams={teams.data ?? []} />
                  </div>
                  <div className="min-w-0">
                    <p className={cellLabel}>Skills</p>
                    <SkillsInput
                      value={skillDrafts[p.userId] ?? p.skills}
                      onChange={(next) => saveSkills(p, next)}
                      placeholder="Add a skill"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={cellLabel}>Learning with</p>
                    <LearningWithCell
                      orgId={orgId}
                      person={p}
                      people={people.data ?? []}
                      groups={learning.data ?? []}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={cellLabel}>Salary</p>
                    <SalaryCell
                      person={p}
                      entries={salariesByUser.get(p.userId) ?? []}
                      onOpen={() => setSalaryPersonId(p.userId)}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      {(joinRequests.data ?? []).length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
          <p className="font-medium">Signed up with a link</p>
          <p className="text-xs text-muted-foreground">
            They have a Talentloom account but aren't in {orgName}. Add them, or dismiss them.
          </p>
          <ul className="divide-y divide-border">
            {(joinRequests.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {r.full_name || r.email}
                  {r.full_name && r.email ? ` · ${r.email}` : ""} · signed up{" "}
                  {formatDate(r.created_at)}
                </span>
                <Button
                  size="sm"
                  onClick={() => void addRequest(r)}
                  disabled={busy === r.id || !r.email}
                >
                  <UserPlus className="mr-1 h-4 w-4" /> Add
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void dismissRequest(r.id)}
                  title="Dismiss"
                  aria-label={`Dismiss ${r.full_name || r.email}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(invites.data ?? []).length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
          <p className="font-medium">Open invites and links</p>
          <ul className="divide-y divide-border">
            {(invites.data ?? []).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {inv.email ?? "Sign-up link"} · expires {formatDate(inv.expires_at)}
                </span>
                {inv.email && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => resend(inv.id, inv.email!)}
                    title="Email invite again"
                    aria-label="Email invite again"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyLink(inv.token)}
                  title="Copy invite link"
                  aria-label="Copy invite link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => revoke(inv.id)}
                  title="Revoke invite"
                  aria-label="Revoke invite"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <PersonSalaryDialog
        orgId={orgId}
        person={salaryPerson}
        entries={salaryPerson ? (salariesByUser.get(salaryPerson.userId) ?? []) : []}
        nameOf={nameOf}
        onClose={() => setSalaryPersonId(null)}
      />
    </div>
  );
}

/**
 * A person's "Learning with" groups, one per skill, with a way to leave each
 * and to start learning a skill with someone else who has it. Anyone in the
 * organisation can arrange these, as on the Skills page.
 */
function LearningWithCell({
  orgId,
  person,
  people,
  groups,
}: {
  orgId: string;
  person: Person;
  people: Person[];
  groups: LearningGroup[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [skill, setSkill] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  const label = (id: string) => {
    const p = people.find((x) => x.userId === id);
    return p?.name || p?.email || "Someone";
  };
  const mine = groups.filter((g) => g.members.includes(person.userId));
  const sameSkill = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const candidates = skill
    ? people.filter(
        (x) => x.userId !== person.userId && x.skills.some((s) => sameSkill(s.name, skill)),
      )
    : [];

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the learning group");
    } finally {
      await qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) });
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const created = await learnTogether({
        orgId,
        topic: skill,
        mover: person.userId,
        target: other,
        me: await getMyProfileId(),
        groups,
      });
      if (created)
        toast.success(`${label(person.userId)} is learning ${skill} with ${label(other)}`);
      else toast.info("They already learn this together");
      setAdding(false);
      setSkill("");
      setOther("");
    });

  return (
    <div className="space-y-1">
      {mine.map((g) => (
        <div
          key={g.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
        >
          <span className="truncate">
            <span className="font-semibold">{g.topic}:</span>{" "}
            {g.members
              .filter((m) => m !== person.userId)
              .map(label)
              .join(", ")}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => leaveLearningGroup(g, person.userId))}
            className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label={`Take ${label(person.userId)} out of the ${g.topic} learning group`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-center gap-1">
          <select
            className={selectCls}
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value);
              setOther("");
            }}
            aria-label="Skill to learn together"
          >
            <option value="">Skill…</option>
            {person.skills.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={other}
            disabled={!skill}
            onChange={(e) => setOther(e.target.value)}
            aria-label="Person to learn with"
          >
            <option value="">{skill && !candidates.length ? "Nobody else has it" : "With…"}</option>
            {candidates.map((x) => (
              <option key={x.userId} value={x.userId}>
                {x.name || x.email || "Unnamed"}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={add} disabled={busy || !skill || !other}>
            Add
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setAdding(false)}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : person.skills.length ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Learn with…
        </button>
      ) : (
        !mine.length && <span className="text-xs text-muted-foreground">Add a skill first</span>
      )}
    </div>
  );
}

/** The teams a person is in, with a way to add and remove them for people who can manage teams. */
function PersonTeams({ orgId, person, teams }: { orgId: string; person: Person; teams: Team[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mine = teams.filter((t) => t.members.includes(person.userId));
  const others = teams.filter((t) => !t.members.includes(person.userId));
  if (!mine.length && !others.length) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the teams");
    } finally {
      await qc.invalidateQueries({ queryKey: teamsKey(orgId) });
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {mine.map((t) => (
        <span
          key={t.id}
          className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
        >
          <span className="truncate">{t.name}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => removeFromTeam(t.id, person.userId))}
            className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label={`Take ${person.name ?? person.email ?? "this person"} out of ${t.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {others.length > 0 && (
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const teamId = e.target.value;
            if (teamId) void run(() => addToTeam(orgId, teamId, person.userId));
          }}
          className="h-6 max-w-36 rounded-full border border-dashed border-border bg-transparent px-1.5 text-xs text-primary outline-none"
          aria-label={`Add ${person.name ?? person.email ?? "this person"} to a team`}
        >
          <option value="">+ Team</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * A person's current salary in the People table. Clicking opens their full
 * salary change history and lets authorised editors change salaries.
 */
function SalaryCell({
  person,
  entries,
  onOpen,
}: {
  person: Person;
  entries: SalaryEntry[];
  onOpen: () => void;
}) {
  const current = currentSalaryOf(entries);
  const labelName = person.name || person.email || "this person";

  if (!current) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
        aria-label={`Add salary for ${labelName}`}
      >
        <>
          <Plus className="h-3.5 w-3.5" /> Add salary
        </>
      </button>
    );
  }

  const idx = entries.findIndex((e) => e.id === current.entry.id);
  const prev = idx >= 0 ? entries[idx + 1] : undefined;
  const delta = salaryDelta(current.entry, prev);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group -mx-2 -my-1 flex w-[calc(100%+1rem)] flex-col items-start rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View salary history for ${labelName}`}
      title="Click to view salary change history"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-foreground group-hover:text-primary">
          {formatSalary(current.entry.amount, current.entry.currency, current.entry.period)}
        </span>
        {current.scheduled && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
            Scheduled
          </span>
        )}
        {delta?.comparable && delta.pct !== null && delta.diff !== 0 && (
          <span
            className={
              delta.diff > 0
                ? "text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
                : "text-[11px] font-semibold tabular-nums text-rose-700 dark:text-rose-400"
            }
          >
            {formatSignedPct(delta.pct)}
          </span>
        )}
      </div>
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-foreground/75">
        <History className="h-3 w-3 shrink-0" />
        <span>
          {entries.length === 1
            ? `Since ${formatDate(current.entry.effective_date)}`
            : `${entries.length} entries · ${formatDate(current.entry.effective_date)}`}
        </span>
      </span>
    </button>
  );
}
