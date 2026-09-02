import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STAGES, STAGE_LABEL, SOURCES, type Stage } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Req { id: string; title: string }

export function NewCandidateDialog({ open, onOpenChange, requisitions, onCreated }:
  { open: boolean; onOpenChange: (v: boolean) => void; requisitions: Req[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reqId, setReqId] = useState<string>("");
  const [source, setSource] = useState<string>(SOURCES[0]);
  const [stage, setStage] = useState<Stage>("applied");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("candidates").insert({
        user_id: u.user.id, name, email: email || null, phone: phone || null,
        requisition_id: reqId || null, source, stage,
      });
      if (error) throw error;
      toast.success("Candidate added");
      setName(""); setEmail(""); setPhone(""); setReqId(""); setStage("applied");
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
            <option value="">No requisition</option>
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
          <button disabled={saving} type="submit" className="btn-teal w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving…" : "Add candidate"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
