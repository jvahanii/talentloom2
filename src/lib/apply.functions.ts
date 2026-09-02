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
  cv: FileSchema,
  cover_letter: FileSchema.nullable().optional(),
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

export const getApplyContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OrgIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", data.org_id)
      .maybeSingle();
    if (!org) return { org: null, roles: [] as { id: string; title: string }[] };
    const { data: reqs } = await supabaseAdmin
      .from("requisitions")
      .select("id, title")
      .eq("org_id", data.org_id)
      .eq("status", "open")
      .order("title");
    return { org: { id: org.id, name: org.name }, roles: reqs ?? [] };
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Could not submit your application. Please try again.");

    const uploads: { cv_path?: string; cover_letter_path?: string } = {};
    for (const [kind, file] of [
      ["cv", data.cv],
      ["cover_letter", data.cover_letter ?? null],
    ] as const) {
      if (!file) continue;
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
      }
    }
    if (Object.keys(uploads).length > 0) {
      await supabaseAdmin.from("candidates").update(uploads).eq("id", inserted.id);
    }

    return { ok: true as const };
  });
