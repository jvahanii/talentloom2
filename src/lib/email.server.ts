// Server-only: sends email through Resend (https://resend.com) with RESEND_API_KEY.

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

// The verified sending domain isn't known to the code, so the sender is taken
// from RESEND_FROM when set, otherwise these are tried in order.
const FROM_NAME = "Talentloom";
const FROM_FALLBACKS = [
  `${FROM_NAME} <pulse@mail.talentloom.org>`,
  `${FROM_NAME} <pulse@talentloom.org>`,
];

const BATCH_SIZE = 100; // Resend's batch limit

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function postBatch(apiKey: string, from: string, emails: OutgoingEmail[]) {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      emails.map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text })),
    ),
  });
  if (res.ok) return { ok: true as const };
  let message = `Resend responded ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body?.message) message = body.message;
  } catch {
    /* keep the status message */
  }
  return { ok: false as const, status: res.status, message };
}

/**
 * Sends the emails in batches. Returns how many were handed to Resend and the
 * first error, if any batch failed.
 */
export async function sendEmails(
  emails: OutgoingEmail[],
): Promise<{ sent: number; failed: number; error: string | null }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new Error("Email isn't set up: RESEND_API_KEY is missing on the server.");
  if (!emails.length) return { sent: 0, failed: 0, error: null };

  const configured = process.env["RESEND_FROM"]?.trim();
  let candidates = configured ? [configured] : FROM_FALLBACKS;
  let sent = 0;
  let failed = 0;
  let error: string | null = null;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    let delivered = false;
    for (const from of candidates) {
      const result = await postBatch(apiKey, from, chunk);
      if (result.ok) {
        delivered = true;
        candidates = [from]; // this sender works; keep using it
        break;
      }
      error = result.message;
      // Only an unverified sending domain is worth retrying with another sender.
      if (result.status !== 403 && !/domain/i.test(result.message)) break;
    }
    if (delivered) sent += chunk.length;
    else failed += chunk.length;
  }
  return { sent, failed, error: failed ? error : null };
}
