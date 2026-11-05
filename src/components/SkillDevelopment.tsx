import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ChevronDown, TrendingUp } from "lucide-react";
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

type Change = {
  at: number;
  who: string;
  skill: string;
  /** "new": a skill added after history began, rather than a level change. */
  from: number | null | "new";
  to: number | null;
};

/** Every level change in these events, newest first (not the starting points). */
function changesIn(
  scope: SkillHistoryPoint[],
  label: Map<string, string>,
  historyStart: number | undefined,
): Change[] {
  const out: Change[] = [];
  const seen = new Map<string, number | null>();
  for (const e of scope) {
    const key = `${e.userId}|${e.skill.toLowerCase()}`;
    const prev = seen.has(key) ? seen.get(key)! : undefined;
    const who = label.get(e.userId) ?? "Someone";
    if (prev !== undefined && prev !== e.level) {
      out.push({ at: e.at, who, skill: e.skill, from: prev, to: e.level });
    } else if (prev === undefined && historyStart !== undefined && e.at > historyStart + 60_000) {
      // Not one of the starting points recorded when history began.
      out.push({ at: e.at, who, skill: e.skill, from: "new", to: e.level });
    }
    seen.set(key, e.level);
  }
  return out.sort((a, b) => b.at - a.at);
}

const LATEST = 8;

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
  // Picked skills (lowercased); empty means all skills.
  const [skillPicks, setSkillPicks] = useState<string[]>([]);
  const [personPick, setPersonPick] = useState("");
  const [teamPick, setTeamPick] = useState("");
  const [measure, setMeasure] = useState<Measure>("cumulative");
  const [showAllChanges, setShowAllChanges] = useState(false);
  const cumulative = measure === "cumulative";

  // Your last choices come back on your next visit (this browser, per organisation).
  // Until something is saved, the view is all skills, cumulative.
  const storageKey = `talentloom:skill-development:${orgId}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as {
        mode?: string;
        measure?: string;
        skills?: unknown;
        person?: unknown;
        team?: unknown;
      } | null;
      if (saved) {
        if (saved.mode === "skill" || saved.mode === "person" || saved.mode === "team") {
          setMode(saved.mode);
        }
        if (MEASURES.some((m) => m.id === saved.measure)) setMeasure(saved.measure as Measure);
        if (Array.isArray(saved.skills)) {
          setSkillPicks(saved.skills.filter((k): k is string => typeof k === "string"));
        }
        if (typeof saved.person === "string") setPersonPick(saved.person);
        if (typeof saved.team === "string") setTeamPick(saved.team);
      }
    } catch {
      /* nothing saved, or storage unavailable: keep the defaults */
    }
    setRestored(true);
  }, [storageKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ mode, measure, skills: skillPicks, person: personPick, team: teamPick }),
      );
    } catch {
      /* not remembered this time */
    }
  }, [restored, storageKey, mode, measure, skillPicks, personPick, teamPick]);

  const events = useMemo(
    () => (history.data ?? []).filter((e) => label.has(e.userId)),
    [history.data, label],
  );
  const count = levelNames.length;
  const shown = (v: number | null) => displayLevel(v, count);

  // Every skill with history, alphabetically.
  const skills = useMemo(() => {
    const by = new Map<string, string>();
    for (const e of events)
      if (!by.has(e.skill.toLowerCase())) by.set(e.skill.toLowerCase(), e.skill);
    return [...by.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [events]);
  const withHistory = people.filter((p) => events.some((e) => e.userId === p.userId));
  // Teams with someone whose skills have history.
  const teamList = (teams.data ?? []).filter((t) =>
    t.members.some((m) => withHistory.some((p) => p.userId === m)),
  );

  if (history.isLoading || !people.length) return null;

  const since = events.length ? day(events[0].at) : null;
  const now = Date.now();
  const picked = skills.filter((k) => skillPicks.includes(k.key));
  const person = withHistory.find((p) => p.userId === personPick) ?? withHistory[0];
  const team = teamList.find((t) => t.id === teamPick) ?? teamList[0];

  let rows: Row[] = [];
  // `short`: the name at the end of the line, when it differs from the legend.
  let series: { key: string; name: string; color: string; short?: string }[] = [];
  // `from: "new"` is a skill added after history began, rather than a level change.
  let changes: Change[] = [];
  let note: string | null = null;
  let showChart = false;

  if (mode === "skill" && skills.length) {
    const all = !picked.length;
    const inScope = all ? events : events.filter((e) => skillPicks.includes(e.skill.toLowerCase()));
    changes = changesIn(inScope, label, events[0]?.at);

    if (all) {
      // One line for every skill: each person's level in each skill counts once.
      const points = aggregateOver(
        events,
        (e) => `${e.userId}|${e.skill.toLowerCase()}`,
        shown,
        measure,
        people.length * skills.length,
      );
      series = [
        {
          key: "avg",
          name: cumulative
            ? "Level points in all skills"
            : measure === "everyone"
              ? `Average over all ${people.length} people and ${skills.length} skills`
              : "Average level in all skills",
          color: SERIES[0],
        },
      ];
      rows = nudged(toRows([{ key: "avg", points }], now), ["avg"]);
      showChart = points.some((p) => p.v !== null);
      if (!showChart) note = "Nobody has a skill level yet.";
    } else {
      // A line per chosen skill, alphabetically.
      const shownSkills = picked.slice(0, MAX_SERIES);
      series = shownSkills.map((k, i) => ({
        key: `s${i}`,
        name:
          measure === "everyone" && shownSkills.length === 1
            ? `Average in ${k.name} over all ${people.length} people`
            : k.name,
        short: k.name,
        color: SERIES[i],
      }));
      rows = nudged(
        toRows(
          shownSkills.map((k, i) => ({
            key: `s${i}`,
            points: aggregateOver(
              events.filter((e) => e.skill.toLowerCase() === k.key),
              (e) => e.userId,
              shown,
              measure,
              people.length,
            ),
          })),
          now,
        ),
        series.map((x) => x.key),
        cumulative ? 0.15 : 0.06,
      );
      showChart = rows.some((r) => series.some((x) => r[x.key] !== null));
      if (!showChart) note = "Nobody has a level in these skills yet.";
      else if (picked.length > MAX_SERIES)
        note = `Showing the first ${MAX_SERIES} of the ${picked.length} chosen skills.`;
    }
  } else if (mode === "person" && person && measure !== "average") {
    const mine = events.filter((e) => e.userId === person.userId);
    changes = changesIn(mine, label, events[0]?.at);
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
    changes = changesIn(mine, label, events[0]?.at);
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
    changes = changesIn(mine, label, events[0]?.at);
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
  // Ticks would all read the same day when history is this short.
  const shortSpan = rows.length > 0 && rows[rows.length - 1].t - rows[0].t < 2 * 86_400_000;

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
            <SkillMultiSelect skills={skills} picked={skillPicks} onChange={setSkillPicks} />
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
                    tickFormatter={(t: number) => format(t, shortSpan ? "d MMM HH:mm" : "d MMM")}
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
          {(mode === "skill" || mode === "person" || (mode === "team" && team)) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {showAllChanges ? `All changes (${changes.length})` : "Latest changes"}
              </p>
              {changes.length ? (
                <ul
                  className={`mt-1 space-y-0.5 text-sm ${
                    showAllChanges ? "max-h-96 overflow-y-auto pr-2" : ""
                  }`}
                >
                  {(showAllChanges ? changes : changes.slice(0, LATEST)).map((c, i) => (
                    <li key={i}>
                      {mode !== "person" && <span className="font-medium">{c.who}</span>}
                      {mode === "person" ? (
                        <span className="font-medium">{c.skill}</span>
                      ) : (
                        (mode === "team" || !picked.length || picked.length > 1) && (
                          <> · {c.skill}</>
                        )
                      )}
                      :{" "}
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
              {changes.length > LATEST && (
                <button
                  type="button"
                  onClick={() => setShowAllChanges(!showAllChanges)}
                  className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {showAllChanges ? "Show only the latest" : `Show all ${changes.length} changes`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Choose skills for the chart: "All skills" on top, then every skill
 * alphabetically, several at a time. Picking a skill leaves "All skills";
 * clearing every skill goes back to it.
 */
function SkillMultiSelect({
  skills,
  picked,
  onChange,
}: {
  skills: { key: string; name: string }[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const chosen = skills.filter((k) => picked.includes(k.key));
  const summary = !chosen.length
    ? "All skills"
    : chosen.length === 1
      ? chosen[0].name
      : `${chosen.length} skills`;
  const q = filter.trim().toLowerCase();
  const listed = q ? skills.filter((k) => k.name.toLowerCase().includes(q)) : skills;
  const toggle = (key: string) =>
    onChange(picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);

  const item = (on: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary ${
      on ? "font-medium" : ""
    }`;
  const tick = (on: boolean) =>
    `grid h-4 w-4 shrink-0 place-items-center rounded border ${
      on ? "border-primary bg-primary text-primary-foreground" : "border-input"
    }`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 max-w-56 items-center gap-1.5 rounded-xl border border-input bg-white/70 px-3 text-sm dark:bg-white/5"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border-2 border-border bg-card p-2 shadow-lg">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a skill"
            className="mb-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-teal-500"
            aria-label="Find a skill"
            autoFocus
          />
          <div role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto">
            {!q && (
              <button
                type="button"
                role="option"
                aria-selected={!chosen.length}
                onClick={() => onChange([])}
                className={item(!chosen.length) + " border-b border-border"}
              >
                <span className={tick(!chosen.length)}>
                  {!chosen.length && <Check className="h-3 w-3" />}
                </span>
                All skills
              </button>
            )}
            {listed.map((k) => {
              const on = picked.includes(k.key);
              return (
                <button
                  key={k.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(k.key)}
                  className={item(on)}
                >
                  <span className={tick(on)}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="truncate">{k.name}</span>
                </button>
              );
            })}
            {!listed.length && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No skill matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
