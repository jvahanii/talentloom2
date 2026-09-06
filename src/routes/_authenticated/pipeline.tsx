import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { STAGES, STAGE_LABEL, SOURCES, type Stage } from "@/lib/constants";
import { toast } from "sonner";
import { Plus, Star } from "lucide-react";
import { NewCandidateDialog } from "@/components/NewCandidateDialog";
import { useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({ meta: [{ title: "Candidate flow — Talentloom" }] }),
  component: Pipeline,
});

function Pipeline() {
  const qc = useQueryClient();
  const { orgId, can } = useOrg();
  const canEdit = can("edit_candidates");
  const [reqFilter, setReqFilter] = useState<string>("all");
  const [srcFilter, setSrcFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

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
      return data ?? [];
    },
  });

  const cands = useQuery({
    queryKey: ["candidates", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("org_id", orgId!)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await supabase.from("candidates").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move"),
  });

  const filtered = useMemo(() => {
    return (cands.data ?? []).filter(
      (c) =>
        (reqFilter === "all" || c.requisition_id === reqFilter) &&
        (srcFilter === "all" || c.source === srcFilter),
    );
  }, [cands.data, reqFilter, srcFilter]);

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Candidate flow</h1>
          <p className="text-sm text-muted-foreground">
            Keep every candidate moving and every handoff clear.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setOpen(true)}
            className="btn-teal inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add a candidate</span>
          </button>
        )}
      </div>

      <div className="glass mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3 text-sm">
        <label className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">Position</span>
          <select
            value={reqFilter}
            onChange={(e) => setReqFilter(e.target.value)}
            className="rounded-lg border border-input bg-white/70 px-2 py-1"
          >
            <option value="all">All</option>
            {reqs.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">Source</span>
          <select
            value={srcFilter}
            onChange={(e) => setSrcFilter(e.target.value)}
            className="rounded-lg border border-input bg-white/70 px-2 py-1"
          >
            <option value="all">All</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-4 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {STAGES.map((stage) => {
          const list = filtered.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                if (canEdit) setDragOverStage(stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null);
              }}
              onDrop={() => {
                if (canEdit && dragId) {
                  mutStage.mutate({ id: dragId, stage });
                  setDragId(null);
                }
                setDragOverStage(null);
              }}
              className={`glass min-w-[260px] shrink-0 rounded-2xl p-3 transition-all sm:min-w-0 ${
                dragOverStage === stage && dragId ? "ring-2 ring-primary bg-primary/10" : ""
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <h3 className="font-display text-sm font-semibold text-teal-700">
                  {STAGE_LABEL[stage]}
                </h3>
                <span className="rounded-full bg-white/20 border border-white/25 px-2 py-0.5 text-xs font-medium text-white">
                  {list.length}
                </span>
              </div>
              <div className="space-y-2">
                {list.map((c) => (
                  <div
                    key={c.id}
                    draggable={canEdit}
                    onDragStart={() => canEdit && setDragId(c.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverStage(null);
                    }}
                    className="glass-strong group cursor-grab rounded-xl p-3 text-sm active:cursor-grabbing"
                  >
                    <Link to="/candidates/$id" params={{ id: c.id }} className="block">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.source && <span className="truncate">{c.source}</span>}
                        {c.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-600">
                            <Star className="h-3 w-3 fill-amber-500" /> {c.rating}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </div>
                ))}
                {list.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <NewCandidateDialog
        open={open}
        onOpenChange={setOpen}
        requisitions={reqs.data ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["candidates"] })}
      />
    </div>
  );
}
