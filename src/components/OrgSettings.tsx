import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg, PERMISSION_GROUPS, PERMISSIONS, permColumn, type OrgTitle, type Permission } from "@/lib/org";
import { toast } from "sonner";
import { Copy, Plus, Trash2, UserPlus } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

interface MemberRow {
  id: string;
  user_id: string;
  title_id: string | null;
  title_name: string | null;
  name: string | null;
  isSelf: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  title_id: string | null;
  token: string;
  expires_at: string;
}

function useTitles(orgId: string | null) {
  return useQuery({
    queryKey: ["org-titles", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgTitle[]> => {
      const { data, error } = await supabase
        .from("organization_titles")
        .select("*")
        .eq("org_id", orgId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrgTitle[];
    },
  });
}

const PROTECTED_TITLES = ["Owner", "Admin"];
const isProtectedTitle = (n?: string | null) => !!n && PROTECTED_TITLES.includes(n);

export function OrgSettings() {
  const qc = useQueryClient();
  const { orgId, title, orgs, refresh, can } = useOrg();
  const isOwner = title === "Owner";
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "";


  const [name, setName] = useState(orgName);
  useEffect(() => setName(orgName), [orgName]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTitle, setInviteTitle] = useState<string>("");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const titles = useTitles(orgId);
  const titleById = new Map((titles.data ?? []).map((t) => [t.id, t]));

  useEffect(() => {
    if (!inviteTitle && titles.data?.length) {
      const member = titles.data.find((t) => t.name === "Member") ?? titles.data[titles.data.length - 1];
      setInviteTitle(member!.id);
    }
  }, [titles.data, inviteTitle]);

  const members = useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data: u } = await supabase.auth.getUser();
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("id, user_id, title_id, organization_titles(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] };
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (rows ?? []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        title_id: r.title_id,
        title_name: (r as unknown as { organization_titles: { name: string } | null }).organization_titles?.name ?? null,
        name: nameById.get(r.user_id) ?? null,
        isSelf: r.user_id === u.user?.id,
      }));
    },
  });

  const invites = useQuery({
    queryKey: ["org-invites", orgId],
    enabled: !!orgId && can("invite_users"),
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from("organization_invites")
        .select("id, email, title_id, token, expires_at")
        .eq("org_id", orgId!)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  const renameOrg = async () => {
    if (!orgId || !name.trim() || name.trim() === orgName) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("organizations").update({ name: name.trim() }).eq("id", orgId);
      if (error) throw error;
      toast.success("Organisation renamed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    if (!orgId || !inviteEmail.trim() || !inviteTitle) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({ org_id: orgId, email: inviteEmail.trim(), title_id: inviteTitle, invited_by: u.user.id })
        .select("token")
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/invite/${data.token}`;
      setLastInviteLink(link);
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
      toast.success("Invite created — share the link below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setBusy(false);
    }
  };

  const changeTitle = async (memberId: string, titleId: string) => {
    const { error } = await supabase.from("organization_members").update({ title_id: titleId }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Title updated");
      qc.invalidateQueries({ queryKey: ["org-members", orgId] });
      refresh();
    }
  };

  const removeMember = async (m: MemberRow) => {
    const label = m.isSelf ? "Leave this organisation?" : `Remove ${m.name ?? "this user"}?`;
    if (!window.confirm(label)) return;
    const { error } = await supabase.from("organization_members").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else {
      toast.success(m.isSelf ? "You left the organisation" : "User removed");
      if (m.isSelf) refresh();
      qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    }
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase.from("organization_invites").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  if (!orgId) return null;

  return (
    <div className="glass rounded-2xl p-5 lg:col-span-2">
      <h3 className="font-display font-semibold">Organisation</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage this organisation and who can access it. Your title here:{" "}
        <span className="font-medium">{title ?? "—"}</span>.
      </p>

      {can("rename_org") && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Organisation name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={renameOrg}
            disabled={busy || !name.trim() || name.trim() === orgName}
            className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Rename
          </button>
        </div>
      )}

      <div className="mt-6">
        <h4 className="text-sm font-semibold">Users</h4>
        <ul className="mt-2 divide-y divide-border">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? "Unnamed teammate"}
                  {m.isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </p>
              </div>
              {can("change_titles") && (isOwner || !isProtectedTitle(m.title_name)) ? (
                <select
                  value={m.title_id ?? ""}
                  onChange={(e) => changeTitle(m.id, e.target.value)}
                  className="rounded-lg border border-input bg-white/70 px-2 py-1 text-xs dark:bg-white/5"
                >
                  {!m.title_id && <option value="">No title</option>}
                  {(titles.data ?? [])
                    .filter((t) => isOwner || !isProtectedTitle(t.name) || t.id === m.title_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              ) : (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                  {m.title_name ?? "No title"}
                </span>
              )}
              {((can("remove_users") && (isOwner || !isProtectedTitle(m.title_name))) || m.isSelf) && (
                <button
                  onClick={() => removeMember(m)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={m.isSelf ? "Leave organisation" : "Remove user"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

            </li>
          ))}
        </ul>
      </div>

      {can("invite_users") && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold">Invite a teammate</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            They'll need an account with this email address. Links expire after 7 days.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className={inputCls + " min-w-52 flex-1"}
            />
            <select
              value={inviteTitle}
              onChange={(e) => setInviteTitle(e.target.value)}
              className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm dark:bg-white/5"
            >
              {(titles.data ?? [])
                .filter((t) => (isOwner ? t.name !== "Owner" : !isProtectedTitle(t.name)))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}

            </select>
            <button
              onClick={createInvite}
              disabled={busy || !inviteEmail.trim() || !inviteTitle}
              className="btn-teal inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" /> Create invite
            </button>
          </div>

          {lastInviteLink && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs">{lastInviteLink}</p>
              <button onClick={() => copy(lastInviteLink)} className="shrink-0 rounded-md p-1.5 hover:bg-primary/15" aria-label="Copy invite link">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}

          {(invites.data ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {(invites.data ?? []).map((inv) => (
                <li key={inv.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {inv.email} · {inv.title_id ? titleById.get(inv.title_id)?.name ?? "Title" : "No title"} · expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => copy(`${window.location.origin}/invite/${inv.token}`)}
                    className="rounded-md p-1 hover:bg-muted"
                    aria-label="Copy invite link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => revokeInvite(inv.id)} className="rounded-md p-1 hover:bg-destructive/10 hover:text-destructive" aria-label="Revoke invite">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {can("manage_titles") && <TitlesPanel orgId={orgId} titles={titles.data ?? []} />}
    </div>
  );
}

function TitlesPanel({ orgId, titles }: { orgId: string; titles: OrgTitle[] }) {
  const qc = useQueryClient();
  const { refresh } = useOrg();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["org-titles", orgId] });
    qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    refresh();
  };

  const addTitle = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const allPerms = Object.fromEntries(PERMISSIONS.map((p) => [permColumn(p), true]));
      const { error } = await supabase.from("organization_titles").insert({
        org_id: orgId,
        name: newName.trim(),
        sort_order: 100,
        ...allPerms,
      } as never);

      if (error) throw error;
      setNewName("");
      toast.success("Title added");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add title");
    } finally {
      setBusy(false);
    }
  };

  const togglePerm = async (t: OrgTitle, p: Permission, value: boolean) => {
    const col = permColumn(p);
    const key = ["org-titles", orgId] as const;
    const previous = qc.getQueryData<OrgTitle[]>(key);

    // optimistic update
    qc.setQueryData<OrgTitle[]>(key, (old) =>
      (old ?? []).map((row) => (row.id === t.id ? { ...row, [col]: value } : row)),
    );

    const { error } = await supabase
      .from("organization_titles")
      .update({ [col]: value } as never)
      .eq("id", t.id);

    if (error) {
      qc.setQueryData<OrgTitle[]>(key, previous);
      toast.error(error.message);
    } else {
      reload();
    }
  };

  const renameTitle = async (t: OrgTitle, value: string) => {
    if (!value.trim() || value.trim() === t.name) return;
    const { error } = await supabase.from("organization_titles").update({ name: value.trim() }).eq("id", t.id);
    if (error) toast.error(error.message);
    else reload();
  };

  const deleteTitle = async (t: OrgTitle) => {
    if (!window.confirm(`Delete the "${t.name}" title?`)) return;
    const { error } = await supabase.from("organization_titles").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Title deleted");
      reload();
    }
  };

  return (
    <div className="mt-8">
      <h4 className="text-sm font-semibold">Titles & permissions</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Define the titles used in this organisation and exactly what each one can do.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New title, e.g. Talent Lead"
          className={inputCls + " min-w-52 flex-1"}
        />
        <button
          onClick={addTitle}
          disabled={busy || !newName.trim()}
          className="btn-teal inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add title
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {titles
          .filter((t) => t.name === "Owner")
          .map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                always full access
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Owners have every permission, including creating and removing admins. This title can't be changed.
              </p>
            </div>
          ))}
        {titles
          .filter((t) => t.name !== "Owner")
          .map((t) => (

          <div key={t.id} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <input
                defaultValue={t.name}
                onBlur={(e) => renameTitle(t, e.target.value)}
                className="min-w-40 flex-1 rounded-lg border border-input bg-white/70 px-2 py-1 text-sm font-medium dark:bg-white/5"
              />
              {t.is_system && (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  built-in
                </span>
              )}
              {!t.is_system && (
                <button
                  onClick={() => deleteTitle(t)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  <div className="mt-1 space-y-1">
                    {g.items.map((item) => (
                      <label key={item.key} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean((t as unknown as Record<string, boolean>)[permColumn(item.key)])}
                          onChange={(e) => togglePerm(t, item.key, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-teal-600"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
