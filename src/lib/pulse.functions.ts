import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";
import { z } from "zod";

// Pulse tables are newer than the generated types, so queries go through a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type QuestionType = "rating" | "single" | "multi" | "text" | "yesno";
export type PulseQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  required: boolean;
};
export type PulseRound = {
  id: string;
  number: number;
  opens_on: string;
  closes_on: string | null;
  status: "open" | "closed";
  public_token: string;
  responses: number;
};
export type PulseRespondent = {
  id: string;
  email: string | null;
  name: string | null;
  token: string;
  answeredRounds: number[];
};
export type PulseSurvey = {
  id: string;
  owner_id: string;
  org_id: string | null;
  visibility: "private" | "org";
  kind: "survey" | "interview";
  title: string;
  description: string | null;
  response_mode: "link" | "invite" | "both";
  status: "draft" | "open" | "closed";
  show_previous_answers: boolean;
  all_orgs: boolean;
  orgIds?: string[];
  ownerEmails?: string[];
  orgCount?: number;
  ownerCount?: number;
  created_at: string;
  updated_at: string;
};

const Uuid = z.string().uuid();
const AnswerValue = z.union([z.number(), z.string().max(5000), z.boolean(), z.array(z.string().max(500)).max(50), z.null()]);
const Answers = z.record(Uuid, AnswerValue);

const Sharing = {
  allOrgs: z.boolean(),
  orgIds: z.array(Uuid).max(50),
  ownerEmails: z.array(z.string().trim().toLowerCase().email().max(255)).max(100),
};

async function saveSharing(
  sb: Loose,
  surveyId: string,
  d: { allOrgs: boolean; orgIds: string[]; ownerEmails: string[] },
  userId: string,
) {
  if (d.allOrgs) {
    // "All my organisations": store the editor's current orgs as real links so the
    // survey stays with those orgs even if its creator later leaves them.
    const { data: mem, error: me } = await sb.from("organization_members").select("org_id").eq("user_id", userId);
    fail(me);
    const { data: existing, error: ee } = await sb.from("pulse_survey_orgs").select("org_id").eq("survey_id", surveyId);
    fail(ee);
    const have = new Set(((existing ?? []) as Loose[]).map((x) => x.org_id as string));
    const want = new Set([...d.orgIds, ...((mem ?? []) as Loose[]).map((x) => x.org_id as string)]);
    const add = [...want].filter((id) => !have.has(id));
    if (add.length)
      fail((await sb.from("pulse_survey_orgs").insert(add.map((org_id) => ({ survey_id: surveyId, org_id })))).error);
  } else {
    fail((await sb.from("pulse_survey_orgs").delete().eq("survey_id", surveyId)).error);
    if (d.orgIds.length)
      fail((await sb.from("pulse_survey_orgs").insert(d.orgIds.map((org_id) => ({ survey_id: surveyId, org_id })))).error);
  }
  fail((await sb.from("pulse_survey_owners").delete().eq("survey_id", surveyId)).error);
  if (d.ownerEmails.length)
    fail((await sb.from("pulse_survey_owners").insert(d.ownerEmails.map((email) => ({ survey_id: surveyId, email })))).error);
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const listPulseSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Loose;
    const { data, error } = await sb
      .from("pulse_surveys")
      .select("*, pulse_rounds(id, number, status), pulse_responses(id, round_id), pulse_survey_orgs(org_id), pulse_survey_owners(email)")
      .order("updated_at", { ascending: false });
    fail(error);
    return (data ?? []).map((s: Loose) => {
      const rounds = [...(s.pulse_rounds ?? [])].sort((a: Loose, b: Loose) => b.number - a.number);
      const latest = rounds[0];
      return {
        ...(s as PulseSurvey),
        pulse_rounds: undefined,
        pulse_responses: undefined,
        pulse_survey_orgs: undefined,
        pulse_survey_owners: undefined,
        orgCount: (s.pulse_survey_orgs ?? []).length,
        ownerCount: (s.pulse_survey_owners ?? []).length,
        roundCount: rounds.length,
        latestResponses: latest
          ? (s.pulse_responses ?? []).filter((r: Loose) => r.round_id === latest.id).length
          : 0,
        mine: s.owner_id === context.userId,
      };
    }) as (PulseSurvey & { roundCount: number; latestResponses: number; mine: boolean })[];
  });

/** Surveys where the signed-in user's email is an invited respondent with an unanswered open round. */
export const listPulseAwaiting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const sb = supabaseAdmin as Loose;
    const { data: profile } = await sb.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    const email = (profile?.email as string | null)?.trim();
    if (!email) return [];
    const { data: people } = await sb
      .from("pulse_respondents")
      .select("id, token, survey_id")
      .ilike("email", email);
    if (!people?.length) return [];
    const surveyIds = [...new Set(people.map((p: Loose) => p.survey_id as string))];
    const [{ data: surveys }, { data: rounds }, { data: responses }] = await Promise.all([
      sb.from("pulse_surveys").select("id, title, kind, status").in("id", surveyIds),
      sb.from("pulse_rounds").select("id, survey_id, number, closes_on").in("survey_id", surveyIds).eq("status", "open"),
      sb.from("pulse_responses").select("round_id, respondent_id").in("respondent_id", people.map((p: Loose) => p.id)),
    ]);
    const answered = new Set((responses ?? []).map((r: Loose) => `${r.respondent_id}:${r.round_id}`));
    const surveyById = new Map<string, Loose>((surveys ?? []).map((s: Loose) => [s.id, s]));
    const out: { token: string; title: string; roundNumber: number; closesOn: string | null }[] = [];
    for (const p of people as Loose[]) {
      const survey = surveyById.get(p.survey_id);
      if (!survey || survey.kind !== "survey" || survey.status !== "open") continue;
      const open = (rounds ?? [])
        .filter((r: Loose) => r.survey_id === p.survey_id)
        .sort((a: Loose, b: Loose) => b.number - a.number);
      const round = open.find((r: Loose) => !answered.has(`${p.id}:${r.id}`));
      if (!round) continue;
      out.push({ token: p.token, title: survey.title, roundNumber: round.number, closesOn: round.closes_on });
    }
    return out;
  });

export const createPulseSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        kind: z.enum(["survey", "interview"]),
        ...Sharing,
        responseMode: z.enum(["link", "invite", "both"]),
        inviteOrgId: Uuid.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const shareWithOrg = Boolean(data.inviteOrgId);
    const { data: row, error } = await sb
      .from("pulse_surveys")
      .insert({
        owner_id: context.userId,
        org_id: null,
        visibility: data.allOrgs || data.orgIds.length ? "org" : "private",
        all_orgs: data.allOrgs,
        kind: data.kind,
        title: data.title,
        description: data.description || null,
        // A link-only survey can't be answered through a personal invite link,
        // so switch it to "both" whenever it's being shared with the whole org.
        response_mode: shareWithOrg && data.responseMode === "link" ? "both" : data.responseMode,
      })
      .select("id")
      .single();
    fail(error);
    const surveyId = row.id as string;
    await saveSharing(sb, surveyId, data, context.userId);

    let invited = 0;
    let skipped = 0;
    if (shareWithOrg) {
      // Cap matches addPulseRespondents' own bulk-insert limit, so one very
      // large organisation can't blow past the database/API payload limits.
      const MAX_ORG_INVITE = 500;
      const { data: members, error: membersError } = await sb
        .from("organization_members")
        .select("user_id")
        .eq("org_id", data.inviteOrgId)
        .neq("user_id", context.userId)
        .limit(MAX_ORG_INVITE);
      fail(membersError);
      const userIds = [...new Set((members ?? []).map((m: Loose) => m.user_id as string))];
      if (userIds.length) {
        const { data: people, error: peopleError } = await sb
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds);
        fail(peopleError);
        const found = (people ?? []) as Loose[];
        const rows = found
          .filter((p) => p.email)
          .map((p) => ({ survey_id: surveyId, name: p.full_name || null, email: p.email }));
        // Members without a profile row, or a profile with no email on file,
        // can't get a personal invite link; let the caller know they were skipped.
        skipped = userIds.length - rows.length;
        if (rows.length) {
          const { data: ins, error: insError } = await sb
            .from("pulse_respondents")
            .insert(rows)
            .select("id");
          fail(insError);
          invited = (ins ?? []).length;
        }
      }
    }
    return { id: surveyId, invited, skipped };
  });

export const getPulseSurvey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const [s, q, r, p, resp, manage, so, sw] = await Promise.all([
      sb.from("pulse_surveys").select("*").eq("id", data.id).maybeSingle(),
      sb.from("pulse_questions").select("*").eq("survey_id", data.id).order("position"),
      sb.from("pulse_rounds").select("*").eq("survey_id", data.id).order("number"),
      sb.from("pulse_respondents").select("*").eq("survey_id", data.id).order("created_at"),
      sb.from("pulse_responses").select("id, round_id, respondent_id").eq("survey_id", data.id),
      // Survey owner, or an org owner/admin. Others only get their own respondent row (RLS).
      sb.rpc("can_manage_pulse_survey", { _survey: data.id }),
      sb.from("pulse_survey_orgs").select("org_id").eq("survey_id", data.id),
      sb.from("pulse_survey_owners").select("email").eq("survey_id", data.id),
    ]);
    fail(s.error);
    if (!s.data) throw new Error("Survey not found");
    const responses = (resp.data ?? []) as { round_id: string; respondent_id: string | null }[];
    const rounds = (r.data ?? []) as Loose[];
    const roundNo = new Map(rounds.map((x) => [x.id, x.number as number]));
    return {
      survey: {
        ...(s.data as PulseSurvey),
        // With "All my organisations" on, the links are automatic — don't show them as hand-picked.
        orgIds: s.data.all_orgs ? [] : ((so.data ?? []) as Loose[]).map((x) => x.org_id as string),
        ownerEmails: ((sw.data ?? []) as Loose[]).map((x) => x.email as string),
        orgCount: (so.data ?? []).length,
        ownerCount: (sw.data ?? []).length,
      } as PulseSurvey,
      canManagePeople: manage.data === true,
      questions: (q.data ?? []) as PulseQuestion[],
      rounds: rounds.map((x) => ({
        ...x,
        responses: responses.filter((y) => y.round_id === x.id).length,
      })) as PulseRound[],
      respondents: ((p.data ?? []) as Loose[]).map((x) => ({
        id: x.id,
        email: x.email,
        name: x.name,
        token: x.token,
        answeredRounds: responses
          .filter((y) => y.respondent_id === x.id)
          .map((y) => roundNo.get(y.round_id) ?? 0)
          .sort((a, b) => a - b),
      })) as PulseRespondent[],
    };
  });

export const updatePulseSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: Uuid,
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).nullable(),
        responseMode: z.enum(["link", "invite", "both"]),
        ...Sharing,
        showPreviousAnswers: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { error } = await sb
      .from("pulse_surveys")
      .update({
        show_previous_answers: data.showPreviousAnswers,
        title: data.title,
        description: data.description,
        response_mode: data.responseMode,
        visibility: data.allOrgs || data.orgIds.length ? "org" : "private",
        all_orgs: data.allOrgs,
        org_id: null,
      })
      .eq("id", data.id);
    fail(error);
    await saveSharing(sb, data.id, data, context.userId);
    return { ok: true };
  });

export const deletePulseSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Loose).from("pulse_surveys").delete().eq("id", data.id);
    fail(error);
    return { ok: true };
  });

export const savePulseQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        surveyId: Uuid,
        questions: z
          .array(
            z.object({
              id: Uuid.optional(),
              type: z.enum(["rating", "single", "multi", "text", "yesno"]),
              prompt: z.string().trim().min(1).max(1000),
              options: z.array(z.string().trim().min(1).max(300)).max(30),
              required: z.boolean(),
            }),
          )
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { data: existing, error } = await sb
      .from("pulse_questions")
      .select("id")
      .eq("survey_id", data.surveyId);
    fail(error);
    const keep = new Set(data.questions.map((q) => q.id).filter(Boolean));
    const remove = (existing ?? []).map((x: Loose) => x.id).filter((id: string) => !keep.has(id));
    if (remove.length) fail((await sb.from("pulse_questions").delete().in("id", remove)).error);
    for (const [i, q] of data.questions.entries()) {
      const row = {
        survey_id: data.surveyId,
        position: i,
        type: q.type,
        prompt: q.prompt,
        options: q.type === "single" || q.type === "multi" ? q.options : [],
        required: q.required,
      };
      const res = q.id
        ? await sb.from("pulse_questions").update(row).eq("id", q.id).eq("survey_id", data.surveyId)
        : await sb.from("pulse_questions").insert(row);
      fail(res.error);
    }
    await sb.from("pulse_surveys").update({ updated_at: new Date().toISOString() }).eq("id", data.surveyId);
    return { ok: true };
  });

export const startPulseRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        surveyId: Uuid,
        closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { data: rounds, error } = await sb
      .from("pulse_rounds")
      .select("number")
      .eq("survey_id", data.surveyId)
      .order("number", { ascending: false })
      .limit(1);
    fail(error);
    const next = ((rounds?.[0]?.number as number) ?? 0) + 1;
    fail((await sb.from("pulse_rounds").update({ status: "closed" }).eq("survey_id", data.surveyId).eq("status", "open")).error);
    fail((await sb.from("pulse_rounds").insert({ survey_id: data.surveyId, number: next, closes_on: data.closesOn })).error);
    fail((await sb.from("pulse_surveys").update({ status: "open" }).eq("id", data.surveyId)).error);
    return { number: next };
  });

export const setPulseRoundStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ roundId: Uuid, status: z.enum(["open", "closed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { data: round, error } = await sb
      .from("pulse_rounds")
      .update({ status: data.status })
      .eq("id", data.roundId)
      .select("survey_id")
      .single();
    fail(error);
    const { data: open } = await sb
      .from("pulse_rounds")
      .select("id")
      .eq("survey_id", round.survey_id)
      .eq("status", "open");
    await sb
      .from("pulse_surveys")
      .update({ status: (open ?? []).length ? "open" : "closed" })
      .eq("id", round.survey_id);
    return { ok: true };
  });

export const addPulseRespondents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        surveyId: Uuid,
        people: z
          .array(
            z.object({
              name: z.string().trim().max(200).optional(),
              email: z.string().trim().email().max(255).optional().or(z.literal("")),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const wanted = data.people.filter((p) => p.name || p.email);
    if (!wanted.length) throw new Error("Add a name or an email");

    // Skip emails already on this survey (or repeated in the input): a second
    // row would give the person a second personal link and a duplicate card.
    const { data: existing, error: existingError } = await sb
      .from("pulse_respondents")
      .select("email")
      .eq("survey_id", data.surveyId);
    fail(existingError);
    const seen = new Set(
      ((existing ?? []) as { email: string | null }[])
        .map((x) => x.email?.trim().toLowerCase())
        .filter(Boolean),
    );
    const rows = [];
    let skipped = 0;
    for (const p of wanted) {
      const key = p.email?.trim().toLowerCase();
      if (key && seen.has(key)) {
        skipped++;
        continue;
      }
      if (key) seen.add(key);
      rows.push({ survey_id: data.surveyId, name: p.name || null, email: p.email || null });
    }
    if (!rows.length) return { ids: [] as string[], skipped };

    const { data: ins, error } = await sb.from("pulse_respondents").insert(rows).select("id");
    fail(error);
    return { ids: (ins ?? []).map((x: Loose) => x.id as string), skipped };
  });

export const removePulseRespondent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    fail((await (context.supabase as Loose).from("pulse_respondents").delete().eq("id", data.id)).error);
    return { ok: true };
  });

/** Interviewer records a structured interview session for a person. */
export const submitPulseInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ surveyId: Uuid, roundId: Uuid, respondentId: Uuid.nullable(), answers: Answers }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Loose;
    const { data: resp, error } = await sb
      .from("pulse_responses")
      .insert({
        survey_id: data.surveyId,
        round_id: data.roundId,
        respondent_id: data.respondentId,
        interviewer_id: context.userId,
      })
      .select("id")
      .single();
    fail(error);
    const rows = Object.entries(data.answers)
      .filter(([, v]) => v !== null && v !== "")
      .map(([question_id, value]) => ({ response_id: resp.id, question_id, value }));
    if (rows.length) fail((await sb.from("pulse_answers").insert(rows)).error);
    return { ok: true };
  });

// ---------- Results with round-over-round comparison ----------

export type QuestionRoundStat = {
  roundNumber: number;
  count: number;
  mean: number | null; // rating average, or yes share 0-100
  distribution: Record<string, number>;
  texts: string[];
};
export type PulseResults = {
  rounds: { id: string; number: number; opens_on: string; responses: number }[];
  questions: (PulseQuestion & { stats: QuestionRoundStat[]; delta: number | null })[];
  people: {
    id: string;
    label: string;
    previous: number | null;
    latest: number | null;
    delta: number | null;
  }[];
};

export const getPulseResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: Uuid }).parse(d))
  .handler(async ({ data, context }): Promise<PulseResults> => {
    const sb = context.supabase as Loose;
    const [q, r, resp, people, me] = await Promise.all([
      sb.from("pulse_questions").select("*").eq("survey_id", data.id).order("position"),
      sb.from("pulse_rounds").select("id, number, opens_on").eq("survey_id", data.id).order("number"),
      sb.from("pulse_responses").select("id, round_id, respondent_id, pulse_answers(question_id, value)").eq("survey_id", data.id),
      sb.from("pulse_respondents").select("id, name, email").eq("survey_id", data.id),
      sb.from("profiles").select("email").eq("id", context.userId).maybeSingle(),
    ]);
    fail(q.error);
    fail(resp.error);
    const myEmail = ((me.data?.email as string | null) ?? "").trim().toLowerCase();
    const questions = (q.data ?? []) as PulseQuestion[];
    const rounds = (r.data ?? []) as { id: string; number: number; opens_on: string }[];
    const responses = (resp.data ?? []) as {
      id: string;
      round_id: string;
      respondent_id: string | null;
      pulse_answers: { question_id: string; value: unknown }[];
    }[];

    const statFor = (qq: PulseQuestion, roundId: string, roundNumber: number): QuestionRoundStat => {
      const vals = responses
        .filter((x) => x.round_id === roundId)
        .flatMap((x) => x.pulse_answers.filter((a) => a.question_id === qq.id).map((a) => a.value))
        .filter((v) => v !== null && v !== undefined && v !== "");
      const distribution: Record<string, number> = {};
      const bump = (k: string) => (distribution[k] = (distribution[k] ?? 0) + 1);
      let mean: number | null = null;
      const texts: string[] = [];
      if (qq.type === "rating") {
        const nums = vals.map(Number).filter((n) => !Number.isNaN(n));
        nums.forEach((n) => bump(String(n)));
        mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      } else if (qq.type === "yesno") {
        vals.forEach((v) => bump(v === true ? "Yes" : "No"));
        mean = vals.length ? ((distribution["Yes"] ?? 0) / vals.length) * 100 : null;
      } else if (qq.type === "single" || qq.type === "multi") {
        vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((o) => bump(String(o))));
      } else {
        vals.forEach((v) => texts.push(String(v)));
      }
      return { roundNumber, count: vals.length, mean, distribution, texts };
    };

    const qOut = questions.map((qq) => {
      const stats = rounds.map((rd) => statFor(qq, rd.id, rd.number));
      const last = stats[stats.length - 1];
      const prev = stats[stats.length - 2];
      const delta = last?.mean != null && prev?.mean != null ? last.mean - prev.mean : null;
      return { ...qq, stats, delta };
    });

    // Per-person: average rating score in the latest two rounds they're compared on.
    const ratingIds = new Set(questions.filter((x) => x.type === "rating").map((x) => x.id));
    const scoreIn = (pid: string, roundId: string | undefined) => {
      if (!roundId) return null;
      const nums = responses
        .filter((x) => x.respondent_id === pid && x.round_id === roundId)
        .flatMap((x) => x.pulse_answers.filter((a) => ratingIds.has(a.question_id)).map((a) => Number(a.value)))
        .filter((n) => !Number.isNaN(n));
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    };
    const lastRound = rounds[rounds.length - 1]?.id;
    const prevRound = rounds[rounds.length - 2]?.id;
    // Only the viewer's own row is identified. Everyone else is anonymised: no
    // name, email or respondent id, and sorted by score so the order can't be
    // matched against the invited-people list.
    const scored = ((people.data ?? []) as Loose[])
      .map((p) => {
        const latest = scoreIn(p.id, lastRound);
        const previous = scoreIn(p.id, prevRound);
        const isMe = !!myEmail && ((p.email as string | null) ?? "").trim().toLowerCase() === myEmail;
        return {
          isMe,
          latest,
          previous,
          delta: latest != null && previous != null ? latest - previous : null,
        };
      })
      .filter((p) => p.latest != null || p.previous != null);
    const mine = scored.filter((p) => p.isMe);
    const others = scored
      .filter((p) => !p.isMe)
      .sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || (b.previous ?? -1) - (a.previous ?? -1));
    const peopleOut = [
      ...mine.map(({ isMe: _isMe, ...p }, i) => ({ id: `me-${i}`, label: "You", ...p })),
      ...others.map(({ isMe: _isMe, ...p }, i) => ({ id: `person-${i + 1}`, label: `Person ${i + 1}`, ...p })),
    ];

    return {
      rounds: rounds.map((rd) => ({
        ...rd,
        responses: responses.filter((x) => x.round_id === rd.id).length,
      })),
      questions: qOut,
      people: peopleOut,
    };
  });

// ---------- Public answering (no sign-in) ----------

async function resolveToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
  const sb = supabaseAdmin as Loose;
  let respondent: { id: string; name: string | null; survey_id: string } | null = null;
  let { data: round } = await sb
    .from("pulse_rounds")
    .select("id, number, status, closes_on, survey_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!round) {
    const { data: rp } = await sb
      .from("pulse_respondents")
      .select("id, name, survey_id")
      .eq("token", token)
      .maybeSingle();
    if (!rp) return null;
    respondent = rp;
    const { data: latest } = await sb
      .from("pulse_rounds")
      .select("id, number, status, closes_on, survey_id")
      .eq("survey_id", rp.survey_id)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    round = latest;
  }
  const surveyId = respondent?.survey_id ?? round?.survey_id;
  const { data: survey } = await sb
    .from("pulse_surveys")
    .select("id, title, description, kind, response_mode, show_previous_answers")
    .eq("id", surveyId)
    .maybeSingle();
  if (!survey || survey.kind !== "survey") return null;
  if (!respondent && survey.response_mode === "invite") return null;
  if (respondent && survey.response_mode === "link") return null;
  const today = new Date().toISOString().slice(0, 10);
  const open = !!round && round.status === "open" && (!round.closes_on || round.closes_on >= today);
  return { sb, survey, round, respondent, open };
}

export type PreviousAnswerValue = number | string | boolean | string[] | null;
export type PreviousAnswers = { roundNumber: number; submittedAt: string; answers: Record<string, PreviousAnswerValue> }[];

export const getPublicPulseForm = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: Uuid }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await resolveToken(data.token);
    if (!ctx) return { found: false as const };
    const { sb, survey, round, respondent, open } = ctx;
    let alreadyAnswered = false;
    if (respondent && round) {
      const { data: prev } = await sb
        .from("pulse_responses")
        .select("id")
        .eq("round_id", round.id)
        .eq("respondent_id", respondent.id)
        .limit(1);
      alreadyAnswered = (prev ?? []).length > 0;
    }
    const { data: qs } = await sb
      .from("pulse_questions")
      .select("id, position, type, prompt, options, required")
      .eq("survey_id", survey.id)
      .order("position");

    // Only a personal token may reveal this respondent's own earlier answers.
    let previousAnswers: PreviousAnswers | null = null;
    if (respondent && round && survey.show_previous_answers) {
      const { data: earlier, error: historyError } = await sb
        .from("pulse_responses")
        .select("id, submitted_at, pulse_rounds!inner(number), pulse_answers(question_id, value)")
        .eq("survey_id", survey.id)
        .eq("respondent_id", respondent.id)
        .lt("pulse_rounds.number", round.number);
      fail(historyError);
      previousAnswers = ((earlier ?? []) as Loose[])
        .sort((a, b) => b.pulse_rounds.number - a.pulse_rounds.number || b.submitted_at.localeCompare(a.submitted_at))
        .map((response) => ({
          roundNumber: response.pulse_rounds.number as number,
          submittedAt: response.submitted_at as string,
          answers: Object.fromEntries(
            ((response.pulse_answers ?? []) as { question_id: string; value: PreviousAnswerValue }[]).map((a) => [
              a.question_id,
              a.value,
            ]),
          ),
        }));
    }

    return {
      previousAnswers,
      found: true as const,
      open,
      alreadyAnswered,
      title: survey.title as string,
      description: (survey.description as string | null) ?? null,
      roundNumber: (round?.number as number) ?? null,
      greetingName: respondent?.name ?? null,
      questions: (qs ?? []) as PulseQuestion[],
    };
  });

export const submitPublicPulse = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: Uuid, answers: Answers }).parse(d))
  .handler(async ({ data }) => {
    const ctx = await resolveToken(data.token);
    if (!ctx || !ctx.open || !ctx.round) throw new Error("This survey is not open right now");
    const { sb, survey, round, respondent } = ctx;
    const { data: qs } = await sb.from("pulse_questions").select("id, type, required").eq("survey_id", survey.id);
    const valid = new Map(((qs ?? []) as Loose[]).map((x) => [x.id, x]));
    for (const qq of valid.values()) {
      const v = data.answers[qq.id];
      if (qq.required && (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)))
        throw new Error("Please answer all required questions");
    }
    if (respondent) {
      const { data: prev } = await sb
        .from("pulse_responses")
        .select("id")
        .eq("round_id", round.id)
        .eq("respondent_id", respondent.id);
      if ((prev ?? []).length) throw new Error("You've already answered this round");
    }
    const { data: resp, error } = await sb
      .from("pulse_responses")
      .insert({ survey_id: survey.id, round_id: round.id, respondent_id: respondent?.id ?? null })
      .select("id")
      .single();
    fail(error);
    const rows = Object.entries(data.answers)
      .filter(([qid, v]) => valid.has(qid) && v !== null && v !== "")
      .map(([question_id, value]) => ({ response_id: resp.id, question_id, value }));
    if (rows.length) fail((await sb.from("pulse_answers").insert(rows)).error);
    return { ok: true };
  });
