import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STAGES, STAGE_LABEL, SOURCES, type Stage } from "@/lib/constants";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { ArrowLeft, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/candidates/$id")({
  head: () => ({ meta: [{ title: "Candidate — Talently" }] }),
  component: CandidateDetail,
});

function CandidateDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { orgId, role } = useOrg();
  const canEdit = role !== "viewer";
  const canDelete = role === "owner" || role === "admin";

  const cand = useQuery({
    queryKey: ["candidate", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
      if (error) throw error; return data;
    },
  });
  const reqs = useQuery({
    queryKey: ["reqs", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("requisitions").select("id,title").eq("org_id", orgId!)).data ?? [],
  });
  const history = useQuery({
    queryKey: ["history", id],
    queryFn: async () => (await supabase.from("stage_history").select("*").eq("candidate_id", id).order("changed_at", { ascending: false })).data ?? [],
  });

  const [form, setForm] = useState<Record<string, string | number | null>>({});
  useEffect(() => {
    if (cand.data) setForm({
      name: cand.data.name, email: cand.data.email ?? "", phone: cand.data.phone ?? "",
      source: cand.data.source ?? SOURCES[0], stage: cand.data.stage,
      requisition_id: cand.data.requisition_id ?? "", notes: cand.data.notes ?? "",
      resume_link: cand.data.resume_link ?? "", rating: cand.data.rating ?? "",
    });
  }, [cand.data]);

  const save = useMutation({
    mutationFn: async () => {
      const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
      const payload = {
        name: String(form.name ?? ""),
        email: s(form.email),
        phone: s(form.phone),
        source: s(form.source),
        stage: form.stage as Stage,
        requisition_id: s(form.requisition_id),
        notes: s(form.notes),
        resume_link: s(form.resume_link),
        rating: form.rating ? Number(form.rating) : null,
      };
      const { error } = await supabase.from("candidates").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["candidate", id] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["history", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/pipeline" }); },
  });

  if (cand.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!cand.data) return <p className="text-sm text-muted-foreground">Not found.</p>;

  return (
    <div>
      <Link to="/pipeline" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h1 className="font-display text-2xl font-bold">{cand.data.name}</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input value={String(form.name ?? "")} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
            <Field label="Email"><input value={String(form.email ?? "")} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={String(form.phone ?? "")} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="Rating (1-5)"><input type="number" min="1" max="5" value={String(form.rating ?? "")} onChange={(e) => setForm({ ...form, rating: e.target.value })} className={inputCls} /></Field>
            <Field label="Requisition">
              <select value={String(form.requisition_id ?? "")} onChange={(e) => setForm({ ...form, requisition_id: e.target.value })} className={inputCls}>
                <option value="">None</option>
                {reqs.data?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select value={String(form.source ?? "")} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Stage">
              <select value={String(form.stage ?? "")} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={inputCls}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Resume link"><input value={String(form.resume_link ?? "")} onChange={(e) => setForm({ ...form, resume_link: e.target.value })} className={inputCls} placeholder="https://…" /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea rows={4} value={String(form.notes ?? "")} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></Field></div>
          </div>
          {canEdit && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-teal rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Save changes</button>
              {canDelete && (
                <button onClick={() => { if (confirm("Delete this candidate?")) del.mutate(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold">Stage history</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {history.data?.map((h) => (
              <li key={h.id} className="glass-strong rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs">
                  {h.from_stage && <><span className="rounded-full bg-muted border border-border px-2 py-0.5 text-foreground/80">{STAGE_LABEL[h.from_stage as Stage]}</span> →</>}
                  <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-medium text-primary">{STAGE_LABEL[h.to_stage as Stage]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</p>
              </li>
            ))}
            {history.data?.length === 0 && <p className="text-xs text-muted-foreground">No changes yet.</p>}
          </ol>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
