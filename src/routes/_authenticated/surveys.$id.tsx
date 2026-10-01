import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  addPulseRespondents,
  deletePulseSurvey,
  getPulseResults,
  getPulseSurvey,
  removePulseRespondent,
  savePulseQuestions,
  setPulseRoundStatus,
  startPulseRound,
  submitPulseInterview,
  updatePulseSurvey,
  type PulseQuestion,
  type QuestionType,
} from "@/lib/pulse.functions";
import { useOrg } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import { AnswerForm } from "@/components/pulse/AnswerForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/surveys/$id")({
  head: () => ({
    meta: [
      { title: "Survey — Talentloom Pulse" },
      { name: "description", content: "Edit questions, run rounds and compare results over time." },
      { property: "og:title", content: "Survey — Talentloom Pulse" },
      { property: "og:description", content: "Edit questions, run rounds and compare results over time." },
    ],
  }),
  component: SurveyPage,
});

const TYPE_LABEL: Record<QuestionType, string> = {
  rating: "Rating 1-5",
  single: "Multiple choice (one)",
  multi: "Multiple choice (many)",
  text: "Free text",
  yesno: "Yes / No",
};

const copy = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success("Link copied");
};
const linkFor = (token: string) => `${window.location.origin}/p/${token}`;

function SurveyPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["pulse", id], queryFn: () => getPulseSurvey({ data: { id } }) });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error || !q.data) return <p className="text-destructive">Could not load this survey.</p>;
  const { survey, rounds } = q.data;
  const refresh = () => q.refetch();
  const isInterview = survey.kind === "interview";
  const usesInvites = !isInterview && survey.response_mode !== "link";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/surveys" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All surveys
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        <p className="text-sm text-muted-foreground">
          {isInterview ? "Structured interview" : "Survey"} · {survey.visibility === "org" ? "Organisation" : "Just me"} ·{" "}
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </p>
      </div>
      <Tabs defaultValue={q.data.questions.length ? "results" : "questions"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="rounds">Rounds{!isInterview && " & sharing"}</TabsTrigger>
          {(usesInvites || isInterview) && <TabsTrigger value="people">{isInterview ? "Interviewees" : "Invited people"}</TabsTrigger>}
          {isInterview && <TabsTrigger value="interview">Run interview</TabsTrigger>}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="results"><Results id={id} /></TabsContent>
        <TabsContent value="questions">
          <QuestionsEditor surveyId={id} initial={q.data.questions} hasAnswers={rounds.some((r) => r.responses > 0)} onSaved={refresh} />
        </TabsContent>
        <TabsContent value="rounds"><Rounds data={q.data} onChange={refresh} /></TabsContent>
        <TabsContent value="people"><People data={q.data} onChange={refresh} /></TabsContent>
        <TabsContent value="interview"><Interview data={q.data} onChange={refresh} /></TabsContent>
        <TabsContent value="settings"><Settings data={q.data} onChange={refresh} /></TabsContent>
      </Tabs>
    </div>
  );
}

type SurveyData = Awaited<ReturnType<typeof getPulseSurvey>>;
type Draft = { id?: string; key: string; type: QuestionType; prompt: string; options: string[]; required: boolean };

function QuestionsEditor({ surveyId, initial, hasAnswers, onSaved }: { surveyId: string; initial: PulseQuestion[]; hasAnswers: boolean; onSaved: () => void }) {
  const toDraft = (qs: PulseQuestion[]): Draft[] => qs.map((x) => ({ ...x, key: x.id }));
  const [items, setItems] = useState<Draft[]>(toDraft(initial));
  const [busy, setBusy] = useState(false);
  useEffect(() => setItems(toDraft(initial)), [initial]);
  const upd = (i: number, patch: Partial<Draft>) => setItems((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setItems((a) => {
      const b = [...a];
      const j = i + d;
      if (j < 0 || j >= b.length) return a;
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });

  return (
    <div className="space-y-4">
      {hasAnswers && (
        <p className="rounded-xl bg-secondary p-3 text-sm">
          Keep question wording stable so rounds stay comparable. Deleting a question also deletes its earlier answers.
        </p>
      )}
      {items.map((it, i) => (
        <div key={it.key} className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{i + 1}.</span>
            <Select value={it.type} onValueChange={(v) => upd(i, { type: v as QuestionType })}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={it.required} onCheckedChange={(v) => upd(i, { required: v })} /> Required
            </label>
            <div className="ml-auto flex gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setItems((a) => a.filter((_, j) => j !== i))} aria-label="Delete question"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <Input value={it.prompt} placeholder="Question" onChange={(e) => upd(i, { prompt: e.target.value })} maxLength={1000} />
          {(it.type === "single" || it.type === "multi") && (
            <Textarea
              rows={3}
              placeholder="One option per line"
              value={it.options.join("\n")}
              onChange={(e) => upd(i, { options: e.target.value.split("\n") })}
            />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setItems((a) => [...a, { key: crypto.randomUUID(), type: "rating", prompt: "", options: [], required: false }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add question
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            if (items.some((x) => !x.prompt.trim())) return toast.error("Every question needs text");
            setBusy(true);
            try {
              await savePulseQuestions({
                data: {
                  surveyId,
                  questions: items.map((x) => ({
                    id: x.id,
                    type: x.type,
                    prompt: x.prompt,
                    options: x.options.map((o) => o.trim()).filter(Boolean),
                    required: x.required,
                  })),
                },
              });
              toast.success("Questions saved");
              onSaved();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save questions"}
        </Button>
      </div>
    </div>
  );
}

function Rounds({ data, onChange }: { data: SurveyData; onChange: () => void }) {
  const [closesOn, setClosesOn] = useState("");
  const { survey, rounds } = data;
  const linkAllowed = survey.kind === "survey" && survey.response_mode !== "invite";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="closes">Closes on (optional)</Label>
          <Input id="closes" type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
        </div>
        <Button
          disabled={!data.questions.length}
          onClick={async () => {
            try {
              const { number } = await startPulseRound({ data: { surveyId: survey.id, closesOn: closesOn || null } });
              toast.success(`Round ${number} started`);
              onChange();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not start round");
            }
          }}
        >
          Start round {rounds.length + 1}
        </Button>
        <p className="text-xs text-muted-foreground">
          {data.questions.length ? "Starting a new round closes the current one." : "Add questions first."}
        </p>
      </div>
      {[...rounds].reverse().map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
          <div>
            <p className="font-semibold">Round {r.number}</p>
            <p className="text-xs text-muted-foreground">
              Opened {formatDate(r.opens_on)}
              {r.closes_on && ` · closes ${formatDate(r.closes_on)}`} · {r.responses} answers
            </p>
          </div>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{r.status === "open" ? "Open" : "Closed"}</span>
          <div className="ml-auto flex gap-2">
            {linkAllowed && r.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => copy(linkFor(r.public_token))}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy public link
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await setPulseRoundStatus({ data: { roundId: r.id, status: r.status === "open" ? "closed" : "open" } });
                onChange();
              }}
            >
              {r.status === "open" ? "Close" : "Reopen"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function People({ data, onChange }: { data: SurveyData; onChange: () => void }) {
  const [text, setText] = useState("");
  const isInterview = data.survey.kind === "interview";
  const latest = data.rounds[data.rounds.length - 1];
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
        <Label htmlFor="ppl">Add people — one per line, as "Name, email" or just an email</Label>
        <Textarea id="ppl" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Aino Virtanen, aino@example.com\nbob@example.com"} />
        <Button
          disabled={!text.trim()}
          onClick={async () => {
            const people = text
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                const parts = l.split(",").map((p) => p.trim());
                const email = parts.find((p) => p.includes("@")) ?? "";
                const name = parts.find((p) => !p.includes("@")) ?? "";
                return { name, email };
              });
            try {
              await addPulseRespondents({ data: { surveyId: data.survey.id, people } });
              setText("");
              onChange();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add people");
            }
          }}
        >
          Add
        </Button>
      </div>
      {!isInterview && (
        <p className="text-sm text-muted-foreground">
          Each person has a personal link that stays the same for every round, so their answers can be followed over time. Send it to them yourself.
        </p>
      )}
      <div className="divide-y divide-border rounded-2xl border-2 border-border bg-card">
        {data.respondents.length === 0 && <p className="p-4 text-sm text-muted-foreground">No one added yet.</p>}
        {data.respondents.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name || p.email}</p>
              {p.name && p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
            </div>
            <span className="text-xs text-muted-foreground">
              {latest && p.answeredRounds.includes(latest.number)
                ? `Answered round ${latest.number}`
                : p.answeredRounds.length
                  ? `Answered rounds ${p.answeredRounds.join(", ")}`
                  : "No answers yet"}
            </span>
            <div className="ml-auto flex gap-1">
              {!isInterview && (
                <Button size="sm" variant="outline" onClick={() => copy(linkFor(p.token))}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Personal link
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove"
                onClick={async () => {
                  await removePulseRespondent({ data: { id: p.id } });
                  onChange();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Interview({ data, onChange }: { data: SurveyData; onChange: () => void }) {
  const openRound = [...data.rounds].reverse().find((r) => r.status === "open");
  const [person, setPerson] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  if (!openRound) return <p className="text-sm text-muted-foreground">Start a round first (Rounds tab).</p>;
  const done = new Set(data.respondents.filter((p) => p.answeredRounds.includes(openRound.number)).map((p) => p.id));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="space-y-1">
          <Label>Interviewee (round {openRound.number})</Label>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Choose a person" /></SelectTrigger>
            <SelectContent>
              {data.respondents.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name || p.email}
                  {done.has(p.id) ? " (done)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Add people in the Interviewees tab.</p>
      </div>
      {person && (
        <AnswerForm
          key={`${person}-${formKey}`}
          questions={data.questions}
          submitting={busy}
          submitLabel="Save interview"
          onSubmit={async (answers) => {
            setBusy(true);
            try {
              await submitPulseInterview({ data: { surveyId: data.survey.id, roundId: openRound.id, respondentId: person, answers } });
              toast.success("Interview saved");
              setPerson("");
              setFormKey((k) => k + 1);
              onChange();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Delta({ value, unit = "" }: { value: number | null; unit?: string }) {
  if (value == null) return <span className="text-xs text-muted-foreground">no earlier round</span>;
  const up = value > 0.005;
  const down = value < -0.005;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-primary/20" : down ? "bg-destructive/15 text-destructive" : "bg-secondary"}`}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : down ? <TrendingDown className="h-3.5 w-3.5" /> : null}
      {value > 0 ? "+" : ""}
      {value.toFixed(unit ? 0 : 2)}
      {unit} vs previous round
    </span>
  );
}

function Results({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["pulse-results", id], queryFn: () => getPulseResults({ data: { id } }) });
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data || !data.rounds.length) return <p className="text-sm text-muted-foreground">No rounds yet. Add questions and start a round.</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {data.rounds.map((r) => (
          <span key={r.id} className="rounded-full border-2 border-border bg-card px-3 py-1 text-xs">
            Round {r.number} · {formatDate(r.opens_on)} · {r.responses} answers
          </span>
        ))}
      </div>
      {data.questions.map((q, i) => {
        const latest = q.stats[q.stats.length - 1];
        const numeric = q.type === "rating" || q.type === "yesno";
        const max = q.type === "rating" ? 5 : 100;
        return (
          <div key={q.id} className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{i + 1}. {q.prompt}</p>
              {numeric && <span className="ml-auto"><Delta value={q.delta} unit={q.type === "yesno" ? " pts" : ""} /></span>}
            </div>
            {numeric && (
              <div className="space-y-1.5">
                {q.stats.map((s) => (
                  <div key={s.roundNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted-foreground">Round {s.roundNumber}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${((s.mean ?? 0) / max) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right">
                      {s.mean == null ? "—" : q.type === "rating" ? `${s.mean.toFixed(2)} / 5` : `${Math.round(s.mean)}% yes`} ({s.count})
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(q.type === "single" || q.type === "multi") && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 text-left font-normal">Option</th>
                      {q.stats.map((s) => <th key={s.roundNumber} className="py-1 text-right font-normal">Round {s.roundNumber}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {q.options.map((o) => (
                      <tr key={o} className="border-t border-border">
                        <td className="py-1">{o}</td>
                        {q.stats.map((s, k) => {
                          const pct = (st: typeof s) => (st.count ? ((st.distribution[o] ?? 0) / st.count) * 100 : 0);
                          const prev = q.stats[k - 1];
                          const d = prev && prev.count && s.count ? pct(s) - pct(prev) : null;
                          return (
                            <td key={s.roundNumber} className="py-1 text-right">
                              {Math.round(pct(s))}%
                              {d != null && Math.abs(d) >= 1 && (
                                <span className={d > 0 ? "ml-1 text-primary" : "ml-1 text-destructive"}>
                                  ({d > 0 ? "+" : ""}{Math.round(d)})
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {q.type === "text" && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {latest?.texts.length ? latest.texts.map((t, k) => <li key={k} className="rounded-lg bg-secondary px-3 py-1.5">{t}</li>) : <li className="text-muted-foreground">No answers in the latest round.</li>}
              </ul>
            )}
          </div>
        );
      })}
      {data.people.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card p-4">
          <p className="mb-3 font-medium">How each person moved (average rating, latest vs previous round)</p>
          <div className="divide-y divide-border text-sm">
            {data.people.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{p.label}</span>
                <span className="text-xs text-muted-foreground">
                  {p.previous?.toFixed(2) ?? "—"} → {p.latest?.toFixed(2) ?? "—"}
                </span>
                <span className="ml-auto"><Delta value={p.delta} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Settings({ data, onChange }: { data: SurveyData; onChange: () => void }) {
  const { survey } = data;
  const { orgs } = useOrg();
  const navigate = useNavigate();
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? "");
  const [mode, setMode] = useState(survey.response_mode);
  const [visibility, setVisibility] = useState(survey.visibility);
  const [org, setOrg] = useState(survey.org_id ?? orgs[0]?.org_id ?? null);
  return (
    <div className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="st" required>Title</Label>
        <Input id="st" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sd">Description</Label>
        <Textarea id="sd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Who owns it</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Just me</SelectItem>
              <SelectItem value="org" disabled={!orgs.length}>My organisation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {visibility === "org" && (
          <div className="space-y-2">
            <Label>Organisation</Label>
            <Select value={org ?? undefined} onValueChange={setOrg}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => <SelectItem key={o.org_id} value={o.org_id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {survey.kind === "survey" && (
          <div className="space-y-2">
            <Label>How people answer</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="link">Anyone with the link</SelectItem>
                <SelectItem value="invite">Invited people only</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!title.trim()}
          onClick={async () => {
            try {
              await updatePulseSurvey({
                data: { id: survey.id, title, description: description || null, responseMode: mode, visibility, orgId: visibility === "org" ? org : null },
              });
              toast.success("Saved");
              onChange();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            }
          }}
        >
          Save settings
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            if (!window.confirm("Delete this survey and all its answers?")) return;
            await deletePulseSurvey({ data: { id: survey.id } });
            navigate({ to: "/surveys" });
          }}
        >
          Delete survey
        </Button>
      </div>
    </div>
  );
}
