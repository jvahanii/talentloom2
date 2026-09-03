import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/app-client";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({ meta: [{ title: "Export — TalentLoom" }] }),
  component: ExportPage,
});

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportPage() {
  const { orgId, can } = useOrg();

  const exportCands = async () => {
    if (!orgId) { toast.error("No workspace selected"); return; }
    const { data: cands, error } = await supabase.from("candidates").select("*").eq("org_id", orgId);
    if (error) { toast.error(error.message); return; }
    const { data: reqs } = await supabase.from("requisitions").select("id,title").eq("org_id", orgId);
    const rTitle = new Map((reqs ?? []).map((r) => [r.id, r.title]));
    const rows = (cands ?? []).map((c) => ({
      name: c.name, email: c.email, phone: c.phone,
      requisition_title: c.requisition_id ? rTitle.get(c.requisition_id) ?? "" : "",
      source: c.source, stage: c.stage, rating: c.rating,
      notes: c.notes, created_at: c.created_at, last_activity_at: c.last_activity_at,
    }));
    download("talentloom-candidates.csv", toCSV(rows, ["name","email","phone","requisition_title","source","stage","rating","notes","created_at","last_activity_at"]));
  };

  const exportReqs = async () => {
    if (!orgId) { toast.error("No workspace selected"); return; }
    const { data, error } = await supabase.from("requisitions").select("*").eq("org_id", orgId);
    if (error) { toast.error(error.message); return; }
    download("talentloom-requisitions.csv", toCSV(data ?? [], ["title","department","hiring_manager","status","target_start_date","notes","created_at"]));
  };

  if (!can("export")) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-display text-lg font-semibold">Not available for your title</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your organisation title doesn't allow you to export data. Ask an administrator to update it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Export</h1>
      <p className="text-sm text-muted-foreground">Download your pipeline data as CSV.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold">Candidates</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every candidate with stage, source, position, and timestamps.</p>
          <button onClick={exportCands} className="btn-teal mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download CSV</button>
        </div>
        <div className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold">Positions</h3>
          <p className="mt-1 text-sm text-muted-foreground">Open roles with status, hiring manager, and start dates.</p>
          <button onClick={exportReqs} className="btn-teal mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download CSV</button>
        </div>
      </div>
    </div>
  );
}
