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
import { Copy, Link2, Plus, Trash2, Unlink, UsersRound } from "lucide-react";
import {
  connectSkillSpace,
  createSkillConnectionCode,
  disconnectSkillSpace,
  saveSkillLevelNames,
} from "@/lib/skillSpace.functions";
import { fetchSkillSpace, forgetSkillSpaces, skillSpaceKey } from "@/lib/skillLevels";
import { useSkillLevelNames, skillLevelNamesKey } from "@/hooks/useSkillLevelNames";
import {
  DEFAULT_SKILL_LEVEL_NAMES,
  MAX_SKILL_LEVEL_NAME_LENGTH,
  MAX_SKILL_LEVELS,
  MIN_SKILL_LEVELS,
  skillLevelColor,
} from "@/lib/skills";

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
  const isOwner = title === "Owner" || role === "owner";
  // Connecting organisations is for owners and admins (the server checks the same).
  const canConnect = isOwner || title === "Admin" || role === "admin";
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
          {orgs.find((o) => o.org_id === orgId)?.viaSuperuser
            ? "Superuser (not a member)"
            : (title ?? "—")}
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

      {can("rename_org") && <SkillLevelsPanel orgId={orgId} />}

      <SkillSpacePanel orgId={orgId} canConnect={canConnect} />

      {can("manage_titles") && <TitlesPanel orgId={orgId} titles={titles.data ?? []} />}
    </div>
  );
}

/**
 * Organisations connected to this one share its skill list, level names and
 * people's skills. Owners and admins connect with a code from the other
 * organisation, or create one for it, and can disconnect.
 */
function SkillSpacePanel({ orgId, canConnect }: { orgId: string; canConnect: boolean }) {
  const qc = useQueryClient();
  const space = useQuery({
    queryKey: skillSpaceKey(orgId),
    queryFn: () => fetchSkillSpace(orgId, true),
  });
  const others = (space.data?.orgs ?? []).filter((o) => o.id !== orgId);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [entered, setEntered] = useState("");
  const [busy, setBusy] = useState(false);

  /** Everything that shows skills reads the space again. */
  const refreshAll = async () => {
    forgetSkillSpaces();
    await qc.invalidateQueries();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const makeCode = () =>
    run(async () => {
      setCode(await createSkillConnectionCode({ data: { orgId } }));
    });

  const connect = () =>
    run(async () => {
      if (
        !window.confirm(
          "Connect to the organisation that gave you this code? Its skill list and level names are used for both, and the skills of people in both are combined (the higher level wins).",
        )
      ) {
        return;
      }
      const { connectedTo } = await connectSkillSpace({ data: { orgId, code: entered } });
      setEntered("");
      toast.success(`Connected to ${connectedTo}`);
      await refreshAll();
    });

  const disconnect = () =>
    run(async () => {
      if (
        !window.confirm(
          "Disconnect this organisation? It keeps a copy of the shared skill list, level names and its people's skills; from then on they're separate.",
        )
      ) {
        return;
      }
      await disconnectSkillSpace({ data: { orgId } });
      toast.success("Disconnected");
      await refreshAll();
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Code copied");
    } catch {
      toast.error("Couldn't copy — select and copy it manually");
    }
  };

  return (
    <div className="mt-8">
      <h4 className="text-sm font-semibold">Connected organisations</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Connected organisations share their skill list, skill level names and people's skills:
        someone in several of them has one list of skills for all. Each organisation still sees only
        its own people, and teams and learning groups stay separate.
      </p>

      {others.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">Connected with</span>
          {others.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
            >
              <Link2 className="h-3 w-3" /> {o.name}
            </span>
          ))}
          {canConnect && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
            >
              <Unlink className="h-3.5 w-3.5" /> Disconnect this organisation
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Not connected to any organisation.</p>
      )}

      {canConnect ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium">Invite an organisation</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create a code and give it to an owner or admin of the other organisation. It works
              once, for 7 days, and your skill list and level names are kept.
            </p>
            {code ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-sm font-semibold tracking-wider">
                  {code.code}
                </code>
                <button
                  onClick={() => copy(code.code)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                  aria-label="Copy the code"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={makeCode}
                disabled={busy}
                className="btn-teal mt-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Create a connection code
              </button>
            )}
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium">Connect with a code</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enter a code from another organisation's owner or admin. Their skill list and level
              names are used, and people's skills are combined.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={entered}
                onChange={(e) => setEntered(e.target.value)}
                placeholder="ABCD-EFGH"
                maxLength={9}
                className={inputCls + " font-mono uppercase"}
                aria-label="Connection code"
              />
              <button
                onClick={connect}
                disabled={busy || entered.trim().length < 8}
                className="btn-teal shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Only owners and admins can connect organisations.
        </p>
      )}
    </div>
  );
}

/** Owners can delete the organisation; they must type its name to confirm. */
export function DeleteOrgPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
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

/** Names for skill levels 1–4 in this organisation. Skills and their levels belong to each person. */
function SkillLevelsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const current = useSkillLevelNames();
  const [names, setNames] = useState(current);
  useEffect(() => setNames(current), [current]);
  const [saving, setSaving] = useState(false);

  const trimmed = names.map((n) => n.trim());
  const changed = trimmed.length !== current.length || trimmed.some((n, i) => n !== current[i]);
  const valid = trimmed.every(Boolean);
  const isDefault =
    current.length === DEFAULT_SKILL_LEVEL_NAMES.length &&
    current.every((n, i) => n === DEFAULT_SKILL_LEVEL_NAMES[i]);
  const fewer = names.length < current.length;

  /** Keeps the names already typed; new levels start as "Level n" for renaming. */
  const setCount = (count: number) =>
    setNames(
      Array.from({ length: count }, (_, i) =>
        i < names.length
          ? names[i]
          : count === 4 && isDefault
            ? DEFAULT_SKILL_LEVEL_NAMES[i]
            : `Level ${i + 1}`,
      ),
    );

  const save = async (next: string[] | null) => {
    setSaving(true);
    try {
      // Saved for the whole skill space when organisations are connected.
      await saveSkillLevelNames({ data: { orgId, names: next } });
      toast.success(next ? "Skill levels saved" : "Skill levels reset");
      await qc.invalidateQueries({ queryKey: skillLevelNamesKey(orgId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the skill levels");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8">
      <h4 className="text-sm font-semibold">Skill levels</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        How many levels skills have in this organisation and what they're called, from lowest to
        highest. People pick a level for each skill in Settings, on the People page and on the
        Skills page.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Number of levels
        <select
          value={names.length}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={saving}
          className="h-9 rounded-xl border border-input bg-white/70 px-2 text-sm dark:bg-white/5"
        >
          {Array.from(
            { length: MAX_SKILL_LEVELS - MIN_SKILL_LEVELS + 1 },
            (_, i) => i + MIN_SKILL_LEVELS,
          ).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {names.map((name, i) => (
          <label key={i} className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span
                className={`inline-block h-3 w-3 rounded-full ${skillLevelColor(i + 1, names.length)}`}
                aria-hidden
              />
              Level {i + 1} <RequiredIndicator />
            </span>
            <input
              required
              value={name}
              maxLength={MAX_SKILL_LEVEL_NAME_LENGTH}
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              className={inputCls}
            />
          </label>
        ))}
      </div>
      {fewer && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          People whose skills are at a higher level will show at the highest one,{" "}
          <strong>{trimmed[trimmed.length - 1] || `Level ${names.length}`}</strong>, in this
          organisation. Their levels aren't changed, so adding levels back restores them.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => save(trimmed)}
          disabled={saving || !changed || !valid}
          className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          Save levels
        </button>
        {!isDefault && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            Reset to {DEFAULT_SKILL_LEVEL_NAMES.join(", ")}
          </button>
        )}
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
