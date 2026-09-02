import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STAGES, STAGE_LABEL, SOURCES, type Stage } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrg } from "@/lib/org";
import { ACCEPTED_FILE_TYPES, uploadCandidateFile, validateCandidateFile } from "@/lib/candidate-files";
import { Paperclip } from "lucide-react";

interface Req { id: string; title: string }

export function NewCandidateDialog({ open, onOpenChange, requisitions, onCreated }:
  { open: boolean; onOpenChange: (v: boolean) => void; requisitions: Req[]; onCreated: () => void }) {
  const { orgId } = useOrg();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reqId, setReqId] = useState<string>("");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [stage, setStage] = useState<Stage>("applied");
  const [cv, setCv] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFile = (file: File | null, set: (f: File | null) => void) => {
    if (!file) return set(null);
    const err = validateCandidateFile(file);
    if (err) { toast.error(err); return; }
    set(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("No workspace selected");
      const { data: created, error } = await supabase.from("candidates").insert({
        user_id: u.user.id, org_id: orgId, name, email: email || null, phone: phone || null,
        requisition_id: reqId || null, source, stage,
      }).select("id").single();
      if (error) throw error;

      const patch: { cv_path?: string; cover_letter_path?: string } = {};
      if (cv) patch.cv_path = await uploadCandidateFile(orgId, created.id, "cv", cv);
      if (cover) patch.cover_letter_path = await uploadCandidateFile(orgId, created.id, "cover_letter", cover);
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await supabase.from("candidates").update(patch).eq("id", created.id);
        if (upErr) throw upErr;
      }

      toast.success("Candidate added");
      setName(""); setEmail(""); setPhone(""); setReqId(""); setStage("applied"); setCv(null); setCover(null);
      onCreated(); onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm" />
          <select value={reqId} onChange={(e) => setReqId(e.target.value)} className="w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm">
            <option value="">No position</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm">
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="rounded-xl border border-input bg-white/70 px-3 py-2 text-sm">
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FilePick label="CV" file={cv} onPick={(f) => pickFile(f, setCv)} />
            <FilePick label="Cover letter" file={cover} onPick={(f) => pickFile(f, setCover)} />
          </div>
          <p className="text-xs text-muted-foreground">PDF, DOC or DOCX · up to 10 MB per file</p>

          <button disabled={saving} type="submit" className="btn-teal w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving…" : "Add candidate"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FilePick({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <label className="glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/80">
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="truncate">{file ? file.name : label}</span>
      <input type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );
}
