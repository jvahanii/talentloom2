import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Link2, Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { getMyProfileId } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { addPersonToOrg, updatePersonName, updatePersonSkills } from "@/lib/people.functions";
import { SkillsInput } from "@/components/SkillsInput";
import { sendInviteEmail } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({ meta: [{ title: "People — Talentloom" }] }),
  component: PeoplePage,
});

const PROTECTED_TITLES = ["Owner", "Admin"];
const isProtected = (name?: string | null) => !!name && PROTECTED_TITLES.includes(name);

type Person = {
  memberId: string;
  userId: string;
  name: string | null;
  email: string | null;
  skills: string[];
  titleId: string | null;
  titleName: string | null;
  joinedAt: string;
  accountCreatedAt: string | null;
  isSelf: boolean;
};

const selectCls =
  "h-9 rounded-xl border border-input bg-white/70 px-2 text-sm outline-none focus:border-teal-500 dark:bg-white/5";
const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy — select and copy manually");
  }
}
const td = "px-3 py-2 align-middle text-sm";

function PeoplePage() {
  const qc = useQueryClient();
  const { orgId, orgs, title, role, can, refresh } = useOrg();
  const isOwner = title === "Owner" || role === "owner";
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "this organisation";

  const titles = useQuery({
    queryKey: ["org-titles", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_titles")
        .select("id, name")
        .eq("org_id", orgId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const people = useQuery({
    queryKey: ["org-people", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Person[]> => {
      const me = await getMyProfileId();
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("id, user_id, title_id, created_at, organization_titles(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, email, skills, created_at")
            .in("id", ids)
        : { data: [] };
      const byId = new Map(
        (
          (profiles ?? []) as {
            id: string;
            full_name: string | null;
            email: string | null;
            skills: string[] | null;
            created_at: string;
          }[]
        ).map((p) => [p.id, p]),
      );
      return (rows ?? []).map((r) => {
        const p = byId.get(r.user_id);
        return {
          memberId: r.id,
          userId: r.user_id,
          name: p?.full_name ?? null,
          email: p?.email ?? null,
          skills: p?.skills ?? [],
          titleId: r.title_id,
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
    enabled: !!orgId && can("invite_users"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_invites")
        .select("id, email, title_id, token, expires_at")
        .eq("org_id", orgId!)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        email: string | null;
        title_id: string | null;
        token: string;
        expires_at: string;
      }[];
    },
  });

  // Add / invite form
  const [email, setEmail] = useState("");
  const [titleId, setTitleId] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!titleId && titles.data?.length) {
      setTitleId(
        (titles.data.find((t) => t.name === "Member") ?? titles.data[titles.data.length - 1]).id,
      );
    }
  }, [titles.data, titleId]);

  // Shareable invite link
  const [linkTitleId, setLinkTitleId] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  useEffect(() => {
    if (!linkTitleId && titles.data?.length) {
      setLinkTitleId(
        (titles.data.find((t) => t.name === "Member") ?? titles.data[titles.data.length - 1]).id,
      );
    }
  }, [titles.data, linkTitleId]);

  // Name and skill editing
  const [names, setNames] = useState<Record<string, string>>({});
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    void qc.invalidateQueries({ queryKey: ["org-people", orgId] });
    void qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  };

  if (!orgId) return null;
  const titleName = new Map((titles.data ?? []).map((t) => [t.id, t.name]));
  const assignable = (titles.data ?? []).filter((t) => isOwner || !isProtected(t.name));
  // A link anyone can use never grants Owner, and grants Admin only when an owner makes it.
  const linkable = assignable.filter((t) => t.name !== "Owner");

  const createLink = async () => {
    if (!linkTitleId) return;
    setCreatingLink(true);
    try {
      const me = await getMyProfileId();
      if (!me) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({
          org_id: orgId,
          email: null as unknown as string,
          title_id: linkTitleId,
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

  const addPerson = async () => {
    if (!email.trim() || !titleId) return;
    setAdding(true);
    try {
      const r = await addPersonToOrg({ data: { orgId, email: email.trim(), titleId } });
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

  const saveSkills = async (p: Person, skills: string[]) => {
    setSkillDrafts((d) => ({ ...d, [p.userId]: skills }));
    try {
      await updatePersonSkills({ data: { orgId, userId: p.userId, skills } });
      await qc.invalidateQueries({ queryKey: ["org-people", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the skills");
    } finally {
      setSkillDrafts((d) => {
        const { [p.userId]: _done, ...rest } = d;
        return rest;
      });
    }
  };

  const changeTitle = async (p: Person, newTitleId: string) => {
    setBusy(p.memberId);
    const { error } = await supabase
      .from("organization_members")
      .update({ title_id: newTitleId })
      .eq("id", p.memberId);
    setBusy(null);
    if (error) return void toast.error(error.message);
    toast.success("Title updated");
    reload();
    refresh();
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in {orgName}, and the invites waiting for an answer.
        </p>
      </div>

      {can("invite_users") && (
        <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
          <p className="font-medium">Add or invite a person</p>
          <p className="text-xs text-muted-foreground">
            If the email already has a Talentloom account, they're added straight away. Otherwise
            they're emailed an invite that expires in 7 days.
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
            <select
              className={selectCls}
              value={titleId}
              onChange={(e) => setTitleId(e.target.value)}
              aria-label="Title"
            >
              {assignable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button onClick={addPerson} disabled={adding || !email.trim() || !titleId}>
              <UserPlus className="mr-1 h-4 w-4" /> {adding ? "Adding…" : "Add"}
            </Button>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">Or share an invite link</p>
            <p className="text-xs text-muted-foreground">
              Anyone with the link can join with the chosen title until it expires in 7 days. Share
              it only with people you trust.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className={selectCls}
                value={linkTitleId}
                onChange={(e) => setLinkTitleId(e.target.value)}
                aria-label="Title for people joining with the link"
              >
                {linkable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={createLink}
                disabled={creatingLink || !linkTitleId}
              >
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
      )}

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find people by name, email or skill"
        className="max-w-sm"
        aria-label="Find people"
      />

      <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
        <table className="w-full min-w-[960px] border-collapse">
          <thead className="border-b border-border">
            <tr>
              {["Name", "Email", "Title", "Skills", "Joined", "Account created", ""].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.isLoading && (
              <tr>
                <td className={td} colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {(people.data ?? [])
              .filter((p) => {
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return [p.name ?? "", p.email ?? "", ...p.skills].some((v) =>
                  v.toLowerCase().includes(q),
                );
              })
              .map((p) => {
                const canEditName = p.isSelf || can("change_titles");
                const canEditTitle = can("change_titles") && (isOwner || !isProtected(p.titleName));
                const canRemove =
                  p.isSelf || (can("remove_users") && (isOwner || !isProtected(p.titleName)));
                const draft = names[p.userId];
                const changed =
                  draft !== undefined && draft.trim() !== (p.name ?? "") && draft.trim() !== "";
                return (
                  <tr key={p.memberId}>
                    <td className={td}>
                      {canEditName ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={draft ?? p.name ?? ""}
                            placeholder="No name"
                            onChange={(e) =>
                              setNames((n) => ({ ...n, [p.userId]: e.target.value }))
                            }
                            onKeyDown={(e) => e.key === "Enter" && void saveName(p)}
                            className="h-9 min-w-40"
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
                        </div>
                      ) : (
                        <span className="font-medium">{p.name || "—"}</span>
                      )}
                      {p.isSelf && <span className="text-xs text-muted-foreground">you</span>}
                    </td>
                    <td className={td}>{p.email || "—"}</td>
                    <td className={td}>
                      {canEditTitle ? (
                        <select
                          className={selectCls}
                          value={p.titleId ?? ""}
                          disabled={busy === p.memberId}
                          onChange={(e) => changeTitle(p, e.target.value)}
                          aria-label={`Title of ${p.name ?? p.email ?? "member"}`}
                        >
                          {!p.titleId && <option value="">No title</option>}
                          {assignable
                            .concat(
                              p.titleId && !assignable.some((t) => t.id === p.titleId)
                                ? [{ id: p.titleId, name: p.titleName ?? "Title" }]
                                : [],
                            )
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        (p.titleName ?? "—")
                      )}
                    </td>
                    <td className={`${td} min-w-56`}>
                      {canEditName ? (
                        <SkillsInput
                          value={skillDrafts[p.userId] ?? p.skills}
                          onChange={(next) => saveSkills(p, next)}
                          placeholder="Add a skill"
                        />
                      ) : p.skills.length ? (
                        <div className="flex flex-wrap gap-1">
                          {p.skills.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(p.joinedAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {p.accountCreatedAt ? formatDate(p.accountCreatedAt) : "—"}
                    </td>
                    <td className={td}>
                      {canRemove && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {can("invite_users") && (invites.data ?? []).length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
          <p className="font-medium">Waiting for an answer</p>
          <ul className="divide-y divide-border">
            {(invites.data ?? []).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {inv.email ?? "Shareable link"} ·{" "}
                  {inv.title_id ? (titleName.get(inv.title_id) ?? "Title") : "No title"} · expires{" "}
                  {formatDate(inv.expires_at)}
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
    </div>
  );
}
