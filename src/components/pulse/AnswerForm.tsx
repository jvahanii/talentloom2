import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import type { PreviousAnswers, PulseQuestion } from "@/lib/pulse.functions";

export type AnswerMap = Record<string, number | string | boolean | string[] | null>;

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={`rounded-full border-2 px-4 py-1.5 text-sm transition ${
        active ? "border-primary bg-primary/20 font-semibold" : "border-border bg-card hover:bg-secondary"
      }`}
    >
      {children}
    </Button>
  );
}

function formatPrevious(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  return String(value);
}

function RatingTrend({ entries }: { entries: { roundNumber: number; value: number }[] }) {
  if (entries.length < 2) return null;
  const points = [...entries].reverse();
  const width = Math.max(300, points.length * 76);
  const x = (i: number) => 30 + (i * (width - 60)) / (points.length - 1);
  const y = (value: number) => 108 - (value - 1) * 17;
  return (
    <div className="mb-3 overflow-x-auto" role="img" aria-label={`Rating trend, oldest to newest: ${points.map((entry) => `round ${entry.roundNumber}, ${entry.value} out of 5`).join("; ")}`}>
      <svg viewBox={`0 0 ${width} 144`} className="h-36 min-w-full text-primary" style={{ width }} aria-hidden="true">
        {[1, 3, 5].map((n) => (
          <g key={n}>
            <line x1="30" x2={width - 30} y1={y(n)} y2={y(n)} className="stroke-border" strokeDasharray="3 5" />
            <text x="3" y={y(n) + 4} className="fill-muted-foreground" fontSize="11">{n}</text>
          </g>
        ))}
        <polyline points={points.map((entry, i) => `${x(i)},${y(entry.value)}`).join(" ")} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((entry, i) => (
          <g key={`${entry.roundNumber}-${i}`}>
            <circle cx={x(i)} cy={y(entry.value)} r={i === points.length - 1 ? 6 : 4} className="fill-primary stroke-card" strokeWidth="2" />
            <text x={x(i)} y={y(entry.value) - 12} textAnchor="middle" className="fill-foreground" fontSize="12" fontWeight="600">{entry.value}</text>
            <text x={x(i)} y="137" textAnchor="middle" className="fill-muted-foreground" fontSize="11">R{entry.roundNumber}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function AnswerHistory({ question, previous }: { question: PulseQuestion; previous: PreviousAnswers }) {
  const entries = previous
    .map((round) => ({ roundNumber: round.roundNumber, submittedAt: round.submittedAt, value: round.answers[question.id] }))
    .filter((entry) => formatPrevious(entry.value) !== null);
  if (!entries.length) return null;
  const ratings = question.type === "rating"
    ? entries.filter((entry): entry is typeof entry & { value: number } => typeof entry.value === "number" && entry.value >= 1 && entry.value <= 5)
    : [];

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label={`Your earlier answers to ${question.prompt}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-semibold">Your earlier answers</h3>
        <span className="text-xs text-muted-foreground">Newest first</span>
      </div>
      <RatingTrend entries={ratings} />
      <ol className="relative ml-2 border-l-2 border-border pl-5">
        {entries.map((entry, index) => (
          <li key={`${entry.roundNumber}-${entry.submittedAt}`} className={`relative pb-4 last:pb-0 ${index > 0 ? "text-muted-foreground" : "text-foreground"}`}>
            <span aria-hidden="true" className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${index === 0 ? "bg-primary" : "bg-muted-foreground/50"}`} />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className={index === 0 ? "font-bold text-foreground" : "font-medium"}>Round {entry.roundNumber}</span>
              {index === 0 && <span className="rounded-full bg-primary/20 px-2 py-0.5 font-semibold text-foreground">Latest</span>}
              <time dateTime={entry.submittedAt} className="text-muted-foreground">{formatDate(entry.submittedAt)}</time>
            </div>
            <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${index === 0 ? "font-medium" : ""}`}>
              {formatPrevious(entry.value)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AnswerForm({
  questions,
  submitting,
  submitLabel = "Send answers",
  previous,
  onSubmit,
}: {
  questions: PulseQuestion[];
  submitting?: boolean;
  submitLabel?: string;
  /** The answering person's own earlier answers, newest round first. */
  previous?: PreviousAnswers | null;
  onSubmit: (answers: AnswerMap) => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [missing, setMissing] = useState<string[]>([]);
  const set = (id: string, v: AnswerMap[string]) => setAnswers((a) => ({ ...a, [id]: v }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const miss = questions
          .filter((q) => {
            const v = answers[q.id];
            return q.required && (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length));
          })
          .map((q) => q.id);
        setMissing(miss);
        if (!miss.length) onSubmit(answers);
      }}
    >
      {questions.map((q, i) => {
        const v = answers[q.id];
        return (
          <div
            key={q.id}
            className={`rounded-2xl border-2 bg-card p-4 ${missing.includes(q.id) ? "border-destructive" : "border-border"}`}
          >
            <p className="mb-3 font-medium">
              {i + 1}. {q.prompt}
              {q.required && <span className="ml-1 text-destructive">*</span>}
            </p>
            {q.type === "rating" && (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pill key={n} active={v === n} onClick={() => set(q.id, n)}>
                    {n}
                  </Pill>
                ))}
                <span className="self-center text-xs text-muted-foreground">1 = low, 5 = high</span>
              </div>
            )}
            {q.type === "yesno" && (
              <div className="flex gap-2">
                <Pill active={v === true} onClick={() => set(q.id, true)}>Yes</Pill>
                <Pill active={v === false} onClick={() => set(q.id, false)}>No</Pill>
              </div>
            )}
            {q.type === "single" && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <Pill key={o} active={v === o} onClick={() => set(q.id, o)}>{o}</Pill>
                ))}
              </div>
            )}
            {q.type === "multi" && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const arr = Array.isArray(v) ? v : [];
                  const on = arr.includes(o);
                  return (
                    <Pill key={o} active={on} onClick={() => set(q.id, on ? arr.filter((x) => x !== o) : [...arr, o])}>
                      {o}
                    </Pill>
                  );
                })}
              </div>
            )}
            {q.type === "text" && (
              <Textarea
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(q.id, e.target.value)}
                maxLength={5000}
                rows={3}
              />
            )}
            {previous && <AnswerHistory question={q} previous={previous} />}
          </div>
        );
      })}
      {missing.length > 0 && <p className="text-sm text-destructive">Please answer the questions marked with *.</p>}
      <Button type="submit" disabled={submitting || !questions.length}>
        {submitting ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
