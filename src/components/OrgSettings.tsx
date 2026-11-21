import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { useOrg } from "@/lib/org";
import { toast } from "sonner";
import { RequiredIndicator } from "@/components/ui/label";
import { Copy, Link2, Unlink, UsersRound } from "lucide-react";
import {
  connectSkillSpace,
  createSkillConnectionCode,
  disconnectSkillSpace,
} from "@/lib/skillSpace.functions";
import { fetchSkillSpace, forgetSkillSpaces, skillSpaceKey } from "@/lib/skillLevels";

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

export function OrgSettings() {
  const { orgId, title, orgs, refresh } = useOrg();
  const orgName = orgs.find((o) => o.org_id === orgId)?.name ?? "";

  const [name, setName] = useState(orgName);
  useEffect(() => setName(orgName), [orgName]);

  const [busy, setBusy] = useState(false);

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
        Everyone in the organisation can see and change everything in it. Your title here:{" "}
        <span className="font-medium">
          {orgs.find((o) => o.org_id === orgId)?.viaSuperuser
            ? "Superuser (not a member)"
            : (title ?? "—")}
        </span>
        .
      </p>

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

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
        <UsersRound className="h-5 w-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          People and invitations are managed on the People page.
        </p>
        <Link to="/people" className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold">
          Go to People
        </Link>
      </div>

      <SkillSpacePanel orgId={orgId} />
    </div>
  );
}

/**
 * Organisations connected to this one share its skill list, level names and
 * people's skills. Anyone in an organisation connects it with a code from the
 * other organisation, or creates one for it, and can disconnect.
 */
function SkillSpacePanel({ orgId }: { orgId: string }) {
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
          <button
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
          >
            <Unlink className="h-3.5 w-3.5" /> Disconnect this organisation
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Not connected to any organisation.</p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Invite an organisation</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Create a code and give it to someone in the other organisation. It works once, for 7
            days, and your skill list and level names are kept.
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
            Enter a code from someone in another organisation. Their skill list and level names are
            used, and people's skills are combined.
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
    </div>
  );
}

/** Anyone in the organisation can delete it, by typing its name to confirm. */
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
      if (!data?.length) throw new Error("The organisation could not be deleted");
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
