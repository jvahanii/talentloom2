import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyProfileId } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { fetchTeams, teamsKey, type Team } from "@/lib/teams";
import {
  fetchTopology,
  placeTeam,
  topologyKey,
  type Cell,
  type TeamPlacement,
} from "@/lib/topology";

/**
 * A map where teams place themselves: scope of skills mandate across, scope of
 * work mandate up, in four quadrants. Each team marks where it is now and,
 * optionally, where it's heading; an arrow joins the two. Based on the
 * Org Topologies™ model (orgtopologies.com); the drawing is our own.
 */

const SKILLS = ["Functional", "Multi-skill", "End-to-end", "Expanding"];
const WORK = ["Tasks", "Capabilities", "Partial solution", "Whole solution"];

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
const OTHER = "#8a8984";

// Map geometry (SVG units): a 4×4 grid of 100-unit cells.
const X0 = 132;
const Y0 = 44;
const CELL = 100;
const W = X0 + 4 * CELL + 64;
const H = Y0 + 4 * CELL + 64;
const cellX = (skills: number) => X0 + (skills - 1) * CELL;
const cellY = (work: number) => Y0 + (4 - work) * CELL;

const QUADRANTS = [
  { label: "Doing", skills: 1, work: 1, fill: "#f1eefb", ink: "#6250d6" },
  { label: "Delivering", skills: 3, work: 1, fill: "#fcedf3", ink: "#b5386b" },
  { label: "Directing", skills: 1, work: 3, fill: "#e9f3fc", ink: "#1c5cab" },
  { label: "Driving", skills: 3, work: 3, fill: "#e6f6ee", ink: "#0b6b4f" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const where = (c: Cell | null) =>
  c ? `${WORK[c.work - 1]} · ${SKILLS[c.skills - 1]}` : "not placed";

export function OrgTopology({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { can } = useOrg();
  const me = useQuery({ queryKey: ["topology-me"], queryFn: () => getMyProfileId() });
  const teams = useQuery({ queryKey: teamsKey(orgId), queryFn: () => fetchTeams(orgId) });
  const placements = useQuery({
    queryKey: topologyKey(orgId),
    queryFn: () => fetchTopology(orgId),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<"now" | "target">("now");
  const [busy, setBusy] = useState(false);

  const list = [...(teams.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const colorOf = (id: string) => {
    const i = list.findIndex((t) => t.id === id);
    return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER;
  };
  const placeOf = (id: string): TeamPlacement =>
    placements.data?.find((p) => p.teamId === id) ?? { teamId: id, now: null, target: null };
  const canPlace = (t: Team) => can("change_titles") || (!!me.data && t.members.includes(me.data));
  const chosen = list.find((t) => t.id === selected) ?? null;

  const save = async (team: Team, now: Cell | null, target: Cell | null) => {
    setBusy(true);
    const key = topologyKey(orgId);
    const before = qc.getQueryData<TeamPlacement[]>(key);
    qc.setQueryData<TeamPlacement[]>(key, (old) => [
      ...(old ?? []).filter((p) => p.teamId !== team.id),
      { teamId: team.id, now, target },
    ]);
    try {
      await placeTeam(orgId, team.id, now, target, me.data ?? null);
    } catch (e) {
      qc.setQueryData(key, before);
      toast.error(e instanceof Error ? e.message : "Could not place the team");
    } finally {
      setBusy(false);
    }
  };

  const clickCell = (cell: Cell) => {
    if (!chosen || busy) return;
    if (!canPlace(chosen)) {
      toast.error("Only the team's members, or someone who may change titles, can place this team");
      return;
    }
    const p = placeOf(chosen.id);
    if (placing === "now") void save(chosen, cell, p.target);
    else void save(chosen, p.now, cell);
  };

  // Markers, several to a cell: three across, filling down.
  type Marker = { team: Team; kind: "now" | "target"; x: number; y: number };
  const markers: Marker[] = [];
  const perCell = new Map<string, number>();
  for (const t of list) {
    const p = placeOf(t.id);
    for (const kind of ["now", "target"] as const) {
      const c = kind === "now" ? p.now : p.target;
      if (!c) continue;
      const key = `${c.skills}-${c.work}`;
      const i = perCell.get(key) ?? 0;
      perCell.set(key, i + 1);
      markers.push({
        team: t,
        kind,
        x: cellX(c.skills) + 22 + (i % 3) * 28,
        y: cellY(c.work) + 26 + Math.floor(i / 3) * 26,
      });
    }
  }
  const arrows = list.flatMap((t) => {
    const a = markers.find((m) => m.team.id === t.id && m.kind === "now");
    const b = markers.find((m) => m.team.id === t.id && m.kind === "target");
    return a && b ? [{ team: t, a, b }] : [];
  });

  if (teams.isLoading || placements.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <section
      className="space-y-3 rounded-2xl border-2 border-border bg-card p-4"
      aria-label="Org topology"
    >
      <div>
        <h2 className="font-semibold">Org topology</h2>
        <p className="text-sm text-muted-foreground">
          Teams place themselves by the scope of their skills mandate and of their work mandate:
          where they are now, and where they're heading. Pick a team, then click a square.
        </p>
      </div>

      {!list.length ? (
        <p className="text-sm text-muted-foreground">
          There are no teams yet. Teams are set up on the Teams page.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-2xl select-none"
            role="img"
            aria-label="Org topology map with the teams' places"
          >
            {/* Quadrants */}
            {QUADRANTS.map((q) => (
              <g key={q.label}>
                <rect
                  x={cellX(q.skills) + 3}
                  y={cellY(q.work + 1) + 3}
                  width={2 * CELL - 6}
                  height={2 * CELL - 6}
                  rx={10}
                  fill={q.fill}
                />
                <text
                  x={cellX(q.skills) + 14}
                  y={cellY(q.work) + CELL - 12}
                  textAnchor="start"
                  fontSize={11}
                  fontWeight={700}
                  letterSpacing={1.5}
                  fill={q.ink}
                  opacity={0.55}
                >
                  {q.label.toUpperCase()}
                </text>
              </g>
            ))}
            {/* Grid lines */}
            {[1, 2, 3].map((i) => (
              <g key={i} stroke="#ffffff" strokeWidth={2}>
                <line x1={X0 + i * CELL} y1={Y0} x2={X0 + i * CELL} y2={Y0 + 4 * CELL} />
                <line x1={X0} y1={Y0 + i * CELL} x2={X0 + 4 * CELL} y2={Y0 + i * CELL} />
              </g>
            ))}
            {/* Clickable squares */}
            {[1, 2, 3, 4].flatMap((s) =>
              [1, 2, 3, 4].map((w) => (
                <rect
                  key={`${s}-${w}`}
                  x={cellX(s) + 3}
                  y={cellY(w) + 3}
                  width={CELL - 6}
                  height={CELL - 6}
                  rx={8}
                  fill="transparent"
                  className={chosen ? "cursor-pointer hover:fill-[#0b0b0b0d]" : ""}
                  onClick={() => clickCell({ skills: s, work: w })}
                >
                  <title>{`${WORK[w - 1]} · ${SKILLS[s - 1]}`}</title>
                </rect>
              )),
            )}
            {/* Axis labels */}
            {WORK.map((label, i) => (
              <text
                key={label}
                x={X0 - 8}
                y={cellY(i + 1) + CELL / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="#52514e"
              >
                {label}
              </text>
            ))}
            {SKILLS.map((label, i) => (
              <text
                key={label}
                x={cellX(i + 1) + CELL / 2}
                y={Y0 + 4 * CELL + 18}
                textAnchor="middle"
                fontSize={11}
                fill="#52514e"
              >
                {label}
              </text>
            ))}
            <text
              x={X0 + 2 * CELL}
              y={Y0 + 4 * CELL + 40}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#0b0b0b"
            >
              Scope of skills mandate →
            </text>
            <text
              x={14}
              y={Y0 + 2 * CELL}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#0b0b0b"
              transform={`rotate(-90 14 ${Y0 + 2 * CELL})`}
            >
              Scope of work mandate →
            </text>
            <text x={cellX(1) + CELL} y={Y0 - 14} textAnchor="middle" fontSize={11} fill="#52514e">
              Incomplete
            </text>
            <text x={cellX(3) + CELL} y={Y0 - 14} textAnchor="middle" fontSize={11} fill="#52514e">
              Complete
            </text>
            <text
              x={X0 + 4 * CELL + 18}
              y={cellY(3) + CELL}
              textAnchor="middle"
              fontSize={11}
              fill="#52514e"
              transform={`rotate(90 ${X0 + 4 * CELL + 18} ${cellY(3) + CELL})`}
            >
              Outcomes
            </text>
            <text
              x={X0 + 4 * CELL + 18}
              y={cellY(1) + CELL}
              textAnchor="middle"
              fontSize={11}
              fill="#52514e"
              transform={`rotate(90 ${X0 + 4 * CELL + 18} ${cellY(1) + CELL})`}
            >
              Outputs
            </text>
            {/* Arrows: now → heading */}
            {arrows.map(({ team, a, b }) => {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const ex = b.x - ux * 13;
              const ey = b.y - uy * 13;
              const color = colorOf(team.id);
              return (
                <g key={team.id} pointerEvents="none">
                  <line
                    x1={a.x + ux * 12}
                    y1={a.y + uy * 12}
                    x2={ex - ux * 6}
                    y2={ey - uy * 6}
                    stroke={color}
                    strokeWidth={2}
                  />
                  <polygon
                    points={`${ex},${ey} ${ex - ux * 8 - uy * 5},${ey - uy * 8 + ux * 5} ${ex - ux * 8 + uy * 5},${ey - uy * 8 - ux * 5}`}
                    fill={color}
                  />
                </g>
              );
            })}
            {/* Team markers: filled now, dashed outline where heading */}
            {markers.map((m) => {
              const color = colorOf(m.team.id);
              const isChosen = m.team.id === selected;
              return (
                <g
                  key={`${m.team.id}-${m.kind}`}
                  className="cursor-pointer"
                  onClick={() => setSelected(m.team.id)}
                >
                  <title>{`${m.team.name}: ${m.kind === "now" ? "now" : "heading"}`}</title>
                  {isChosen && (
                    <circle
                      cx={m.x}
                      cy={m.y}
                      r={15}
                      fill="none"
                      stroke="#0b0b0b"
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    cx={m.x}
                    cy={m.y}
                    r={11}
                    fill={m.kind === "now" ? color : "#ffffff"}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={m.kind === "target" ? "3 2" : undefined}
                  />
                  <text
                    x={m.x}
                    y={m.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={700}
                    fill={m.kind === "now" ? "#ffffff" : "#0b0b0b"}
                    pointerEvents="none"
                  >
                    {initials(m.team.name)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="space-y-3">
            <div
              className="inline-flex rounded-xl border border-border p-0.5"
              role="radiogroup"
              aria-label="Place"
            >
              {(["now", "target"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={placing === k}
                  onClick={() => setPlacing(k)}
                  className={`rounded-lg px-3 py-1 text-sm font-medium ${
                    placing === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k === "now" ? "Where we are" : "Where we're heading"}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5">
              {list.map((t) => {
                const p = placeOf(t.id);
                const on = t.id === selected;
                const editable = canPlace(t);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(on ? null : t.id)}
                      className={`w-full rounded-xl border-2 p-2 text-left text-sm ${
                        on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: colorOf(t.id) }}
                        >
                          {initials(t.name)}
                        </span>
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Now: {where(p.now)}
                        <br />
                        Heading: {where(p.target)}
                      </span>
                    </button>
                    {on && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-xs">
                        {editable ? (
                          <>
                            <span className="text-muted-foreground">
                              Click a square to set{" "}
                              {placing === "now" ? "where you are" : "where you're heading"}.
                            </span>
                            {(p.now || p.target) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => save(t, null, null)}
                                className="font-medium text-destructive underline-offset-4 hover:underline"
                              >
                                Take off the map
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Only the team's members, or someone who may change titles, can place
                            this team.
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Based on the Org Topologies™ model —{" "}
        <a
          href="https://www.orgtopologies.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          orgtopologies.com
        </a>
        .
      </p>
    </section>
  );
}
