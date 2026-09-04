import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { toast } from "sonner";
import { STAGES, type Stage } from "@/lib/constants";
import { useOrg } from "@/lib/org";
import { getMyProfileId } from "@/lib/auth";
import { Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import — Talentloom" }] }),
  component: ImportPage,
});

const TEMPLATE = "name,email,phone,requisition_title,source,stage,notes\nJane Doe,jane@example.com,555-0100,Senior Frontend Engineer,LinkedIn,applied,\n";

// Very small CSV parser: handles simple quoted fields
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = ""; let row: string[] = []; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function ImportPage() {
  const { orgId, can } = useOrg();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const FIELDS = ["name", "email", "phone", "requisition_title", "source", "stage", "notes"];

  const onFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const rows = parseCSV(text);
    setPreview(rows.slice(0, 6));
    // Auto-map by lowercased header
    const headers = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const m: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const idx = headers.findIndex((h) => h === f || h.replaceAll(" ", "_") === f);
      if (idx >= 0) m[f] = String(idx);
    });
    setMapping(m);
  };

  const doImport = async () => {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const data = rows.slice(1);
      const { data: reqs } = await supabase.from("requisitions").select("id,title").eq("org_id", orgId!);
      const reqByTitle = new Map((reqs ?? []).map((r) => [r.title.toLowerCase(), r.id]));
      const uid = await getMyProfileId();
      if (!uid) throw new Error("Not authenticated");
      if (!orgId) throw new Error("No organisation selected");

      const inserts = data.map((r) => {
        const get = (f: string) => { const i = mapping[f]; return i !== undefined && i !== "" ? (r[Number(i)] ?? "").trim() : ""; };
        const stage = (STAGES as readonly string[]).includes(get("stage").toLowerCase()) ? (get("stage").toLowerCase() as Stage) : "applied";
        return {
          user_id: uid,
          org_id: orgId,
          name: get("name") || "Unnamed",
          email: get("email") || null,
          phone: get("phone") || null,
          requisition_id: reqByTitle.get(get("requisition_title").toLowerCase()) ?? null,
          source: get("source") || null,
          stage,
          notes: get("notes") || null,
        };
      }).filter((r) => r.name && r.name !== "Unnamed" || r.email);

      if (inserts.length === 0) throw new Error("No valid rows to import");
      const { error } = await supabase.from("candidates").insert(inserts);
      if (error) throw error;
      toast.success(`Imported ${inserts.length} candidates`);
      setFile(null); setPreview(null); setMapping({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "talentloom-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!can("import")) {
    return (
      <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-display text-lg font-semibold">Not available for your title</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your organisation title doesn't allow you to import candidates. Ask an administrator to update it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Import candidates</h1>
      <p className="text-sm text-muted-foreground">Bring your candidate list with you. We’ll match the columns and flag anything that needs a quick fix.</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={downloadTemplate} className="glass inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium hover:bg-white/80">
          <Download className="h-4 w-4" /> Download template
        </button>
        <label className="btn-teal inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold">
          <Upload className="h-4 w-4" /> Choose CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>

      {preview && (
        <div className="mt-6 glass rounded-2xl p-5">
          <h3 className="font-display font-semibold">Column mapping</h3>
          <p className="text-xs text-muted-foreground">First row is treated as headers. Match each field to a column.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <span className="w-40 font-medium">{f}</span>
                <select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })} className="flex-1 rounded-lg border border-input bg-white/70 px-2 py-1 text-xs">
                  <option value="">— skip —</option>
                  {preview[0].map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/15 text-white"><tr>{preview[0].map((h, i) => <th key={i} className="p-2 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody className="text-white/85">{preview.slice(1).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-t border-white/15 p-2">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>

          <button onClick={doImport} disabled={busy} className="btn-teal mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            {busy ? "Importing…" : "Import candidates"}
          </button>
        </div>
      )}
    </div>
  );
}
