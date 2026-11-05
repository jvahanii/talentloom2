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
import { fetchTeams, teamsKey } from "@/lib/teams";
import { displayLevel, skillLevelLabel } from "@/lib/skills";

/**
 * How skill levels develop over time, from org_member_skill_history, by skill,
 * person or team. Cumulative (the default) adds levels up into level points
 * (Novice 1, Basic 2 …), so growth shows even when beginners join; average
 * shows the typical level. Levels are recorded whenever they change, from
 * 5 Nov 2026 on.
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

/**
 * cumulative: level points added up. average: the mean of the levels that are
 * set. everyone: the points divided by everyone in scope, so people without
 * the skill or a level count as 0.
 */
type Measure = "cumulative" | "average" | "everyone";

const MEASURES: { id: Measure; label: string; hint: string }[] = [
  {
    id: "cumulative",
    label: "Cumulative",
    hint: "Levels added up into level points (Novice 1, Basic 2 …)",
  },
  { id: "average", label: "Average", hint: "The average level of those who have one" },
  {
    id: "everyone",
    label: "Average (everyone)",
    hint: "The average over everyone, counting people without the skill or a level as 0",
  },
];

/**
 * The total (level points) or average of the current levels at each moment,
 * from history; `keyOf` says what a level belongs to (a person, or a skill).
 * For "everyone", `everyone` is how many to divide by (default: everything
 * recorded so far, levels or not). `shown` caps a level at the
 * organisation's number of levels.
 */
function aggregateOver(
  events: SkillHistoryPoint[],
  keyOf: (e: SkillHistoryPoint) => string,
  shown: (v: number | null) => number | null,
  measure: Measure,
  everyone?: number,
): { t: number; v: number | null }[] {
  const current = new Map<string, number | null>();
  const points: { t: number; v: number | null }[] = [];
  for (const e of events) {
    current.set(keyOf(e), e.level);
    const levels = [...current.values()].map(shown).filter((l): l is number => l !== null);
    const total = levels.reduce((a, b) => a + b, 0);
    const of = everyone ?? current.size;
    const avg =
      measure === "everyone"
        ? of > 0
          ? total / of
          : null
        : !levels.length
          ? null
          : measure === "cumulative"
            ? total
            : total / levels.length;
    const last = points[points.length - 1];
    if (last && last.t === e.at) last.v = avg;
    else points.push({ t: e.at, v: avg });
  }
  return points;
}

/**
 * Lines on the same level would hide each other, so each is drawn nudged a
 * little (well under half a level); the true value stays in `<key>__raw` for
 * the tooltip and the line-end labels.
 */
function nudged(rows: Row[], keys: string[], step = 0.06): Row[] {
  const offset = (i: number) => (i - (keys.length - 1) / 2) * step;
  return rows.map((r) => {
    const out: Row = { ...r };
    keys.forEach((k, i) => {
      const v = r[k];
      out[`${k}__raw`] = v;
      out[k] = v === null || keys.length < 2 ? v : v + offset(i);
    });
    return out;
  });
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
  const teams = useQuery({
    queryKey: teamsKey(orgId),
    queryFn: () => fetchTeams(orgId),
  });
  const [mode, setMode] = useState<"skill" | "person" | "team">("skill");
  const [skillPick, setSkillPick] = useState("");
  const [personPick, setPersonPick] = useState("");
  const [teamPick, setTeamPick] = useState("");
  const [measure, setMeasure] = useState<Measure>("cumulative");
  const cumulative = measure === "cumulative";

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
  // Teams with someone whose skills have history.
  const teamList = (teams.data ?? []).filter((t) =>
    t.members.some((m) => withHistory.some((p) => p.userId === m)),
  );

  if (history.isLoading || !people.length) return null;

  const since = events.length ? day(events[0].at) : null;
  const now = Date.now();
  const skill = skills.find((s) => s.name === skillPick) ?? skills[0];
  const person = withHistory.find((p) => p.userId === personPick) ?? withHistory[0];
  const team = teamList.find((t) => t.id === teamPick) ?? teamList[0];

  let rows: Row[] = [];
  // `short`: the name at the end of the line, when it differs from the legend.
  let series: { key: string; name: string; color: string; short?: string }[] = [];
  // `from: "new"` is a skill added after history began, rather than a level change.
  let changes: { at: number; who: string; from: number | null | "new"; to: number | null }[] = [];
  let note: string | null = null;
  let showChart = false;

  if (mode === "skill" && skill) {
    const mine = events.filter((e) => e.skill.toLowerCase() === skill.name.toLowerCase());
    const seen = new Map<string, number | null>();
    for (const e of mine) {
      const prev = seen.has(e.userId) ? seen.get(e.userId)! : undefined;
      if (prev !== undefined && prev !== e.level) {
        changes.push({ at: e.at, who: label.get(e.userId) ?? "Someone", from: prev, to: e.level });
      } else if (prev === undefined && events[0] && e.at > events[0].at + 60_000) {
        // Not one of the starting points recorded when history began.
        changes.push({ at: e.at, who: label.get(e.userId) ?? "Someone", from: "new", to: e.level });
      }
      seen.set(e.userId, e.level);
    }
    const points = aggregateOver(mine, (e) => e.userId, shown, measure, people.length);
    series = [
      {
        key: "avg",
        name: cumulative
          ? `Level points in ${skill.name}`
          : measure === "everyone"
            ? `Average in ${skill.name} over all ${people.length} people`
            : `Average level in ${skill.name}`,
        color: SERIES[0],
      },
    ];
    rows = nudged(toRows([{ key: "avg", points }], now), ["avg"]);
    changes = changes.sort((a, b) => b.at - a.at).slice(0, 8);
    showChart = points.some((p) => p.v !== null);
    if (!showChart) note = `Nobody has a level in ${skill.name} yet.`;
  } else if (mode === "person" && person && measure !== "average") {
    const mine = events.filter((e) => e.userId === person.userId);
    const points = aggregateOver(mine, (e) => e.skill.toLowerCase(), shown, measure);
    series = [
      {
        key: "avg",
        name: cumulative
          ? `${person.label}: level points in all skills`
          : `${person.label}: average over all skills, no level as 0`,
        color: SERIES[0],
      },
    ];
    rows = nudged(toRows([{ key: "avg", points }], now), ["avg"]);
    showChart = points.some((p) => p.v !== null);
    if (!showChart) note = `${person.label} has no skill levels yet.`;
  } else if (mode === "person" && person) {
    const mine = events.filter((e) => e.userId === person.userId);
    const names = [...new Set(mine.map((e) => e.skill))].filter((n) =>
      mine.some((e) => e.skill === n && e.level !== null),
    );
    const picked = names.slice(0, MAX_SERIES);
    series = picked.map((n, i) => ({ key: `s${i}`, name: n, color: SERIES[i] }));
    rows = nudged(
      toRows(
        picked.map((n, i) => ({
          key: `s${i}`,
          points: stepsOf(mine.filter((e) => e.skill === n)).map((p) => ({
            t: p.t,
            v: shown(p.v),
          })),
        })),
        now,
      ),
      series.map((s) => s.key),
    );
    showChart = picked.length > 0;
    if (!showChart) note = `${person.label} has no skill levels yet.`;
    else if (names.length > MAX_SERIES)
      note = `Showing ${MAX_SERIES} of ${person.label}'s ${names.length} levelled skills.`;
  } else if (mode === "team" && team) {
    // The team's skills, most widely held first; a line per skill of the
    // members' level points or average level.
    const members = new Set(team.members);
    const mine = events.filter((e) => members.has(e.userId));
    const holders = new Map<string, { name: string; people: Set<string>; levelled: boolean }>();
    for (const e of mine) {
      const key = e.skill.toLowerCase();
      const h = holders.get(key) ?? { name: e.skill, people: new Set<string>(), levelled: false };
      h.people.add(e.userId);
      if (e.level !== null) h.levelled = true;
      holders.set(key, h);
    }
    const ranked = [...holders.values()]
      .filter((h) => h.levelled)
      .sort((a, b) => b.people.size - a.people.size || a.name.localeCompare(b.name));
    const picked = ranked.slice(0, MAX_SERIES);
    series = picked.map((h, i) => ({
      key: `s${i}`,
      name: `${h.name} (${h.people.size})`,
      short: h.name,
      color: SERIES[i],
    }));
    rows = nudged(
      toRows(
        picked.map((h, i) => ({
          key: `s${i}`,
          points: aggregateOver(
            mine.filter((e) => e.skill.toLowerCase() === h.name.toLowerCase()),
            (e) => e.userId,
            shown,
            measure,
            team.members.filter((m) => label.has(m)).length,
          ),
        })),
        now,
      ),
      series.map((s) => s.key),
      cumulative ? 0.15 : 0.06,
    );
    showChart = picked.length > 0;
    if (!showChart) note = `Nobody in ${team.name} has a skill level yet.`;
    else if (ranked.length > MAX_SERIES)
      note = `Showing the ${MAX_SERIES} most common of the team's ${ranked.length} levelled skills.`;
  } else if (mode === "team") {
    note = "There are no teams with skills yet. Teams are set up on the Teams page.";
  }

  const selectCls =
    "h-9 min-w-0 rounded-xl border border-input bg-white/70 px-2 text-sm outline-none focus:border-teal-500 dark:bg-white/5";
  // One person's level by name: the changes list is about people, not totals.
  const levelName = (v: number) => skillLevelLabel(v, levelNames) ?? String(v);
  const levelText = (v: number) =>
    cumulative
      ? `${v} level point${v === 1 ? "" : "s"}`
      : v === 0
        ? "No level"
        : Number.isInteger(v)
          ? (skillLevelLabel(v, levelNames) ?? String(v))
          : `${v.toFixed(1)}`;
  // Name a line at its end when there are few and no other line ends near it.
  const ends = series.map((x) => rows[rows.length - 1]?.[`${x.key}__raw`] ?? null);
  const labelled = (key: string, i: number) =>
    series.length > 1 &&
    series.length <= 4 &&
    ends[i] !== null &&
    ends.filter(
      (e) => e !== null && Math.abs((e as number) - (ends[i] as number)) < (cumulative ? 1.5 : 0.5),
    ).length === 1 &&
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
          <div
            className="inline-flex rounded-xl border border-border p-0.5"
            role="radiogroup"
            aria-label="Measure"
          >
            {MEASURES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={measure === m.id}
                onClick={() => setMeasure(m.id)}
                title={m.hint}
                className={`rounded-lg px-3 py-1 text-sm font-medium ${
                  measure === m.id ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-border p-0.5" role="tablist">
            {(["skill", "person", "team"] as const).map((m) => (
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
          ) : mode === "person" ? (
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
          ) : (
            teamList.length > 0 && (
              <select
                className={selectCls}
                value={team?.id ?? ""}
                onChange={(e) => setTeamPick(e.target.value)}
                aria-label="Team"
              >
                {teamList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )
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
                  {cumulative ? (
                    <YAxis
                      domain={[0, "auto"]}
                      tick={{ fontSize: 12, fill: "#52514e" }}
                      width={48}
                      stroke="#d6d4ce"
                      allowDecimals={false}
                      label={{
                        value: "level points",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "#52514e", textAnchor: "middle" },
                      }}
                    />
                  ) : (
                    <YAxis
                      domain={[measure === "everyone" ? 0 : 1, count]}
                      ticks={Array.from(
                        { length: measure === "everyone" ? count + 1 : count },
                        (_, i) => (measure === "everyone" ? i : i + 1),
                      )}
                      tickFormatter={(v: number) =>
                        v === 0 ? "No level" : (skillLevelLabel(v, levelNames) ?? String(v))
                      }
                      tick={{ fontSize: 12, fill: "#52514e" }}
                      width={88}
                      stroke="#d6d4ce"
                      allowDecimals={false}
                    />
                  )}
                  <Tooltip
                    labelFormatter={(t) => day(Number(t))}
                    formatter={(v, name, item) => {
                      // The true value, not the nudged position of the line.
                      const raw = (item?.payload as Row | undefined)?.[
                        `${String(item?.dataKey)}__raw`
                      ];
                      const value = raw === undefined ? v : raw;
                      return [
                        typeof value === "number" ? levelText(value) : "no level",
                        name as string,
                      ];
                    }}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    itemStyle={{ color: "#0b0b0b" }}
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
                            {(s.short ?? s.name).length > 14
                              ? `${(s.short ?? s.name).slice(0, 13)}…`
                              : (s.short ?? s.name)}
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
                          : `added at ${levelName(shown(c.to)!)}`
                        : `${c.from === null ? "no level" : levelName(shown(c.from)!)} → ${
                            c.to === null ? "no level" : levelName(shown(c.to)!)
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
