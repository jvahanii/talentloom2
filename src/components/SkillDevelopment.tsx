import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchSkillHistory, type SkillHistoryPoint } from "@/lib/skillLevels";
import { displayLevel, skillLevelLabel } from "@/lib/skills";

/**
 * How skill levels develop over time, from org_member_skill_history: by skill
 * (the average level of the people who have it) or by person (a line per
 * skill). Levels are recorded whenever they change, from 5 Nov 2026 on.
 */

// Categorical slots in fixed order (validated reference palette, light surface).
const SERIES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
const MAX_SERIES = SERIES.length;

type Person = { userId: string; label: string };
type Row = { t: number } & Record<string, number | null>;

export const skillHistoryKey = (orgId: string) => ["org-skills", orgId, "history"];

const day = (t: number) => format(t, "d MMM yyyy");

/** Step points of one person's level in one skill, carried on to now. */
function stepsOf(events: SkillHistoryPoint[]): { t: number; v: number | null }[] {
  return events.map((e) => ({ t: e.at, v: e.level }));
}

/** Rows for a multi-series step chart: every change time, each series carried forward. */
function toRows(
  series: { key: string; points: { t: number; v: number | null }[] }[],
  now: number,
): Row[] {
  const times = [...new Set([...series.flatMap((s) => s.points.map((p) => p.t)), now])].sort(
    (a, b) => a - b,
  );
  return times.map((t) => {
    const row: Row = { t };
    for (const s of series) {
      const before = s.points.filter((p) => p.t <= t);
      row[s.key] = before.length ? before[before.length - 1].v : null;
    }
    return row;
  });
}

export function SkillDevelopment({
  orgId,
  people,
  levelNames,
}: {
  orgId: string;
  people: Person[];
  levelNames: string[];
}) {
  const label = useMemo(() => new Map(people.map((p) => [p.userId, p.label])), [people]);
  const history = useQuery({
    queryKey: skillHistoryKey(orgId),
    enabled: people.length > 0,
    queryFn: () =>
      fetchSkillHistory(
        orgId,
        people.map((p) => p.userId),
      ),
  });
  const [mode, setMode] = useState<"skill" | "person">("skill");
  const [skillPick, setSkillPick] = useState("");
  const [personPick, setPersonPick] = useState("");

  const events = useMemo(
    () => (history.data ?? []).filter((e) => label.has(e.userId)),
    [history.data, label],
  );
  const count = levelNames.length;
  const shown = (v: number | null) => displayLevel(v, count);

  // Skills by how much their levels have moved, then by how many have them.
  const skills = useMemo(() => {
    const by = new Map<string, { name: string; changes: number; people: Set<string> }>();
    for (const e of events) {
      const key = e.skill.toLowerCase();
      const s = by.get(key) ?? { name: e.skill, changes: 0, people: new Set<string>() };
      if (s.people.has(e.userId)) s.changes += 1;
      s.people.add(e.userId);
      by.set(key, s);
    }
    return [...by.values()].sort(
      (a, b) =>
        b.changes - a.changes || b.people.size - a.people.size || a.name.localeCompare(b.name),
    );
  }, [events]);
  const withHistory = people.filter((p) => events.some((e) => e.userId === p.userId));

  if (history.isLoading || !people.length) return null;

  const since = events.length ? day(events[0].at) : null;
  const now = Date.now();
  const skill = skills.find((s) => s.name === skillPick) ?? skills[0];
  const person = withHistory.find((p) => p.userId === personPick) ?? withHistory[0];

  let rows: Row[] = [];
  let series: { key: string; name: string; color: string }[] = [];
  // `from: "new"` is a skill added after history began, rather than a level change.
  let changes: { at: number; who: string; from: number | null | "new"; to: number | null }[] = [];
  let note: string | null = null;
  let showChart = false;

  if (mode === "skill" && skill) {
    const mine = events.filter((e) => e.skill.toLowerCase() === skill.name.toLowerCase());
    // Average of the levels people have at each moment.
    const current = new Map<string, number | null>();
    const points: { t: number; v: number | null }[] = [];
    for (const e of mine) {
      const prev = current.has(e.userId) ? current.get(e.userId)! : undefined;
      if (prev !== undefined && prev !== e.level) {
        changes.push({ at: e.at, who: label.get(e.userId) ?? "Someone", from: prev, to: e.level });
      } else if (prev === undefined && events[0] && e.at > events[0].at + 60_000) {
        // Not one of the starting points recorded when history began.
        changes.push({ at: e.at, who: label.get(e.userId) ?? "Someone", from: "new", to: e.level });
      }
      current.set(e.userId, e.level);
      const levels = [...current.values()].map(shown).filter((l): l is number => l !== null);
      const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
      const last = points[points.length - 1];
      if (last && last.t === e.at) last.v = avg;
      else points.push({ t: e.at, v: avg });
    }
    series = [{ key: "avg", name: `Average level in ${skill.name}`, color: SERIES[0] }];
    rows = toRows([{ key: "avg", points }], now);
    changes = changes.sort((a, b) => b.at - a.at).slice(0, 8);
    showChart = points.some((p) => p.v !== null);
    if (!showChart) note = `Nobody has a level in ${skill.name} yet.`;
  } else if (mode === "person" && person) {
    const mine = events.filter((e) => e.userId === person.userId);
    const names = [...new Set(mine.map((e) => e.skill))].filter((n) =>
      mine.some((e) => e.skill === n && e.level !== null),
    );
    const picked = names.slice(0, MAX_SERIES);
    series = picked.map((n, i) => ({ key: `s${i}`, name: n, color: SERIES[i] }));
    // Lines on the same level would hide each other, so each is nudged a little
    // (well under half a level; the tooltip rounds back to the true level).
    const nudge = (i: number) => (i - (picked.length - 1) / 2) * 0.06;
    rows = toRows(
      picked.map((n, i) => ({
        key: `s${i}`,
        points: stepsOf(mine.filter((e) => e.skill === n)).map((p) => {
          const v = shown(p.v);
          return { t: p.t, v: v === null ? null : v + nudge(i) };
        }),
      })),
      now,
    );
    showChart = picked.length > 0;
    if (!showChart) note = `${person.label} has no skill levels yet.`;
    else if (names.length > MAX_SERIES)
      note = `Showing ${MAX_SERIES} of ${person.label}'s ${names.length} levelled skills.`;
  }

  const selectCls =
    "h-9 min-w-0 rounded-xl border border-input bg-white/70 px-2 text-sm outline-none focus:border-teal-500 dark:bg-white/5";
  const levelText = (v: number) =>
    Number.isInteger(v) ? (skillLevelLabel(v, levelNames) ?? String(v)) : `${v.toFixed(1)}`;
  // Several lines are nudged apart; one line (the average) is shown as it is.
  const tooltipLevel = (v: number) => levelText(series.length > 1 ? Math.round(v) : v);
  // Name a line at its end when there are few and its end level is its own.
  const ends = series.map((x) => rows[rows.length - 1]?.[x.key]);
  const labelled = (key: string, i: number) =>
    series.length > 1 &&
    series.length <= 4 &&
    ends[i] !== null &&
    ends.filter((e) => e !== null && Math.round(e as number) === Math.round(ends[i] as number))
      .length === 1 &&
    !!key;
  const anyLabel = series.some((x, i) => labelled(x.key, i));

  return (
    <section
      className="space-y-3 rounded-2xl border-2 border-border bg-card p-4"
      aria-label="Skill development"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="font-semibold">Skill development</h2>
        {since && <span className="text-xs text-muted-foreground">since {since}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border p-0.5" role="tablist">
            {(["skill", "person"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-sm font-medium ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                By {m}
              </button>
            ))}
          </div>
          {mode === "skill" ? (
            <select
              className={selectCls}
              value={skill?.name ?? ""}
              onChange={(e) => setSkillPick(e.target.value)}
              aria-label="Skill"
            >
              {skills.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              className={selectCls}
              value={person?.userId ?? ""}
              onChange={(e) => setPersonPick(e.target.value)}
              aria-label="Person"
            >
              {withHistory.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!events.length ? (
        <p className="text-sm text-muted-foreground">
          Levels are recorded whenever they change. As people's levels develop, it shows here.
        </p>
      ) : (
        <>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
          {showChart && (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={rows}
                  margin={{
                    top: 8,
                    right: anyLabel ? 112 : 16,
                    bottom: 4,
                    left: 8,
                  }}
                >
                  <CartesianGrid stroke="#e7e6e2" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(t: number) => format(t, "d MMM")}
                    tick={{ fontSize: 12, fill: "#52514e" }}
                    stroke="#d6d4ce"
                  />
                  <YAxis
                    domain={[1, count]}
                    ticks={Array.from({ length: count }, (_, i) => i + 1)}
                    tickFormatter={(v: number) => skillLevelLabel(v, levelNames) ?? String(v)}
                    tick={{ fontSize: 12, fill: "#52514e" }}
                    width={88}
                    stroke="#d6d4ce"
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(t) => day(Number(t))}
                    formatter={(v, name) => [
                      typeof v === "number" ? tooltipLevel(v) : "no level",
                      name as string,
                    ]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {series.map((s, si) => (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      type="stepAfter"
                      stroke={s.color}
                      strokeWidth={2}
                      // A dot marks a change in this line; the end carried on to today isn't one.
                      dot={(p: {
                        cx?: number;
                        cy?: number;
                        index?: number;
                        payload?: Row;
                        value?: unknown;
                      }) =>
                        p.payload?.t === now ||
                        p.value === null ||
                        p.cy === undefined ||
                        (p.index !== undefined &&
                          p.index > 0 &&
                          rows[p.index - 1]?.[s.key] === rows[p.index]?.[s.key]) ? (
                          <g key={`${s.key}-${p.payload?.t}`} />
                        ) : (
                          <circle
                            key={`${s.key}-${p.payload?.t}`}
                            cx={p.cx}
                            cy={p.cy}
                            r={4}
                            stroke={s.color}
                            strokeWidth={2}
                            fill="#fcfcfb"
                          />
                        )
                      }
                      label={(p: { x?: number; y?: number; index?: number }) =>
                        labelled(s.key, si) && p.index === rows.length - 1 ? (
                          <text
                            key={`${s.key}-label`}
                            x={(p.x ?? 0) + 8}
                            y={(p.y ?? 0) + 4}
                            fontSize={12}
                            fill="#52514e"
                          >
                            {s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name}
                          </text>
                        ) : (
                          <g key={`${s.key}-nolabel-${p.index}`} />
                        )
                      }
                      activeDot={{ r: 5 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {mode === "skill" && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Latest changes</p>
              {changes.length ? (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {changes.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.who}</span>:{" "}
                      {c.from === "new"
                        ? c.to === null
                          ? "added the skill"
                          : `added at ${levelText(shown(c.to)!)}`
                        : `${c.from === null ? "no level" : levelText(shown(c.from)!)} → ${
                            c.to === null ? "no level" : levelText(shown(c.to)!)
                          }`}
                      <span className="text-muted-foreground"> · {day(c.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No changes yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
