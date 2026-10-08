import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type AccountType = "Superuser" | "Recruiter" | "Candidate" | "Pulse user" | "New";

export type AdminOverview = {
  organisations: {
    id: string;
    name: string;
    createdAt: string;
    creator: string | null;
    members: number;
    owners: string[];
    candidates: number;
    positions: number;
    surveys: number;
    pendingInvites: number;
  }[];
  accounts: {
    id: string;
    name: string | null;
    email: string | null;
    createdAt: string;
    types: AccountType[];
    organisations: { name: string; title: string | null }[];
    applications: number;
    surveysOwned: number;
    surveysInvited: number;
    onboarded: boolean;
    canSignIn: boolean;
  }[];
  surveys: {
    id: string;
    title: string;
    kind: "survey" | "interview";
    status: string;
    owner: string | null;
    sharedWith: string;
    questions: number;
    rounds: number;
    openRound: number | null;
    invited: number;
    responses: number;
    createdAt: string;
  }[];
};

/** Whether the signed-in person is a superuser (decided by the database). */
export const amISuperuser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Loose).rpc("is_superuser");
    return { superuser: data === true };
  });

/** Everything across Talentloom, for superusers only. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const { data: allowed } = await (context.supabase as Loose).rpc("is_superuser");
    if (allowed !== true) throw new Error("Only a superuser can open this page");

    const { supabaseAdmin } = await import("@/integrations/supabase/app-admin.server");
    const admin = supabaseAdmin as Loose;
    const all = async (table: string, columns: string) => {
      const { data, error } = await admin.from(table).select(columns).limit(10000);
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as Loose[];
    };
    const [
      orgs,
      profiles,
      members,
      titles,
      superusers,
      candidates,
      documents,
      positions,
      invites,
      surveys,
      surveyOrgs,
      surveyOwners,
      questions,
      rounds,
      respondents,
      responses,
    ] = await Promise.all([
      all("organizations", "id, name, created_at, created_by"),
      all("profiles", "id, full_name, email, created_at, onboarding_completed_at, clerk_user_id"),
      all("organization_members", "org_id, user_id, role, title_id"),
      all("organization_titles", "id, name"),
      all("app_superusers", "profile_id"),
      all("candidates", "org_id, applicant_user_id"),
      all("candidate_documents", "user_id"),
      all("requisitions", "org_id"),
      all("organization_invites", "org_id, accepted_at, expires_at"),
      all("pulse_surveys", "id, title, kind, status, owner_id, all_orgs, created_at"),
      all("pulse_survey_orgs", "survey_id, org_id"),
      all("pulse_survey_owners", "survey_id, email"),
      all("pulse_questions", "survey_id"),
      all("pulse_rounds", "survey_id, number, status, closes_on"),
      all("pulse_respondents", "survey_id, email"),
      all("pulse_responses", "survey_id"),
    ]);

    const tally = <T extends Loose>(rows: T[], key: (r: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = key(r);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const profileById = new Map(profiles.map((p) => [p.id as string, p]));
    const label = (id: string | null | undefined) => {
      const p = id ? profileById.get(id) : null;
      return p ? ((p.full_name as string | null) || (p.email as string | null) || null) : null;
    };
    const orgName = new Map(orgs.map((o) => [o.id as string, o.name as string]));
    const titleName = new Map(titles.map((t) => [t.id as string, t.name as string]));
    const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const membersByOrg = tally(members, (m) => m.org_id);
    const candidatesByOrg = tally(candidates, (c) => c.org_id);
    const positionsByOrg = tally(positions, (p) => p.org_id);
    const surveysByOrg = tally(surveyOrgs, (s) => s.org_id);
    const invitesByOrg = tally(
      invites.filter((i) => !i.accepted_at && (i.expires_at as string) > now),
      (i) => i.org_id,
    );
    const isOwnerRow = (m: Loose) => m.role === "owner" || titleName.get(m.title_id) === "Owner";

    const superuserIds = new Set(superusers.map((s) => s.profile_id as string));
    const applicationsByUser = tally(candidates, (c) => c.applicant_user_id);
    const documentsByUser = tally(documents, (d) => d.user_id);
    const surveysByOwner = tally(surveys, (s) => s.owner_id);
    const invitedByEmail = tally(respondents, (r) => lower(r.email) || null);
    const coOwnedByEmail = tally(surveyOwners, (r) => lower(r.email) || null);
    const membershipsByUser = new Map<string, Loose[]>();
    for (const m of members) {
      membershipsByUser.set(m.user_id, [...(membershipsByUser.get(m.user_id) ?? []), m]);
    }

    return {
      organisations: orgs
        .map((o) => ({
          id: o.id as string,
          name: o.name as string,
          createdAt: o.created_at as string,
          creator: label(o.created_by),
          members: membersByOrg.get(o.id) ?? 0,
          owners: members
            .filter((m) => m.org_id === o.id && isOwnerRow(m))
            .map((m) => label(m.user_id) ?? "Unknown"),
          candidates: candidatesByOrg.get(o.id) ?? 0,
          positions: positionsByOrg.get(o.id) ?? 0,
          surveys: surveysByOrg.get(o.id) ?? 0,
          pendingInvites: invitesByOrg.get(o.id) ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      accounts: profiles
        .map((p) => {
          const mine = membershipsByUser.get(p.id) ?? [];
          const email = lower(p.email);
          const applications = applicationsByUser.get(p.id) ?? 0;
          const surveysOwned = (surveysByOwner.get(p.id) ?? 0) + (email ? (coOwnedByEmail.get(email) ?? 0) : 0);
          const surveysInvited = email ? (invitedByEmail.get(email) ?? 0) : 0;
          const types: AccountType[] = [];
          if (superuserIds.has(p.id)) types.push("Superuser");
          if (mine.length) types.push("Recruiter");
          if (applications || documentsByUser.get(p.id)) types.push("Candidate");
          if (surveysOwned || surveysInvited) types.push("Pulse user");
          if (!types.length) types.push("New");
          return {
            id: p.id as string,
            name: (p.full_name as string | null) || null,
            email: (p.email as string | null) || null,
            createdAt: p.created_at as string,
            types,
            organisations: mine.map((m) => ({
              name: orgName.get(m.org_id) ?? "Unknown",
              title: titleName.get(m.title_id) ?? (m.role as string | null),
            })),
            applications,
            surveysOwned,
            surveysInvited,
            onboarded: Boolean(p.onboarding_completed_at),
            canSignIn: Boolean(p.clerk_user_id),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      surveys: surveys
        .map((s) => {
          const linked = surveyOrgs.filter((x) => x.survey_id === s.id).map((x) => orgName.get(x.org_id) ?? "Unknown");
          const coOwners = surveyOwners.filter((x) => x.survey_id === s.id).length;
          const shared = [
            s.all_orgs ? "All owner's organisations" : linked.join(", "),
            coOwners ? `${coOwners} co-owner${coOwners === 1 ? "" : "s"}` : "",
          ].filter(Boolean);
          const mineRounds = rounds.filter((r) => r.survey_id === s.id);
          const open = mineRounds
            .filter((r) => r.status === "open" && (!r.closes_on || r.closes_on >= today))
            .sort((a, b) => b.number - a.number)[0];
          return {
            id: s.id as string,
            title: s.title as string,
            kind: s.kind as "survey" | "interview",
            status: s.status as string,
            owner: label(s.owner_id),
            sharedWith: shared.join(" + ") || "Just the owner",
            questions: questions.filter((x) => x.survey_id === s.id).length,
            rounds: mineRounds.length,
            openRound: open ? (open.number as number) : null,
            invited: respondents.filter((x) => x.survey_id === s.id).length,
            responses: responses.filter((x) => x.survey_id === s.id).length,
            createdAt: s.created_at as string,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  });
