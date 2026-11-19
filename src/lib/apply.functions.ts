import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { documentContentType, documentProblem } from "./file-types";

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

function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** The visitor's address as Vercel saw it. Vercel overwrites these headers
 *  with the real client address, so visitors can't pick their own. */
function clientIp() {
  return (
    getRequestHeader("x-real-ip")?.trim() ||
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

const APPLICATION_LIMIT = 5;
const APPLICATION_WINDOW_SECONDS = 10 * 60;

/** Counts this attempt in the database, so the limit holds across every
 *  server instance. Only a hash of the address is kept, for one day. */
async function rateLimited(ip: string): Promise<boolean> {
  const { createHash } = await import("node:crypto");
  const ipHash = createHash("sha256").update(`talentloom-apply:${ip}`).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabaseAdmin, "note_application_attempt", {
    _ip_hash: ipHash,
    _limit: APPLICATION_LIMIT,
    _window_seconds: APPLICATION_WINDOW_SECONDS,
  });
  if (error) {
    // Don't turn real applicants away because the counter is unavailable.
    console.error("[apply] rate limit check failed:", error.message);
    return false;
  }
  return data === true;
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

export interface BoardEntry {
  /** "position": a Talentloom position, applied for here. "ad": a job ad
   *  imported from a public list, read and applied for at `url`. */
  kind: "position" | "ad";
  id: string;
  title: string;
  /** What the company filter matches on: an organisation id, or "ad:<name>". */
  orgId: string;
  orgName: string;
  department: string | null;
  location: string | null;
  targetStartDate: string | null;
  deadlineDate: string | null;
  excerpt: string;
  /** For sorting by newest: when it was posted. */
  postedAt: string;
  /** The day it was added: an imported ad's creation date on its list (in
   *  Agilefant), a position's creation date here. Null when the list gave none. */
  addedOn: string | null;
  url: string | null;
  /** Why it is no longer open (deadline passed, or gone from its list), or
   *  null while it is. */
  closed: "deadline" | "removed" | null;
}

interface ImportedAdRow {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  deadline_date: string | null;
  posted_on: string | null;
  first_seen_at: string;
  removed_at: string | null;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Imported ads, open and closed: the board shows closed ones under "Past". */
async function listImportedAds(): Promise<BoardEntry[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  // imported_job_ads was created directly on the backend project.
  const db = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const today = todayUtc();
  const rows: ImportedAdRow[] = [];
  // The API answers at most 1000 rows a request.
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await db
      .from("imported_job_ads")
      .select(
        "id, title, company, location, url, deadline_date, posted_on, first_seen_at, removed_at",
      )
      .order("posted_on", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + 999);
    if (error) {
      console.error("imported_job_ads:", error.message);
      break;
    }
    rows.push(...((data ?? []) as ImportedAdRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map((r) => ({
    kind: "ad" as const,
    id: r.id,
    title: r.title,
    orgId: `ad:${(r.company ?? "").toLowerCase()}`,
    orgName: r.company ?? "",
    department: null,
    location: r.location,
    targetStartDate: null,
    deadlineDate: r.deadline_date,
    excerpt: "",
    postedAt: r.posted_on ?? r.first_seen_at.slice(0, 10),
    addedOn: r.posted_on,
    url: r.url,
    closed: r.removed_at
      ? ("removed" as const)
      : r.deadline_date && r.deadline_date < today
        ? ("deadline" as const)
        : null,
  }));
}

export const listOpenPositions = createServerFn({ method: "GET" }).handler(
  async (): Promise<BoardEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const adsPromise = listImportedAds();
    const { data: reqsRaw } = await supabaseAdmin
      .from("requisitions")
      .select(
        "id, title, org_id, department, target_start_date, deadline_date, description, created_at",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200);
    const reqs = (reqsRaw ?? []) as unknown as (PositionListRow & { created_at: string })[];
    let positions: BoardEntry[] = [];
    if (reqs.length > 0) {
      const { data: orgs } = await supabaseAdmin
        .from("organizations")
        .select("id, name")
        .in("id", [...new Set(reqs.map((r) => r.org_id))]);
      const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
      positions = reqs.map((r) => ({
        kind: "position" as const,
        id: r.id,
        title: r.title,
        orgId: r.org_id,
        orgName: names.get(r.org_id) ?? "A company",
        department: r.department,
        location: null,
        targetStartDate: r.target_start_date,
        deadlineDate: r.deadline_date,
        excerpt: (r.description ?? "").slice(0, 220),
        postedAt: r.created_at.slice(0, 10),
        addedOn: r.created_at.slice(0, 10),
        url: null,
        closed: r.deadline_date && r.deadline_date < todayUtc() ? ("deadline" as const) : null,
      }));
    }
    return [...positions, ...(await adsPromise)];
  },
);

export const getPosition = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const { data: reqRaw } = await supabaseAdmin
      .from("requisitions")
      .select(
        "id, title, org_id, department, hiring_manager, target_start_date, deadline_date, description, status",
      )
      .eq("id", data.id)
      .maybeSingle();
    const req = reqRaw as unknown as
      (PositionListRow & { hiring_manager: string | null; status: string }) | null;
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
        roles: [] as {
          id: string;
          title: string;
          department: string | null;
          description: string | null;
          deadline_date: string | null;
        }[],
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
    for (const f of [data.cv, data.cover_letter]) {
      if (!f) continue;
      const bytes = Buffer.from(f.data, "base64");
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");
      const problem = documentProblem(f.name, bytes);
      if (problem) throw new Error(problem);
    }

    if (await rateLimited(clientIp()))
      throw new Error("Too many applications from this device. Please try again later.");
    if (!data.cv && !data.saved_cv_id) throw new Error("Please attach your CV.");

    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");

    // Signed-in candidates: attach the application to their account. The bearer
    // token is optional — anonymous applicants submit without one.
    let applicantUserId: string | null = null;
    const bearer = getRequestHeader("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
    if (token && token.split(".").length === 3) {
      try {
        const { verifyClerkToken, provisionProfileForClerkUser } =
          await import("@/integrations/supabase/clerk-sync.server");
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
            contentType: documentContentType(file.name),
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
                contentType: documentContentType(file.name),
                upsert: false,
              });
            if (!docUpErr) {
              const label =
                file.name.replace(/\.[^.]+$/, "").slice(0, 120) || file.name.slice(0, 120);
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
