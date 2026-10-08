import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminDeleteOrganisation,
  adminDeleteSurvey,
  adminRemoveAccount,
  getAdminOverview,
  type AccountType,
  type AdminOverview,
} from "@/lib/admin.functions";
import { useOrg } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Superuser — Talentloom" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

const TYPE_STYLE: Record<AccountType, string> = {
  Superuser: "bg-primary/20 text-primary",
  Recruiter: "bg-teal-500/15 text-teal-700",
  Candidate: "bg-brand-butter/70 text-brand-ink",
  "Pulse user": "bg-secondary text-foreground",
  New: "bg-muted text-muted-foreground",
};

const th = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
const td = "px-3 py-2 align-top text-sm";

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="border-b border-border">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const { setOrgId, refresh } = useOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const deleteOrganisation = async (o: AdminOverview["organisations"][number]) => {
    const typed = window.prompt(
      `Delete "${o.name}"?\n\nThis permanently deletes its ${o.candidates} candidates, ${o.positions} positions, pipeline history and invites, and removes its ${o.members} members from it. Surveys shared with it stay but lose the link.\n\nType the organisation's name to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== o.name.trim()) return void toast.error("The name didn't match. Nothing was deleted.");
    setBusyId(o.id);
    try {
      const { name } = await adminDeleteOrganisation({ data: { id: o.id } });
      toast.success(`Deleted ${name}`);
      refresh();
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the organisation");
    } finally {
      setBusyId(null);
    }
  };

  const deleteSurvey = async (sv: AdminOverview["surveys"][number]) => {
    const typed = window.prompt(
      `Delete the survey "${sv.title}"?\n\nThis permanently deletes its ${sv.questions} questions, ${sv.rounds} rounds, ${sv.invited} invited people and ${sv.responses} answers.\n\nType the survey's title to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== sv.title.trim()) return void toast.error("The title didn't match. Nothing was deleted.");
    setBusyId(sv.id);
    try {
      const { title } = await adminDeleteSurvey({ data: { id: sv.id } });
      toast.success(`Deleted ${title}`);
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
      void qc.invalidateQueries({ queryKey: ["pulse-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the survey");
    } finally {
      setBusyId(null);
    }
  };

  const removeAccount = async (a: AdminOverview["accounts"][number]) => {
    const who = a.email || a.name || "this account";
    const surveys = a.ownedSurveysDeletedWithAccount;
    const typed = window.prompt(
      `Remove ${who}?\n\nThis permanently removes the account and its sign-in, its organisation memberships, saved documents and job-board ratings${surveys ? `, and deletes the ${surveys} survey${surveys === 1 ? "" : "s"} it owns with all answers` : ""}. Applications it made stay with the organisations.\n\nType ${a.email ? "the email address" : "REMOVE"} to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== (a.email ?? "REMOVE").trim().toLowerCase()) {
      return void toast.error("That didn't match. Nothing was removed.");
    }
    setBusyId(a.id);
    try {
      const r = await adminRemoveAccount({ data: { id: a.id } });
      if (r.signInRemoved) toast.success(`Removed ${r.email ?? "the account"}`);
      else toast.warning(`Removed ${r.email ?? "the account"} from Talentloom, but its sign-in couldn't be deleted at Clerk. Delete it in the Clerk dashboard.`);
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the account");
    } finally {
      setBusyId(null);
    }
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
    retry: false,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the superuser view."}
      </p>
    );
  }

  const q = search.trim().toLowerCase();
  const has = (...values: (string | null | undefined)[]) =>
    !q || values.some((v) => v?.toLowerCase().includes(q));
  const organisations = data.organisations.filter((o) => has(o.name, o.creator, ...o.owners));
  const accounts = data.accounts.filter((a) =>
    has(a.name, a.email, ...a.types, ...a.organisations.map((o) => o.name)),
  );
  const surveys = data.surveys.filter((s) => has(s.title, s.owner, s.sharedWith, s.kind));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Superuser</h1>
          <p className="text-sm text-muted-foreground">
            Everything across Talentloom. Only superusers can open this page.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search names, emails, organisations…"
          className="ml-auto w-full max-w-xs"
          aria-label="Search"
        />
      </div>

      <Tabs defaultValue="organisations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="organisations">Organisations ({organisations.length})</TabsTrigger>
          <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="surveys">Surveys ({surveys.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="organisations">
          <Table
            head={["Organisation", "Owners", "Members", "Candidates", "Positions", "Surveys", "Open invites", "Created", ""]}
          >
            {organisations.map((o) => (
              <tr key={o.id}>
                <td className={`${td} font-medium`}>{o.name}</td>
                <td className={td}>{o.owners.join(", ") || "—"}</td>
                <td className={td}>{o.members}</td>
                <td className={td}>{o.candidates}</td>
                <td className={td}>{o.positions}</td>
                <td className={td}>{o.surveys}</td>
                <td className={td}>{o.pendingInvites}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(o.createdAt)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOrgId(o.id);
                      navigate({ to: "/pipeline" });
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === o.id}
                    onClick={() => deleteOrganisation(o)}
                    aria-label={`Delete ${o.name}`}
                    title="Delete organisation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="accounts">
          <Table head={["Name", "Email", "Type", "Organisations", "Applications", "Surveys", "Created", ""]}>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className={`${td} font-medium`}>{a.name || "—"}</td>
                <td className={td}>
                  {a.email || "—"}
                  {!a.canSignIn && (
                    <span className="block text-xs text-muted-foreground">has never signed in</span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {a.types.map((t) => (
                      <span key={t} className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[t]}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {a.types.includes("Recruiter") && !a.onboarded && (
                    <span className="mt-1 block text-xs text-muted-foreground">onboarding not finished</span>
                  )}
                </td>
                <td className={td}>
                  {a.organisations.length
                    ? a.organisations.map((o) => `${o.name}${o.title ? ` (${o.title})` : ""}`).join(", ")
                    : "—"}
                </td>
                <td className={td}>{a.applications}</td>
                <td className={td}>
                  {a.surveysOwned} owned · {a.surveysInvited} invited
                </td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(a.createdAt)}</td>
                <td className={td}>
                  {!a.types.includes("Superuser") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busyId === a.id}
                      onClick={() => removeAccount(a)}
                      aria-label={`Remove ${a.email ?? a.name ?? "account"}`}
                      title="Remove account"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Types: <strong>Recruiter</strong> is a member of an organisation, <strong>Candidate</strong> has their own
            applications or documents, <strong>Pulse user</strong> owns or is invited to a survey, and{" "}
            <strong>New</strong> has none of these yet. An account can have several types.
          </p>
        </TabsContent>

        <TabsContent value="surveys">
          <Table head={["Survey", "Type", "Owner", "Shared with", "Questions", "Rounds", "Invited", "Answers", "Created", ""]}>
            {surveys.map((s) => (
              <tr key={s.id}>
                <td className={`${td} font-medium`}>
                  <Link to="/surveys/$id" params={{ id: s.id }} className="text-primary hover:underline">
                    {s.title}
                  </Link>
                </td>
                <td className={td}>{s.kind === "interview" ? "Interview" : "Survey"}</td>
                <td className={td}>{s.owner || "—"}</td>
                <td className={td}>{s.sharedWith}</td>
                <td className={td}>{s.questions}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {s.rounds}
                  {s.openRound ? ` · round ${s.openRound} open` : ""}
                </td>
                <td className={td}>{s.invited}</td>
                <td className={td}>{s.responses}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(s.createdAt)}</td>
                <td className={td}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === s.id}
                    onClick={() => deleteSurvey(s)}
                    aria-label={`Delete ${s.title}`}
                    title="Delete survey"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
