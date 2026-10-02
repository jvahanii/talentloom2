import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreviousAnswers, PreviousRoundEntry, PulseQuestion } from "@/lib/pulse.functions";
import { QuestionHistory, type QuestionHistoryItem } from "./QuestionHistory";

export type AnswerMap = Record<string, number | string | boolean | string[] | null>;

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-4 py-1.5 text-sm transition ${
        active
          ? "border-primary bg-primary/20 font-semibold"
          : "border-border bg-card hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function AnswerForm({
  questions,
  submitting,
  submitLabel = "Send answers",
  previous,
  previousRounds,
  onSubmit,
}: {
  questions: PulseQuestion[];
  submitting?: boolean;
  submitLabel?: string;
  /** Legacy single-round previous answers. */
  previous?: PreviousAnswers | null;
  /** Full history of earlier rounds (newest first). */
  previousRounds?: PreviousRoundEntry[] | null;
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
            return (
              q.required &&
              (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length))
            );
          })
          .map((q) => q.id);
        setMissing(miss);
        if (!miss.length) onSubmit(answers);
      }}
    >
      {questions.map((q, i) => {
        const v = answers[q.id];

        // Gather complete history for this question, sorted newest first
        const history: QuestionHistoryItem[] = previousRounds
          ? previousRounds
              .map((r) => ({
                roundNumber: r.roundNumber,
                submittedAt: r.submittedAt,
                opensOn: r.opensOn,
                value: r.answers[q.id],
              }))
              .filter((h) => h.value !== undefined && h.value !== null && h.value !== "")
          : previous &&
              previous.answers[q.id] !== undefined &&
              previous.answers[q.id] !== null &&
              previous.answers[q.id] !== ""
            ? [
                {
                  roundNumber: previous.roundNumber,
                  submittedAt: null,
                  opensOn: null,
                  value: previous.answers[q.id],
                },
              ]
            : [];

        return (
          <div
            key={q.id}
            className={`rounded-2xl border-2 bg-card p-4 transition-all ${
              missing.includes(q.id)
                ? "border-destructive ring-2 ring-destructive/20"
                : "border-border shadow-[0_2px_0_var(--brand-mint)]"
            }`}
          >
            <p className="mb-3 font-medium">
              {i + 1}. {q.prompt}
              {q.required && <span className="ml-1 text-destructive">*</span>}
            </p>

            {q.type === "rating" && (
              <div className="flex flex-wrap items-center gap-2">
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
                <Pill active={v === true} onClick={() => set(q.id, true)}>
                  Yes
                </Pill>
                <Pill active={v === false} onClick={() => set(q.id, false)}>
                  No
                </Pill>
              </div>
            )}

            {q.type === "single" && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <Pill key={o} active={v === o} onClick={() => set(q.id, o)}>
                    {o}
                  </Pill>
                ))}
              </div>
            )}

            {q.type === "multi" && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const arr = Array.isArray(v) ? v : [];
                  const on = arr.includes(o);
                  return (
                    <Pill
                      key={o}
                      active={on}
                      onClick={() => set(q.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                    >
                      {o}
                    </Pill>
                  );
                })}
              </div>
            )}

            {q.type === "text" && (
              <Textarea
                placeholder="Type your answer here…"
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(q.id, e.target.value)}
                maxLength={5000}
                rows={3}
              />
            )}

            {/* Answer history timeline, graphs, and complete answers */}
            <QuestionHistory question={q} history={history} />
          </div>
        );
      })}

      {missing.length > 0 && (
        <p className="text-sm font-medium text-destructive">
          Please answer the questions marked with *.
        </p>
      )}

      <Button type="submit" disabled={submitting || !questions.length}>
        {submitting ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
