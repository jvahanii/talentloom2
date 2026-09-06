import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/app-client";
import { CANDIDATE_FILES_BUCKET, fileExtension } from "@/lib/candidate-files";

interface AttachmentRow {
  name: string;
  cv_path: string | null;
  cover_letter_path: string | null;
}

function safeName(value: string) {
  return value.replace(/[^\w\-. ]+/g, "_").trim() || "candidate";
}

/**
 * Bundles every applicant CV / cover letter for a position into a single zip
 * and triggers a browser download. Returns how many files were included.
 */
export async function downloadPositionAttachments(
  requisitionId: string,
  positionTitle: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("candidates")
    .select("name, cv_path, cover_letter_path")
    .eq("requisition_id", requisitionId);
  if (error) throw error;

  const rows = (data ?? []) as AttachmentRow[];
  const files = rows.flatMap((r) => {
    const out: { path: string; label: string }[] = [];
    if (r.cv_path) out.push({ path: r.cv_path, label: `${safeName(r.name)} - CV` });
    if (r.cover_letter_path)
      out.push({ path: r.cover_letter_path, label: `${safeName(r.name)} - Cover letter` });
    return out;
  });
  if (files.length === 0) return 0;

  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;

  for (const f of files) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(CANDIDATE_FILES_BUCKET)
      .createSignedUrl(f.path, 600);
    if (signErr || !signed) continue;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) continue;
    const ext = fileExtension(f.path) || "pdf";
    let entry = `${f.label}.${ext}`;
    let n = 2;
    while (used.has(entry)) entry = `${f.label} (${n++}).${ext}`;
    used.add(entry);
    zip.file(entry, await res.blob());
    added += 1;
  }

  if (added === 0) return 0;

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(positionTitle)} - applicant files.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return added;
}
