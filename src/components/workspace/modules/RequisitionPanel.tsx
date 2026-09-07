import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { REQ_STATUS_LABEL } from "@/lib/constants";
import { useOrg } from "@/lib/org";
import { getMyProfileId } from "@/lib/auth";
import { toast } from "sonner";
import { RequiredIndicator } from "@/components/ui/label";

type Req = {
  id: string;
  title: string;
  department: string | null;
  hiring_manager: string | null;
  status: string;
  target_start_date: string | null;
  deadline_date: string | null;
  notes: string | null;
};

type ReqStatus = "open" | "on_hold" | "filled" | "closed";
const STATUSES: readonly ReqStatus[] = ["open", "on_hold", "filled", "closed"] as const;

export function RequisitionPanel({ query }: { query?: string | null }) {
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const reqs = useQuery({
    queryKey: ["reqs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requisitions")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Req[];
    },
  });

  const existing = query
    ? ((reqs.data ?? []).find((r) => r.title.toLowerCase().includes(query.toLowerCase())) ?? null)
    : null;

  const [title, setTitle] = useState(existing?.title ?? query ?? "");
  const [department, setDepartment] = useState(existing?.department ?? "");
  const [hiringManager, setHiringManager] = useState(existing?.hiring_manager ?? "");
  const [status, setStatus] = useState<ReqStatus>((existing?.status as ReqStatus) ?? "open");
  const [start, setStart] = useState(existing?.target_start_date ?? "");
  const [deadline, setDeadline] = useState(existing?.deadline_date ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setDepartment(existing.department ?? "");
      setHiringManager(existing.hiring_manager ?? "");
      setStatus(existing.status as ReqStatus);
      setStart(existing.target_start_date ?? "");
      setDeadline(existing.deadline_date ?? "");
      setNotes(existing.notes ?? "");
    }
  }, [existing?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const uid = await getMyProfileId();
      if (!uid) throw new Error("Not authenticated");
      if (!existing && !orgId) throw new Error("No organisation selected");
      const payload = {
        title,
        department: department || null,
        hiring_manager: hiringManager || null,
        status,
        target_start_date: start || null,
        deadline_date: deadline || null,
        notes: notes || null,
      };
      if (existing) {
        const { error } = await supabase
          .from("requisitions")
          .update(payload as never)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("requisitions")
          .insert({ ...payload, user_id: uid, org_id: orgId! } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reqs"] });
      toast.success(existing ? "Position updated" : "Position created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <motion.div layout className="glass rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-foreground">
          {existing ? "Edit position" : "New position"}
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {existing ? existing.id.slice(0, 6) : "draft"}
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) save.mutate();
        }}
        className="mt-4 grid gap-3"
      >
        <Field label="Title" required>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Engineer"
            className={inputCls}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Engineering"
              className={inputCls}
            />
          </Field>
          <Field label="Hiring manager">
            <input
              value={hiringManager}
              onChange={(e) => setHiringManager(e.target.value)}
              placeholder="Name"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    status === s
                      ? "bg-[var(--primary)] border-[var(--primary)] text-foreground"
                      : "bg-secondary border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {REQ_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Target start">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Application deadline">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Scope, level, comp band…"
            className={inputCls}
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={save.isPending || !title.trim()}
            className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : existing ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

const inputCls =
  "w-full rounded-xl bg-background text-foreground px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
        {required && <RequiredIndicator />}
      </span>
      {children}
    </label>
  );
}
