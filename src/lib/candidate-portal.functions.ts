import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";

const BUCKET = "candidate-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16;
const ALLOWED_EXT = ["pdf", "doc", "docx"];

function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

const UploadSchema = z.object({
  kind: z.enum(["cv", "cover_letter"]),
  label: z.string().trim().min(1, "Give the document a label").max(120),
  name: z.string().trim().min(1).max(200),
  type: z.string().max(150).default(""),
  data: z.string().min(1).max(MAX_BASE64_CHARS),
});

const IdSchema = z.object({ id: z.string().uuid() });
const RenameSchema = IdSchema.extend({ label: z.string().trim().min(1).max(120) });

export type CandidateDocument = {
  id: string;
  kind: "cv" | "cover_letter";
  label: string;
  path: string;
  created_at: string;
};

export type MyApplication = {
  id: string;
  stage: string;
  created_at: string;
  source: string | null;
  positionTitle: string;
  orgName: string;
  cvName: string | null;
  coverLetterName: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screen: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
};

export function stageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? stage;
}

/** Stamp anonymous applications made with this email onto the signed-in account. */
export const claimMyApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: userData } = await context.supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) return { claimed: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const { data } = await supabaseAdmin
      .from("candidates")
      .update({ applicant_user_id: context.userId })
      .is("applicant_user_id", null)
      .ilike("email", email)
      .select("id");
    return { claimed: data?.length ?? 0 };
  });

export const myApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Own rows readable via the applicant RLS policy.
    const { data: rows, error } = await context.supabase
      .from("candidates")
      .select("id, stage, created_at, source, requisition_id, org_id, cv_path, cover_letter_path")
      .eq("applicant_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows || rows.length === 0) return [] as MyApplication[];

    // Requisition/organisation names are recruiter-scoped tables; look them up server-side.
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const reqIds = [...new Set(rows.map((r) => r.requisition_id).filter(Boolean))] as string[];
    const orgIds = [...new Set(rows.map((r) => r.org_id))];
    const [{ data: reqs }, { data: orgs }] = await Promise.all([
      reqIds.length
        ? supabaseAdmin.from("requisitions").select("id, title").in("id", reqIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      supabaseAdmin.from("organizations").select("id, name").in("id", orgIds),
    ]);
    const reqName = new Map((reqs ?? []).map((r) => [r.id, r.title]));
    const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

    return rows.map((r) => ({
      id: r.id,
      stage: r.stage,
      created_at: r.created_at,
      source: r.source,
      positionTitle: (r.requisition_id && reqName.get(r.requisition_id)) || "General application",
      orgName: orgName.get(r.org_id) ?? "A company",
      cvName: r.cv_path ? (r.cv_path.split("/").pop() ?? null) : null,
      coverLetterName: r.cover_letter_path ? (r.cover_letter_path.split("/").pop() ?? null) : null,
    }));
  });

export const myDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("candidate_documents")
      .select("id, kind, label, path, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CandidateDocument[];
  });

export const uploadCandidateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ext = extOf(data.name);
    if (!ALLOWED_EXT.includes(ext)) throw new Error("Only PDF, DOC or DOCX files are accepted.");
    const bytes = Buffer.from(data.data, "base64");
    if (bytes.byteLength === 0) throw new Error("That file appears to be empty.");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");

    const path = `applicants/${context.userId}/${data.kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await context.supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: data.type || "application/octet-stream", upsert: false });
    if (upErr) throw new Error("Could not upload the file. Please try again.");

    const { data: inserted, error } = await context.supabase
      .from("candidate_documents")
      .insert({ user_id: context.userId, kind: data.kind, label: data.label, path })
      .select("id, kind, label, path, created_at")
      .single();
    if (error || !inserted) {
      await context.supabase.storage.from(BUCKET).remove([path]);
      throw new Error("Could not save the document. Please try again.");
    }
    return inserted as CandidateDocument;
  });

export const renameCandidateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RenameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("candidate_documents")
      .update({ label: data.label })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteCandidateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("candidate_documents")
      .select("path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("candidate_documents")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    if (doc?.path) await context.supabase.storage.from(BUCKET).remove([doc.path]);
    return { ok: true as const };
  });
