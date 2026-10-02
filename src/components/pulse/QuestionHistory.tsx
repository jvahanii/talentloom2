import { useId } from "react";
import { Check, Clock, History, Minus, TrendingDown, TrendingUp, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PreviousAnswerValue, PulseQuestion } from "@/lib/pulse.functions";

export type QuestionHistoryItem = {
  roundNumber: number;
  submittedAt?: string | null;
  opensOn?: string | null;
  value: PreviousAnswerValue;
};

function formatOptionList(val: PreviousAnswerValue): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (val === null || val === undefined || val === "") return [];
  return [String(val)];
}

/**
 * Clean SVG Sparkline graph for rating history across rounds (chronological left to right).
 */
function RatingSparkline({ history }: { history: QuestionHistoryItem[] }) {
  const gradientId = useId();
  // History is newest-first; sort chronological (oldest to newest) for left-to-right time graph
  const chronological = [...history].sort((a, b) => a.roundNumber - b.roundNumber);
  const scores = chronological.map((h) => Number(h.value)).filter((n) => !Number.isNaN(n));

  if (scores.length < 2) return null;

  const width = 280;
  const height = 64;
  const padX = 28;
  const padY = 16;
  const stepX = (width - padX * 2) / (chronological.length - 1);

  // Map 1..5 rating to Y coordinates (5 at top, 1 at bottom)
  const getY = (val: number) => {
    const clamped = Math.max(1, Math.min(5, val));
    return height - padY - ((clamped - 1) / 4) * (height - padY * 2);
  };

  const points = chronological.map((h, i) => ({
    roundNumber: h.roundNumber,
    score: Number(h.value),
    x: padX + i * stepX,
    y: getY(Number(h.value)),
    isLatest: i === chronological.length - 1,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  const latestScore = points[points.length - 1].score;
  const prevScore = points[points.length - 2].score;
  const delta = latestScore - prevScore;

  return (
    <div className="mb-4 rounded-xl border border-border/80 bg-secondary/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Rating trend across rounds</span>
        <div className="flex items-center gap-1.5 text-xs">
          {delta > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="h-3 w-3" /> +{delta.toFixed(delta % 1 === 0 ? 0 : 1)} vs round{" "}
              {points[points.length - 2].roundNumber}
            </span>
          )}
          {delta < 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-300">
              <TrendingDown className="h-3 w-3" /> {delta.toFixed(delta % 1 === 0 ? 0 : 1)} vs round{" "}
              {points[points.length - 2].roundNumber}
            </span>
          )}
          {delta === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-muted-foreground">
              <Minus className="h-3 w-3" /> Unchanged ({latestScore}/5)
            </span>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-16 w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Guide gridlines for rating scale 1, 3, 5 */}
          {[1, 3, 5].map((g) => (
            <line
              key={g}
              x1={padX - 8}
              y1={getY(g)}
              x2={width - padX + 8}
              y2={getY(g)}
              stroke="currentColor"
              strokeDasharray="2 4"
              className="text-border/60"
              strokeWidth="1"
            />
          ))}

          {/* Area fill under curve */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Sparkline curve */}
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-primary"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points & labels */}
          {points.map((p) => (
            <g key={p.roundNumber} className="cursor-default">
              {p.isLatest ? (
                <>
                  <circle cx={p.x} cy={p.y} r="7" className="fill-primary/25 animate-pulse" />
                  <circle cx={p.x} cy={p.y} r="4.5" className="fill-primary stroke-card stroke-2" />
                </>
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  className="fill-muted-foreground/70 stroke-card stroke-1"
                />
              )}
              {/* Point label: R1: 4 */}
              <text
                x={p.x}
                y={p.y <= 24 ? p.y + 13 : p.y - 6}
                textAnchor="middle"
                className={`text-[9px] ${p.isLatest ? "font-bold fill-foreground" : "font-medium fill-muted-foreground"}`}
              >
                R{p.roundNumber}: {p.score}★
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * Question history component:
 * - Shows results under each question
 * - Newest first (chronological timeline)
 * - Highlights the latest one
 * - Progressively lighter / more transparent for older entries
 * - Renders graphs (SVG rating trend sparkline)
 * - Completely displays free-text responses without truncation
 * - Marked timeline with clear round badges and timestamps
 */
export function QuestionHistory({
  question,
  history,
}: {
  question: PulseQuestion;
  history: QuestionHistoryItem[];
}) {
  if (!history || history.length === 0) return null;

  // Ensure newest first
  const sorted = [...history].sort((a, b) => b.roundNumber - a.roundNumber);

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5 text-primary" />
          <span>Your answer history</span>
          <span className="font-normal normal-case text-muted-foreground">
            ({sorted.length} {sorted.length === 1 ? "round" : "rounds"} · newest first)
          </span>
        </div>
      </div>

      {/* Graphs where it makes sense: Rating trend chart for 2+ rounds */}
      {question.type === "rating" && sorted.length >= 2 && <RatingSparkline history={sorted} />}

      {/* Timeline spine layout */}
      <div className="relative space-y-3.5 pl-6 before:absolute before:bottom-2.5 before:left-[9px] before:top-2.5 before:w-0.5 before:bg-border/70">
        {sorted.map((item, index) => {
          const isLatest = index === 0;
          // Progressively lighter and more transparent as rounds get older
          const opacityClass =
            index === 0
              ? "opacity-100"
              : index === 1
                ? "opacity-80"
                : index === 2
                  ? "opacity-65"
                  : index === 3
                    ? "opacity-50"
                    : "opacity-40";

          return (
            <div key={item.roundNumber} className={`relative transition-opacity ${opacityClass}`}>
              {/* Timeline marker node on spine */}
              <div
                className={`absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full border transition-all ${
                  isLatest
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_8px_var(--primary)] ring-2 ring-primary/30"
                    : "border-border bg-card text-muted-foreground"
                }`}
                title={`Round ${item.roundNumber}`}
              >
                <span
                  className={`rounded-full ${isLatest ? "h-1.5 w-1.5 bg-card" : "h-1 w-1 bg-muted-foreground/60"}`}
                />
              </div>

              {/* Header with Round info, highlight, and date */}
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-bold ${isLatest ? "text-foreground" : "text-muted-foreground"}`}
                >
                  Round {item.roundNumber}
                </span>

                {isLatest && (
                  <span className="rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    Latest
                  </span>
                )}

                {(item.submittedAt || item.opensOn) && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3 opacity-60" />
                    {formatDate(item.submittedAt || item.opensOn!)}
                  </span>
                )}
              </div>

              {/* Answer Value Rendering according to question type */}
              {question.type === "rating" && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-secondary/30 px-3 py-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <span
                        key={num}
                        className={`h-2.5 w-5 rounded-sm transition-colors ${
                          num <= Number(item.value)
                            ? isLatest
                              ? "bg-primary font-bold shadow-xs"
                              : "bg-primary/70"
                            : "bg-secondary border border-border/50"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-foreground">{item.value} / 5</span>
                  <span className="text-[11px] text-muted-foreground">
                    (
                    {Number(item.value) === 5
                      ? "Highest rating"
                      : Number(item.value) === 1
                        ? "Lowest rating"
                        : "Rating score"}
                    )
                  </span>
                </div>
              )}

              {question.type === "yesno" && (
                <div className="flex items-center gap-2">
                  {item.value === true ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" /> Yes
                    </span>
                  ) : item.value === false ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      <X className="h-3.5 w-3.5" /> No
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No answer</span>
                  )}
                </div>
              )}

              {(question.type === "single" || question.type === "multi") && (
                <div className="flex flex-wrap gap-1.5">
                  {formatOptionList(item.value).length ? (
                    formatOptionList(item.value).map((opt) => (
                      <span
                        key={opt}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          isLatest
                            ? "border-primary/50 bg-primary/15 font-semibold text-foreground shadow-xs"
                            : "border-border bg-secondary/80 text-muted-foreground"
                        }`}
                      >
                        {opt}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No answer</span>
                  )}
                </div>
              )}

              {/* In Freetext-field show the previous answer completely */}
              {question.type === "text" && (
                <div
                  className={`rounded-xl border p-3 text-sm transition-all ${
                    isLatest
                      ? "border-border border-l-4 border-l-primary bg-card shadow-xs"
                      : "border-border/60 border-l-4 border-l-muted-foreground/40 bg-muted/30"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground sm:text-sm">
                    {String(item.value)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
