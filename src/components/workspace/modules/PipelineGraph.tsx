import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";

type Cand = { id: string; name: string; stage: Stage; source: string | null };

export function PipelineGraph() {
  const cands = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("id,name,stage,source");
      if (error) throw error;
      return (data ?? []) as Cand[];
    },
  });

  const [selected, setSelected] = useState<Stage | null>(null);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { applied: 0, screen: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
    (cands.data ?? []).forEach((r) => { c[r.stage] = (c[r.stage] ?? 0) + 1; });
    return c;
  }, [cands.data]);

  const max = Math.max(1, ...Object.values(counts));
  const positive = STAGES.filter((s) => s !== "rejected");

  // Simple horizontal layout: nodes on a curve, one "rejected" branch off center.
  const width = 720;
  const height = 300;
  const yBase = 120;
  const positiveXs = positive.map((_, i) => 60 + i * ((width - 120) / (positive.length - 1)));
  const rejectedX = width / 2;
  const rejectedY = 230;

  const nodeRadius = (n: number) => 22 + (n / max) * 26;

  const listForStage = (s: Stage) => (cands.data ?? []).filter((c) => c.stage === s).slice(0, 6);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-semibold text-foreground">Pipeline graph</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{cands.data?.length ?? 0} candidates</span>
      </div>

      <div className="mt-4 -mx-1 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[560px]" role="img" aria-label="Pipeline stages graph">
          <defs>
            <linearGradient id="edge" x1="0" x2="1">
              <stop offset="0%" stopColor="#4B73FF" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#FF0178" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="node" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#67e8f9" />
            </linearGradient>
          </defs>

          {/* Edges between positive stages */}
          {positive.slice(0, -1).map((_, i) => (
            <motion.line
              key={`e-${i}`}
              x1={positiveXs[i]}
              y1={yBase}
              x2={positiveXs[i + 1]}
              y2={yBase}
              stroke="url(#edge)"
              strokeWidth={2}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            />
          ))}
          {/* Edge from applied -> rejected branch */}
          <motion.path
            d={`M ${positiveXs[0]} ${yBase} Q ${rejectedX} ${yBase + 40}, ${rejectedX} ${rejectedY - 30}`}
            fill="none"
            stroke="#ef4444"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          />

          {positive.map((s, i) => {
            const n = counts[s];
            const r = nodeRadius(n);
            const isSelected = selected === s;
            return (
              <g key={s} onClick={() => setSelected(isSelected ? null : s)} style={{ cursor: "pointer" }}>
                <motion.circle
                  cx={positiveXs[i]}
                  cy={yBase}
                  r={r}
                  fill="url(#node)"
                  stroke={isSelected ? "white" : "var(--border)"}
                  strokeWidth={isSelected ? 3 : 1.5}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.08 }}
                  transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 260, damping: 20 }}
                />
                <text x={positiveXs[i]} y={yBase + 4} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 16 }}>
                  {n}
                </text>
                <text x={positiveXs[i]} y={yBase + r + 18} textAnchor="middle" className="fill-foreground" style={{ fontSize: 11 }}>
                  {STAGE_LABEL[s]}
                </text>
              </g>
            );
          })}

          {/* Rejected node */}
          <g onClick={() => setSelected(selected === "rejected" ? null : "rejected")} style={{ cursor: "pointer" }}>
            <motion.circle
              cx={rejectedX}
              cy={rejectedY}
              r={nodeRadius(counts.rejected)}
              fill="#3f0d0d"
              stroke={selected === "rejected" ? "white" : "rgba(239,68,68,0.6)"}
              strokeWidth={selected === "rejected" ? 3 : 1.5}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            />
            <text x={rejectedX} y={rejectedY + 4} textAnchor="middle" className="fill-[#fca5a5] font-bold" style={{ fontSize: 14 }}>
              {counts.rejected}
            </text>
            <text x={rejectedX} y={rejectedY + nodeRadius(counts.rejected) + 16} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
              Rejected
            </text>
          </g>
        </svg>
      </div>

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-xl bg-secondary border border-border p-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                {STAGE_LABEL[selected]} · {counts[selected]}
              </div>
              {listForStage(selected).length === 0 ? (
                <div className="text-xs text-muted-foreground">No candidates in this stage.</div>
              ) : (
                <ul className="grid gap-1 text-sm text-foreground">
                  {listForStage(selected).map((c) => (
                    <li key={c.id} className="flex items-center justify-between">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.source ?? "—"}</span>
                    </li>
                  ))}
                  {counts[selected] > 6 && <li className="text-xs text-muted-foreground">+{counts[selected] - 6} more</li>}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
