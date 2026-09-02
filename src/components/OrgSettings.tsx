import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, type OrgRole } from "@/lib/org";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

const INVITE_ROLES: OrgRole[] = ["admin", "member", "viewer"];
const ALL_ROLES: OrgRole[] = ["owner", "admin", "member", "viewer"];

interface MemberRow {
  id: string;
  user_id: string;
  role: OrgRole;
  name: string | null;
  isSelf: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expires_at: string;
}

export function OrgSettings() {
  const qc = useQueryClient();
  const { orgId, role, orgs, refresh } = useOrg();
  const isAdmin = role === "owner" || role === "admin";
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "";

  const [name, setName] = useState(orgName);
  useEffect(() => setName(orgName), [orgName]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const members = useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data: u } = await supabase.auth.getUser();
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role")
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
        role: r.role as OrgRole,
        name: nameById.get(r.user_id) ?? null,
        isSelf: r.user_id === u.user?.id,
      }));
    },
  });

  const invites = useQuery({
    queryKey: ["org-invites", orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from("organization_invites")
        .select("id, email, role, token, expires_at")
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
      toast.success("Workspace renamed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    if (!orgId || !inviteEmail.trim()) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({ org_id: orgId, email: inviteEmail.trim(), role: inviteRole, invited_by: u.user.id })
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

  const changeRole = async (memberId: string, newRole: OrgRole) => {
    const { error } = await supabase.from("organization_members").update({ role: newRole }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    }
  };

  const removeMember = async (m: MemberRow) => {
    const label = m.isSelf ? "Leave this workspace?" : `Remove ${m.name ?? "this member"}?`;
    if (!window.confirm(label)) return;
    const { error } = await supabase.from("organization_members").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else {
      toast.success(m.isSelf ? "You left the workspace" : "Member removed");
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
      <h3 className="font-display font-semibold">Workspace</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage this workspace and who can access it. Your role here: <span className="font-medium capitalize">{role}</span>.
      </p>

      {isAdmin && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Workspace name</span>
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
        <h4 className="text-sm font-semibold">Members</h4>
        <ul className="mt-2 divide-y divide-border">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? "Unnamed teammate"}
                  {m.isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </p>
              </div>
              {isAdmin && !(m.isSelf && m.role === "owner") ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
                  className="rounded-lg border border-input bg-white/70 px-2 py-1 text-xs dark:bg-white/5"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs capitalize">{m.role}</span>
              )}
              {(isAdmin || m.isSelf) && !(m.isSelf && m.role === "owner") && (
                <button
                  onClick={() => removeMember(m)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={m.isSelf ? "Leave workspace" : "Remove member"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
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
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm dark:bg-white/5"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={createInvite}
              disabled={busy || !inviteEmail.trim()}
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
                    {inv.email} · <span className="capitalize">{inv.role}</span> · expires {new Date(inv.expires_at).toLocaleDateString()}
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
    </div>
  );
}
