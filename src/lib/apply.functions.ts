import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const SOURCE_VALUES = ["Referral", "LinkedIn", "Job board", "Agency", "Website", "Other"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16;

const FileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().max(150).default(""),
  data: z.string().min(1).max(MAX_BASE64_CHARS), // base64, no data: prefix
});

const ApplicationSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).optional().default(""),
  requisition_id: z.string().uuid().optional().nullable(),
  source: z.enum(SOURCE_VALUES).default("Website"),
  notes: z.string().trim().max(2000).optional().default(""),
  cv: FileSchema.nullable().optional(),
  cover_letter: FileSchema.nullable().optional(),
  saved_cv_id: z.string().uuid().nullable().optional(),
  saved_cover_letter_id: z.string().uuid().nullable().optional(),
});

const OrgIdSchema = z.object({ org_id: z.string().uuid() });

const ALLOWED_EXT = ["pdf", "doc", "docx"];

function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

// Best-effort in-process throttle (workers are stateless, so this only slows bursts).
const hits = new Map<string, number[]>();
function rateLimited(ip: string, limit = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

export const listOpenOrganizations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  const { data: reqs } = await supabaseAdmin
    .from("requisitions")
    .select("id, org_id")
    .eq("status", "open");
  const counts = new Map<string, number>();
  for (const r of reqs ?? []) counts.set(r.org_id, (counts.get(r.org_id) ?? 0) + 1);
  if (counts.size === 0) return [] as { id: string; name: string; openRoles: number }[];
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .in("id", [...counts.keys()]);
  return (orgs ?? [])
    .map((o) => ({ id: o.id, name: o.name, openRoles: counts.get(o.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// deadline_date was added directly on the external database, so the generated
// types don't know it yet — cast the rows locally.
interface PositionListRow {
  id: string;
  title: string;
  org_id: string;
  department: string | null;
  target_start_date: string | null;
  deadline_date: string | null;
  description: string | null;
}

export const listOpenPositions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  const { data: reqsRaw } = await supabaseAdmin
    .from("requisitions")
    .select("id, title, org_id, department, target_start_date, deadline_date, description, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  const reqs = reqsRaw as unknown as PositionListRow[] | null;
  if (!reqs || reqs.length === 0) return [];
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .in("id", [...new Set(reqs.map((r) => r.org_id))]);
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  return reqs.map((r) => ({
    id: r.id,
    title: r.title,
    orgId: r.org_id,
    orgName: names.get(r.org_id) ?? "A company",
    department: r.department,
    targetStartDate: r.target_start_date,
    deadlineDate: r.deadline_date,
    excerpt: (r.description ?? "").slice(0, 220),
  }));
});

export const getPosition = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const { data: reqRaw } = await supabaseAdmin
      .from("requisitions")
      .select("id, title, org_id, department, hiring_manager, target_start_date, deadline_date, description, status")
      .eq("id", data.id)
      .maybeSingle();
    const req = reqRaw as unknown as (PositionListRow & { hiring_manager: string | null; status: string }) | null;
    if (!req || req.status !== "open") return null;
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", req.org_id)
      .maybeSingle();
    return {
      id: req.id,
      title: req.title,
      orgId: req.org_id,
      orgName: org?.name ?? "A company",
      department: req.department,
      hiringManager: req.hiring_manager,
      targetStartDate: req.target_start_date,
      deadlineDate: req.deadline_date,
      description: req.description ?? "",
    };
  });

export const getApplyContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrgIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", data.org_id)
      .maybeSingle();
    if (!org)
      return {
        org: null,
        roles: [] as { id: string; title: string; department: string | null; description: string | null; deadline_date: string | null }[],
      };
    const { data: reqsRaw } = await supabaseAdmin
      .from("requisitions")
      .select("id, title, department, description, deadline_date")
      .eq("org_id", data.org_id)
      .eq("status", "open")
      .order("title");
    const roles = (reqsRaw ?? []) as unknown as {
      id: string;
      title: string;
      department: string | null;
      description: string | null;
      deadline_date: string | null;
    }[];
    return { org: { id: org.id, name: org.name }, roles };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApplicationSchema.parse(input))
  .handler(async ({ data }) => {
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (rateLimited(ip)) throw new Error("Too many applications from this device. Please try again later.");

    for (const f of [data.cv, data.cover_letter]) {
      if (!f) continue;
      if (!ALLOWED_EXT.includes(extOf(f.name))) throw new Error("Only PDF, DOC or DOCX files are accepted.");
      if (Buffer.from(f.data, "base64").byteLength > MAX_FILE_BYTES)
        throw new Error("Files must be 10 MB or smaller.");
    }
    if (!data.cv && !data.saved_cv_id) throw new Error("Please attach your CV.");

    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");

    // Signed-in candidates: attach the application to their account. The bearer
    // token is optional — anonymous applicants submit without one.
    let applicantUserId: string | null = null;
    const bearer = getRequestHeader("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
    if (token && token.split(".").length === 3) {
      try {
        const { verifyClerkToken, provisionProfileForClerkUser } = await import(
          "@/integrations/supabase/clerk-sync.server"
        );
        const clerkUserId = await verifyClerkToken(token);
        const profile = await provisionProfileForClerkUser(clerkUserId);
        applicantUserId = profile.id;
      } catch {
        applicantUserId = null;
      }
    }

    const { data: owner } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", data.org_id)
      .eq("role", "owner")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!owner) throw new Error("This application link is no longer active.");

    let requisitionId: string | null = null;
    if (data.requisition_id) {
      const { data: req } = await supabaseAdmin
        .from("requisitions")
        .select("id")
        .eq("id", data.requisition_id)
        .eq("org_id", data.org_id)
        .maybeSingle();
      requisitionId = req?.id ?? null;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("candidates")
      .insert({
        org_id: data.org_id,
        user_id: owner.user_id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        requisition_id: requisitionId,
        source: data.source,
        stage: "applied" as const,
        notes: data.notes || null,
        applicant_user_id: applicantUserId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Could not submit your application. Please try again.");

    const uploads: { cv_path?: string; cover_letter_path?: string } = {};
    for (const [kind, file, savedId] of [
      ["cv", data.cv ?? null, data.saved_cv_id ?? null],
      ["cover_letter", data.cover_letter ?? null, data.saved_cover_letter_id ?? null],
    ] as const) {
      let sourcePath: string | null = null;
      if (savedId && applicantUserId) {
        const { data: doc } = await supabaseAdmin
          .from("candidate_documents")
          .select("path")
          .eq("id", savedId)
          .eq("user_id", applicantUserId)
          .eq("kind", kind)
          .maybeSingle();
        sourcePath = doc?.path ?? null;
      }
      if (file) {
        const path = `${data.org_id}/${inserted.id}/${kind}-${Date.now()}.${extOf(file.name)}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("candidate-files")
          .upload(path, Buffer.from(file.data, "base64"), {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (!upErr) {
          if (kind === "cv") uploads.cv_path = path;
          else uploads.cover_letter_path = path;

          // Signed-in candidates: keep a copy in "My documents" so the file can
          // be reused for future applications.
          if (applicantUserId) {
            const ext = extOf(file.name);
            const docPath = `applicants/${applicantUserId}/${kind}-${Date.now()}.${ext}`;
            const { error: docUpErr } = await supabaseAdmin.storage
              .from("candidate-files")
              .upload(docPath, Buffer.from(file.data, "base64"), {
                contentType: file.type || "application/octet-stream",
                upsert: false,
              });
            if (!docUpErr) {
              const label = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || file.name.slice(0, 120);
              const { error: docErr } = await supabaseAdmin
                .from("candidate_documents")
                .insert({ user_id: applicantUserId, kind, label, path: docPath });
              if (docErr) await supabaseAdmin.storage.from("candidate-files").remove([docPath]);
            }
          }
        }

      } else if (sourcePath) {
        // Copy the candidate's saved document into the org-owned prefix so the
        // hiring team can open it under their storage policy.
        const path = `${data.org_id}/${inserted.id}/${kind}-${Date.now()}.${extOf(sourcePath)}`;
        const { error: cpErr } = await supabaseAdmin.storage
          .from("candidate-files")
          .copy(sourcePath, path);
        if (!cpErr) {
          if (kind === "cv") uploads.cv_path = path;
          else uploads.cover_letter_path = path;
        }
      }
    }
    if (Object.keys(uploads).length > 0) {
      await supabaseAdmin.from("candidates").update(uploads).eq("id", inserted.id);
    }

    return { ok: true as const };
  });
