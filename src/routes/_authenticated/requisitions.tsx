import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { REQ_STATUS_LABEL, STAGE_LABEL, type Stage } from "@/lib/constants";
import { useOrg } from "@/lib/org";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Link2, Download } from "lucide-react";
import { downloadPositionAttachments } from "@/lib/download-position-files";

export const Route = createFileRoute("/_authenticated/requisitions")({
  head: () => ({ meta: [{ title: "Positions — TalentLoom" }] }),
  validateSearch: (search: Record<string, unknown>): { position?: string } => ({
    ...(typeof search['position'] === "string" && search['position'] ? { position: search['position'] as string } : {}),
  }),
  component: Reqs,
});

type ReqStatus = "open" | "on_hold" | "filled" | "closed";
interface Req { id: string; title: string; department: string | null; hiring_manager: string | null; status: ReqStatus; target_start_date: string | null; deadline_date: string | null; notes: string | null; description: string | null }

function Reqs() {
  const qc = useQueryClient();
  const { orgId, can } = useOrg();
  const canEdit = can("edit_positions");
  const navigate = useNavigate({ from: "/requisitions" });
  const { position } = Route.useSearch();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Req | null>(null);
  const [viewing, setViewing] = useState<Req | null>(null);

  const reqs = useQuery({
    queryKey: ["reqs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("requisitions").select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error; return data as unknown as Req[];
    },
  });

  // Deep-link support: opening a shared position link (?position=<id>) opens
  // that card's overlay directly, once the positions have loaded.
  useEffect(() => {
    if (!position || !reqs.data) return;
    const match = reqs.data.find((r) => r.id === position);
    if (match) setViewing(match);
  }, [position, reqs.data]);

  const openViewing = (r: Req) => {
    setViewing(r);
    void navigate({ search: (prev) => ({ ...prev, position: r.id }), replace: true });
  };

  const closeViewing = () => {
    setViewing(null);
    void navigate({ search: (prev) => ({ ...prev, position: undefined }), replace: true });
  };

  const counts = useQuery({
    queryKey: ["req-counts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("requisition_id, stage").eq("org_id", orgId!);
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((c) => { if (c.requisition_id) m[c.requisition_id] = (m[c.requisition_id] ?? 0) + 1; });
      return m;
    },
  });

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Positions</h1>
          <p className="text-sm text-muted-foreground">Give great candidates a clear first impression of your company.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-teal inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> New
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(reqs.data ?? []).map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => openViewing(r)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewing(r); } }}
            className="glass cursor-pointer rounded-2xl p-5 text-left transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display truncate text-lg font-semibold">{r.title}</h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.department || "—"} · {r.hiring_manager || "No hiring manager"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); copyPositionLink(r.id); }} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Copy shareable link"><Link2 className="h-4 w-4" /></button>
                {canEdit && (
                  <button onClick={(e) => { e.stopPropagation(); setEditing(r); setOpen(true); }} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-medium border ${r.status === "open" ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}>{REQ_STATUS_LABEL[r.status]}</span>
              <span className="rounded-full bg-muted border border-border px-2 py-1 text-foreground/80">{counts.data?.[r.id] ?? 0} candidates</span>
              {r.target_start_date && <span className="rounded-full bg-muted border border-border px-2 py-1 text-foreground/80">Published {r.target_start_date}</span>}
              {r.deadline_date && <span className="rounded-full bg-muted border border-border px-2 py-1 text-foreground/80">Deadline {r.deadline_date}</span>}
            </div>
            {r.notes && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>}
          </div>
        ))}
        {reqs.data && reqs.data.length === 0 && <p className="col-span-full glass rounded-2xl p-10 text-center text-sm text-muted-foreground">No positions yet.</p>}
      </div>

      <ReqCandidatesDialog req={viewing} onOpenChange={(v) => { if (!v) closeViewing(); }} />

      <ReqDialog key={editing?.id ?? "new"} open={open} onOpenChange={setOpen} editing={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["reqs"] })} />
    </div>
  );
}

function ReqCandidatesDialog({ req, onOpenChange }: { req: Req | null; onOpenChange: (v: boolean) => void }) {
  const cands = useQuery({
    queryKey: ["req-candidates", req?.id],
    enabled: !!req,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, name, email, stage, source")
        .eq("requisition_id", req!.id)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; email: string | null; stage: Stage; source: string | null }[];
    },
  });

  const [zipping, setZipping] = useState(false);
  const downloadAll = async () => {
    if (!req) return;
    setZipping(true);
    try {
      const n = await downloadPositionAttachments(req.id, req.title);
      if (n === 0) toast.info("No applicant files on this position yet.");
      else toast.success(`Downloaded ${n} file${n === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download files");
    } finally {
      setZipping(false);
    }
  };

  return (
    <Dialog open={!!req} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{req?.title} · candidates</DialogTitle>
        </DialogHeader>
        <button
          type="button"
          onClick={downloadAll}
          disabled={zipping}
          className="glass inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/80 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {zipping ? "Preparing zip…" : "Download all attachments"}
        </button>
        {cands.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {cands.data && cands.data.length === 0 && <p className="text-sm text-muted-foreground">No candidates on this position yet.</p>}
        <ul className="divide-y divide-border">
          {(cands.data ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to="/candidates/$id"
                params={{ id: c.id }}
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.email || c.source || "—"}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground/80">{STAGE_LABEL[c.stage]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ReqDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Req | null; onSaved: () => void }) {
  const { orgId } = useOrg();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [hiring_manager, setHM] = useState(editing?.hiring_manager ?? "");
  const [status, setStatus] = useState<ReqStatus>(editing?.status ?? "open");
  const [target_start_date, setStart] = useState(editing?.target_start_date ?? "");
  const [deadline_date, setDeadline] = useState(editing?.deadline_date ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const payload = { title, department: department || null, hiring_manager: hiring_manager || null, status, target_start_date: target_start_date || null, deadline_date: deadline_date || null, description: description || null, notes: notes || null } as Record<string, unknown>;
      if (!editing && !orgId) throw new Error("No workspace selected");
      const { error } = editing
        ? await supabase.from("requisitions").update(payload as never).eq("id", editing.id)
        : await supabase.from("requisitions").insert({ ...payload, user_id: u.user.id, org_id: orgId! } as never);
      if (error) throw error;
      toast.success(editing ? "Updated" : "Created");
      onSaved(); onOpenChange(false);
      setTitle(""); setDepartment(""); setHM(""); setStatus("open"); setStart(""); setDeadline(""); setDescription(""); setNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit position" : "New position"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role title" className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
            <input value={hiring_manager} onChange={(e) => setHM(e.target.value)} placeholder="Hiring manager" className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={status} onChange={(e) => setStatus(e.target.value as ReqStatus)} className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm">
              {Object.entries(REQ_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" value={target_start_date} onChange={(e) => setStart(e.target.value)} aria-label="Target start date" className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Application deadline (shown publicly)</label>
            <input type="date" value={deadline_date} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Job description (shown publicly to candidates)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the role involves, requirements, what you offer…" rows={6} className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes (private)" rows={3} className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          <button disabled={saving} type="submit" className="btn-teal w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function copyApplyLink(orgId: string | null, requisitionId?: string) {
  if (!orgId) { toast.error("No organisation selected"); return; }
  const url = `${window.location.origin}/apply/${orgId}${requisitionId ? `?req=${requisitionId}` : ""}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Apply link copied");
  } catch {
    toast.error(url);
  }
}

async function copyPositionLink(requisitionId: string) {
  const url = `${window.location.origin}/requisitions?position=${requisitionId}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Shareable link copied");
  } catch {
    toast.error(url);
  }
}
