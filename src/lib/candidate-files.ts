import { supabase } from "@/integrations/supabase/app-client";

export const CANDIDATE_FILES_BUCKET = "candidate-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx";

const ALLOWED_EXT = ["pdf", "doc", "docx"] as const;

export type CandidateFileKind = "cv" | "cover_letter";

export function fileExtension(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** Returns an error message when the file is not an acceptable CV/cover letter. */
export function validateCandidateFile(file: File): string | null {
  if (file.size === 0) return "That file appears to be empty.";
  if (file.size > MAX_FILE_BYTES) return "Files must be 10 MB or smaller.";
  if (!(ALLOWED_EXT as readonly string[]).includes(fileExtension(file.name)))
    return "Only PDF, DOC or DOCX files are accepted.";
  return null;
}

export function storagePath(orgId: string, candidateId: string, kind: CandidateFileKind, fileName: string) {
  const ext = fileExtension(fileName) || "pdf";
  return `${orgId}/${candidateId}/${kind}-${Date.now()}.${ext}`;
}

/** Uploads a candidate document and returns its storage path. */
export async function uploadCandidateFile(
  orgId: string,
  candidateId: string,
  kind: CandidateFileKind,
  file: File,
): Promise<string> {
  const invalid = validateCandidateFile(file);
  if (invalid) throw new Error(invalid);
  const path = storagePath(orgId, candidateId, kind, file.name);
  const { error } = await supabase.storage
    .from(CANDIDATE_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Time-limited link for viewing a private candidate document. */
export async function candidateFileUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CANDIDATE_FILES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error("Could not create link");
  return data.signedUrl;
}

export async function openCandidateFile(path: string) {
  const url = await candidateFileUrl(path);
  window.open(url, "_blank", "noopener,noreferrer");
}
