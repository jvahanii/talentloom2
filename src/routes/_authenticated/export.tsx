import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({ meta: [{ title: "Export — Talently" }] }),
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
  const exportCands = async () => {
    const { data: cands, error } = await supabase.from("candidates").select("*");
    if (error) { toast.error(error.message); return; }
    const { data: reqs } = await supabase.from("requisitions").select("id,title");
    const rTitle = new Map((reqs ?? []).map((r) => [r.id, r.title]));
    const rows = (cands ?? []).map((c) => ({
      name: c.name, email: c.email, phone: c.phone,
      requisition_title: c.requisition_id ? rTitle.get(c.requisition_id) ?? "" : "",
      source: c.source, stage: c.stage, rating: c.rating,
      notes: c.notes, created_at: c.created_at, last_activity_at: c.last_activity_at,
    }));
    download("talently-candidates.csv", toCSV(rows, ["name","email","phone","requisition_title","source","stage","rating","notes","created_at","last_activity_at"]));
  };

  const exportReqs = async () => {
    const { data, error } = await supabase.from("requisitions").select("*");
    if (error) { toast.error(error.message); return; }
    download("talently-requisitions.csv", toCSV(data ?? [], ["title","department","hiring_manager","status","target_start_date","notes","created_at"]));
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Export</h1>
      <p className="text-sm text-muted-foreground">Download your pipeline data as CSV.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold">Candidates</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every candidate with stage, source, requisition, and timestamps.</p>
          <button onClick={exportCands} className="btn-teal mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download CSV</button>
        </div>
        <div className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold">Requisitions</h3>
          <p className="mt-1 text-sm text-muted-foreground">Open roles with status, hiring manager, and start dates.</p>
          <button onClick={exportReqs} className="btn-teal mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download CSV</button>
        </div>
      </div>
    </div>
  );
}
