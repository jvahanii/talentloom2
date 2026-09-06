import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#FF5FA2", "#4ED6A6", "#B79CFF", "#FFD166", "#9BDCFF", "#FF9EC7"];

type View = "funnel" | "sources" | "time-in-stage";

const TITLE: Record<View, string> = {
  funnel: "Candidate flow",
  sources: "Candidates by source",
  "time-in-stage": "Average days in each stage",
};

export function AnalyticsCard({ view }: { view: View }) {
  const cands = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => (await supabase.from("candidates").select("*")).data ?? [],
  });
  const hist = useQuery({
    queryKey: ["all-history"],
    enabled: view === "time-in-stage",
    queryFn: async () =>
      (await supabase.from("stage_history").select("*").order("changed_at")).data ?? [],
  });

  const funnel = useMemo(
    () =>
      STAGES.map((s) => ({
        stage: STAGE_LABEL[s],
        count: (cands.data ?? []).filter((c) => c.stage === s).length,
      })),
    [cands.data],
  );

  const sources = useMemo(() => {
    const map: Record<string, number> = {};
    (cands.data ?? []).forEach((c) => {
      const k = c.source || "Unknown";
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [cands.data]);

  const timeInStage = useMemo(() => {
    const stageDays: Record<string, number[]> = {};
    const byCand: Record<string, { to_stage: Stage; changed_at: string }[]> = {};
    (hist.data ?? []).forEach((h) => {
      (byCand[h.candidate_id] ||= []).push({
        to_stage: h.to_stage as Stage,
        changed_at: h.changed_at,
      });
    });
    Object.values(byCand).forEach((events) => {
      for (let i = 0; i < events.length - 1; i++) {
        const days =
          (new Date(events[i + 1].changed_at).getTime() -
            new Date(events[i].changed_at).getTime()) /
          86400000;
        (stageDays[events[i].to_stage] ||= []).push(days);
      }
    });
    return STAGES.map((s) => {
      const arr = stageDays[s] || [];
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return { stage: STAGE_LABEL[s], days: Math.round(avg * 10) / 10 };
    });
  }, [hist.data]);

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-display text-lg font-semibold text-foreground">{TITLE[view]}</h3>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === "funnel" ? (
            <BarChart data={funnel}>
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Bar dataKey="count" fill="#FF9EC7" radius={[8, 8, 0, 0]} />
            </BarChart>
          ) : view === "sources" ? (
            <PieChart>
              <Pie
                data={sources}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label={{ fill: "var(--foreground)", fontSize: 11 }}
              >
                {sources.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
            </PieChart>
          ) : (
            <BarChart data={timeInStage}>
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "white",
                }}
              />
              <Bar dataKey="days" fill="#FF0178" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
