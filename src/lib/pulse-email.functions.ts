import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";

// Pulse tables are newer than the generated types, so queries go through a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** The site's public address, for links in emails. */
function siteOrigin(): string {
  const request = getRequest();
  const origin = request.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  return new URL(request.url).origin;
}

/**
 * Emails invited people their personal link for the survey's open round.
 * Only people who haven't answered that round get one, so it serves both as
 * the round invitation and as a reminder. Limited to people who may see the
 * invited list: the survey's owners and its organisations' owners and admins.
 */
export const sendPulseRoundEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ surveyId: z.string().uuid(), kind: z.enum(["invite", "reminder"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { data: canManage } = await sb.rpc("can_manage_pulse_survey", { _survey: data.surveyId });
    if (canManage !== true) throw new Error("Only the survey's owners and organisation admins can email invited people");

    const [{ data: survey, error: surveyError }, { data: rounds }, { data: people }, { data: me }] =
      await Promise.all([
        sb.from("pulse_surveys").select("id, title, description, kind, response_mode").eq("id", data.surveyId).maybeSingle(),
        sb.from("pulse_rounds").select("id, number, closes_on, status").eq("survey_id", data.surveyId).eq("status", "open").order("number", { ascending: false }),
        sb.from("pulse_respondents").select("id, name, email, token").eq("survey_id", data.surveyId),
        sb.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      ]);
    if (surveyError) throw new Error(surveyError.message);
    if (!survey) throw new Error("Survey not found");
    if (survey.kind !== "survey" || survey.response_mode === "link") {
      throw new Error("This survey doesn't use personal links, so there is nothing to email");
    }
    const today = new Date().toISOString().slice(0, 10);
    const round = ((rounds ?? []) as Loose[]).find((r) => !r.closes_on || r.closes_on >= today);
    if (!round) throw new Error("There is no open round. Start a round first.");

    const { data: responses } = await sb.from("pulse_responses").select("respondent_id").eq("round_id", round.id);
    const answered = new Set(((responses ?? []) as Loose[]).map((r) => r.respondent_id as string | null));
    const invited = (people ?? []) as { id: string; name: string | null; email: string | null; token: string }[];
    const pending = invited.filter((p) => !answered.has(p.id));
    const recipients = pending.filter((p) => p.email?.trim());

    const { escapeHtml, sendEmails } = await import("@/lib/email.server");
    const origin = siteOrigin();
    const sender = (me?.full_name as string | null)?.trim() || "A colleague";
    const title = String(survey.title);
    const subject =
      data.kind === "reminder"
        ? `Reminder: ${title} (round ${round.number}) is waiting for your answer`
        : `${title}: round ${round.number} is open`;
    const closes = round.closes_on ? ` It closes on ${round.closes_on}.` : "";

    const emails = recipients.map((p) => {
      const link = `${origin}/p/${p.token}`;
      const hello = p.name?.trim() ? `Hi ${p.name.trim()},` : "Hi,";
      const lead =
        data.kind === "reminder"
          ? `A reminder that round ${round.number} of "${title}" is still waiting for your answer.${closes}`
          : `${sender} invites you to answer round ${round.number} of "${title}".${closes}`;
      const note = "This link is personal to you, so please don't forward it.";
      const text = [hello, "", lead, "", `Answer here: ${link}`, "", note, "", "Sent with Talentloom Pulse"].join("\n");
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2d2433;max-width:520px">
<p>${escapeHtml(hello)}</p>
<p>${escapeHtml(lead)}</p>
${survey.description ? `<p style="color:#6b6072">${escapeHtml(String(survey.description)).replace(/\n/g, "<br>")}</p>` : ""}
<p style="margin:24px 0"><a href="${link}" style="background:#2fbf9f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold;display:inline-block">Answer the survey</a></p>
<p style="font-size:13px;color:#6b6072">${escapeHtml(note)}<br>If the button doesn't work, open this link: <a href="${link}">${link}</a></p>
<p style="font-size:12px;color:#9a90a0">Sent with Talentloom Pulse</p>
</div>`;
      return { to: p.email!.trim(), subject, html, text };
    });

    const result = await sendEmails(emails);
    return {
      roundNumber: round.number as number,
      sent: result.sent,
      failed: result.failed,
      error: result.error,
      noEmail: pending.length - recipients.length,
      alreadyAnswered: invited.length - pending.length,
    };
  });
