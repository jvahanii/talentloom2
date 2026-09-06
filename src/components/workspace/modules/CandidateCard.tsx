import { useMemo, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ExternalLink, User } from "lucide-react";

type Cand = {
  id: string;
  name: string;
  email: string | null;
  stage: Stage;
  source: string | null;
  requisition_id: string | null;
  notes: string | null;
};

const STAGE_TONE: Record<Stage, string> = {
  applied: "bg-secondary text-foreground border-border",
  screen: "bg-[var(--primary)] text-foreground border-[var(--primary)]",
  interview: "bg-[rgb(6_182_212_/_0.3)] text-[#FF5FA2] border-[rgb(103_232_249_/_0.5)]",
  offer: "bg-[rgb(250_204_21_/_0.25)] text-[#fef08a] border-[rgb(250_204_21_/_0.4)]",
  hired: "bg-[rgb(34_197_94_/_0.3)] text-[#86efac] border-[rgb(34_197_94_/_0.45)]",
  rejected: "bg-[rgb(239_68_68_/_0.25)] text-[#fca5a5] border-[rgb(239_68_68_/_0.4)]",
};

export function CandidateCard({
  query,
  targetStage,
}: {
  query?: string | null;
  targetStage?: Stage | null;
}) {
  const qc = useQueryClient();
  const cands = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,name,email,stage,source,requisition_id,notes");
      if (error) throw error;
      return (data ?? []) as Cand[];
    },
  });

  const matches = useMemo(() => {
    const list = cands.data ?? [];
    if (!query) return list.slice(0, 6);
    const q = query.toLowerCase();
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [cands.data, query]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = selectedId
    ? (matches.find((c) => c.id === selectedId) ?? null)
    : matches.length === 1
      ? matches[0]
      : null;

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from("candidates").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["all-history"] });
      toast.success("Stage updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (cands.isLoading) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-muted-foreground">Loading candidates…</div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="glass rounded-2xl p-5">
        <p className="text-sm text-foreground">
          No candidates match {query ? <span className="font-mono">"{query}"</span> : "your filter"}
          .
        </p>
      </div>
    );
  }

  if (matches.length > 1 && !active) {
    return (
      <div className="glass rounded-2xl p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Which one?</p>
        <div className="grid gap-1.5">
          {matches.slice(0, 8).map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-left hover:bg-secondary border border-border"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.email ?? "—"}</div>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_TONE[c.stage]}`}>
                {STAGE_LABEL[c.stage]}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!active) return null;

  return (
    <LayoutGroup>
      <motion.div layout className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary border border-border text-foreground">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold text-foreground truncate">
                {active.name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {active.email ?? "no email"} · {active.source ?? "unknown source"}
              </div>
            </div>
          </div>
          <Link
            to="/candidates/$id"
            params={{ id: active.id }}
            className="inline-flex items-center gap-1 rounded-lg bg-secondary border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </Link>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Move to
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => {
              const isCurrent = active.stage === s;
              return (
                <motion.button
                  key={s}
                  layout
                  onClick={() => !isCurrent && move.mutate({ id: active.id, stage: s })}
                  disabled={isCurrent || move.isPending}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isCurrent
                      ? STAGE_TONE[s] + " ring-2 ring-white/40"
                      : "bg-secondary border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {isCurrent && (
                    <motion.span
                      layoutId={`stage-dot-${active.id}`}
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"
                    />
                  )}
                  {STAGE_LABEL[s]}
                </motion.button>
              );
            })}
          </div>
        </div>

        {targetStage && targetStage !== active.stage && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-center justify-between rounded-xl bg-[rgb(6_182_212_/_0.12)] border border-[rgb(103_232_249_/_0.35)] px-3 py-2 text-sm"
          >
            <span className="text-foreground">
              Move {active.name.split(" ")[0]} to{" "}
              <b className="text-[#FF5FA2]">{STAGE_LABEL[targetStage]}</b>?
            </span>
            <button
              onClick={() => move.mutate({ id: active.id, stage: targetStage })}
              disabled={move.isPending}
              className="btn-teal rounded-lg px-3 py-1 text-xs font-semibold"
            >
              Confirm
            </button>
          </motion.div>
        )}

        {active.notes && (
          <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{active.notes}</p>
        )}
      </motion.div>
    </LayoutGroup>
  );
}
