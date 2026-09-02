import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";
import { useOrg } from "@/lib/org";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Talently" }] }),
  component: Analytics,
});

const COLORS = ["#7C3AED", "#06B6D4", "#A78BFA", "#67E8F9", "#4C1D95", "#C4B5FD"];

function Analytics() {
  const { orgId } = useOrg();
  const cands = useQuery({
    queryKey: ["candidates", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("candidates").select("*").eq("org_id", orgId!)).data ?? [],
  });
  const hist = useQuery({
    queryKey: ["all-history", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("stage_history").select("*").eq("org_id", orgId!).order("changed_at")).data ?? [],
  });
  const reqs = useQuery({
    queryKey: ["reqs", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("requisitions").select("*").eq("org_id", orgId!)).data ?? [],
  });

  const funnel = STAGES.map((s) => ({ stage: STAGE_LABEL[s], count: (cands.data ?? []).filter((c) => c.stage === s).length }));

  const sourceMap: Record<string, number> = {};
  (cands.data ?? []).forEach((c) => { const k = c.source || "Unknown"; sourceMap[k] = (sourceMap[k] ?? 0) + 1; });
  const sources = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

  // Time-in-stage: for each candidate, compute avg days per stage
  const stageDays: Record<string, number[]> = {};
  const byCand: Record<string, { to_stage: Stage; changed_at: string }[]> = {};
  (hist.data ?? []).forEach((h) => {
    (byCand[h.candidate_id] ||= []).push({ to_stage: h.to_stage as Stage, changed_at: h.changed_at });
  });
  Object.values(byCand).forEach((events) => {
    for (let i = 0; i < events.length - 1; i++) {
      const days = (new Date(events[i + 1].changed_at).getTime() - new Date(events[i].changed_at).getTime()) / 86400000;
      (stageDays[events[i].to_stage] ||= []).push(days);
    }
  });
  const timeInStage = STAGES.map((s) => {
    const arr = stageDays[s] || [];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { stage: STAGE_LABEL[s], days: Math.round(avg * 10) / 10 };
  });

  const openReqs = (reqs.data ?? []).filter((r) => r.status === "open").length;
  const totalCands = cands.data?.length ?? 0;
  const hired = (cands.data ?? []).filter((c) => c.stage === "hired").length;
  const conversion = totalCands ? Math.round((hired / totalCands) * 100) : 0;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Analytics</h1>
      <p className="text-sm text-muted-foreground">Pipeline health at a glance.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open positions" value={openReqs} />
        <Stat label="Candidates" value={totalCands} />
        <Stat label="Hired" value={hired} />
        <Stat label="Applied → Hired" value={`${conversion}%`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold">Funnel</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#7C3AED" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold">Candidates by source</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" outerRadius={90} label>
                  {sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h3 className="font-display font-semibold">Average time in stage (days)</h3>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeInStage}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="days" fill="#06B6D4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}
