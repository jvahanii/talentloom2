import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import {
  useOrg,
  PERMISSION_GROUPS,
  PERMISSIONS,
  permColumn,
  type OrgTitle,
  type Permission,
} from "@/lib/org";
import { toast } from "sonner";
import { RequiredIndicator } from "@/components/ui/label";
import { Plus, Trash2, UsersRound } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

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

export function OrgSettings() {
  const { orgId, title, role, orgs, refresh, can } = useOrg();
  const isOwner = title === "Owner";
  const canDeleteOrg = isOwner || role === "owner";
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "";

  const [name, setName] = useState(orgName);
  useEffect(() => setName(orgName), [orgName]);

  const [busy, setBusy] = useState(false);

  const titles = useTitles(orgId);

  const renameOrg = async () => {
    if (!orgId || !name.trim() || name.trim() === orgName) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim() })
        .eq("id", orgId);
      if (error) throw error;
      toast.success("Organisation renamed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  };

  if (!orgId) return null;

  return (
    <div className="glass rounded-2xl p-5 lg:col-span-2">
      <h3 className="font-display font-semibold">Organisation</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage this organisation and who can access it. Your title here:{" "}
        <span className="font-medium">
          {orgs.find((o) => o.org_id === orgId)?.viaSuperuser ? "Superuser (not a member)" : (title ?? "—")}
        </span>
        .
      </p>

      {can("rename_org") && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Organisation name <RequiredIndicator />
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
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

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
        <UsersRound className="h-5 w-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          Members, their titles and invitations are managed on the People page.
        </p>
        <Link to="/people" className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold">
          Go to People
        </Link>
      </div>

      {can("manage_titles") && <TitlesPanel orgId={orgId} titles={titles.data ?? []} />}

      {canDeleteOrg && <DeleteOrgPanel orgId={orgId} orgName={orgName} />}
    </div>
  );
}

/** Owners can delete the organisation; they must type its name to confirm. */
function DeleteOrgPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = confirmName.trim() === orgName.trim() && !!orgName.trim();

  const deleteOrg = async () => {
    if (!matches) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only an owner can delete this organisation");
      try {
        window.localStorage.removeItem("talently:current-org");
      } catch {
        /* ignore */
      }
      toast.success(`Deleted ${orgName}`);
      // Full reload so every org-scoped view drops the deleted organisation.
      window.location.assign("/pipeline");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete the organisation");
      setDeleting(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border-2 border-destructive/40 p-4">
      <h4 className="font-semibold text-destructive">Delete organisation</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently deletes <span className="font-medium text-foreground">{orgName}</span> with all
        its candidates, positions, pipeline history, organisation surveys and invites, and removes
        everyone from it. This can't be undone.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block min-w-52 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Type the organisation name to confirm
          </span>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={orgName}
            className={inputCls}
          />
        </label>
        <button
          onClick={deleteOrg}
          disabled={!matches || deleting}
          className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete organisation"}
        </button>
      </div>
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
    const { error } = await supabase
      .from("organization_titles")
      .update({ name: value.trim() })
      .eq("id", t.id);
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
        <label className="min-w-52 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Title <RequiredIndicator />
          </span>
          <input
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New title, e.g. Talent Lead"
            className={inputCls + " w-full"}
          />
        </label>
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
                Owners have every permission, including creating and removing admins. This title
                can't be changed.
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
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </p>
                    <div className="mt-1 space-y-1">
                      {g.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(
                              (t as unknown as Record<string, boolean>)[permColumn(item.key)],
                            )}
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
