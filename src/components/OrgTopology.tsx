import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyProfileId } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { fetchTeams, teamsKey, type Team } from "@/lib/teams";
import {
  cellOf,
  fetchTopology,
  placeTeam,
  topologyKey,
  type Spot,
  type TeamPlacement,
} from "@/lib/topology";

/**
 * A map where teams place themselves: scope of skills mandate across, scope of
 * work mandate up, in four quadrants. Each team marks where it is now and,
 * optionally, where it's heading, anywhere within a square; an arrow joins the
 * two. Place by clicking the map, dragging a team from the list onto it, or
 * dragging a dot. Based on the Org Topologies™ model (orgtopologies.com); the
 * drawing is our own.
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
/** A spot (0–4 across, 0–4 up) in SVG units, and back. */
const toSvg = (s: Spot) => ({ x: X0 + s.x * CELL, y: Y0 + (4 - s.y) * CELL });
// Keep a dot fully inside the map.
const EDGE = 0.12;
const clamp = (v: number) => Math.min(4 - EDGE, Math.max(EDGE, v));

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

const where = (s: Spot | null) => {
  if (!s) return "not placed";
  const c = cellOf(s);
  return `${WORK[c.work - 1]} · ${SKILLS[c.skills - 1]}`;
};

const NOT_ALLOWED =
  "Only the team's members, or someone who may change titles, can place this team";

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
  // A dot being dragged on the map, and where it is meanwhile.
  const [drag, setDrag] = useState<{
    teamId: string;
    kind: "now" | "target";
    spot: Spot;
    moved: boolean;
  } | null>(null);
  // A team being dragged from the list (pointer-based, so touch works too).
  const [listDrag, setListDrag] = useState<{
    teamId: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const justDragged = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const list = [...(teams.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const colorOf = (id: string) => {
    const i = list.findIndex((t) => t.id === id);
    return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER;
  };
  const placeOf = (id: string): TeamPlacement =>
    placements.data?.find((p) => p.teamId === id) ?? { teamId: id, now: null, target: null };
  const canPlace = (t: Team) => can("change_titles") || (!!me.data && t.members.includes(me.data));
  const chosen = list.find((t) => t.id === selected) ?? null;

  /** The spot under a pointer, or null when it's outside the map. */
  const spotAt = (clientX: number, clientY: number, clampToMap = false): Spot | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const x = (p.x - X0) / CELL;
    const y = 4 - (p.y - Y0) / CELL;
    if (!clampToMap && (x < 0 || x > 4 || y < 0 || y > 4)) return null;
    return { x: clamp(x), y: clamp(y) };
  };

  const save = async (team: Team, now: Spot | null, target: Spot | null) => {
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

  /** Puts a team's dot (now or heading) at a spot, if the viewer may. */
  const placeAt = (team: Team, kind: "now" | "target", spot: Spot) => {
    if (!canPlace(team)) {
      toast.error(NOT_ALLOWED);
      return;
    }
    const p = placeOf(team.id);
    void save(team, kind === "now" ? spot : p.now, kind === "target" ? spot : p.target);
  };

  // Markers at their spots; a dragged one follows the pointer.
  type Marker = { team: Team; kind: "now" | "target"; x: number; y: number };
  const markers: Marker[] = [];
  for (const t of list) {
    const p = placeOf(t.id);
    for (const kind of ["now", "target"] as const) {
      const live = drag && drag.teamId === t.id && drag.kind === kind ? drag.spot : null;
      const spot = live ?? (kind === "now" ? p.now : p.target);
      if (!spot) continue;
      markers.push({ team: t, kind, ...toSvg(spot) });
    }
  }
  const arrows = list.flatMap((t) => {
    const a = markers.find((m) => m.team.id === t.id && m.kind === "now");
    const b = markers.find((m) => m.team.id === t.id && m.kind === "target");
    return a && b ? [{ team: t, a, b }] : [];
  });

  const startDrag = (e: ReactPointerEvent, m: Marker) => {
    e.stopPropagation();
    setSelected(m.team.id);
    if (!canPlace(m.team) || busy) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = placeOf(m.team.id);
    const spot = (m.kind === "now" ? p.now : p.target) ?? { x: 2, y: 2 };
    setDrag({ teamId: m.team.id, kind: m.kind, spot, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const spot = spotAt(e.clientX, e.clientY, true);
    if (spot) setDrag({ ...drag, spot, moved: true });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    svgRef.current?.releasePointerCapture(e.pointerId);
    const team = list.find((t) => t.id === drag.teamId);
    if (team && drag.moved) placeAt(team, drag.kind, drag.spot);
    setDrag(null);
  };

  if (teams.isLoading || placements.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <section
      className="space-y-3 rounded-2xl border-2 border-border bg-card p-4"
      aria-label="Org topology map"
    >
      <div>
        <h2 className="font-semibold">Org topology map</h2>
        <p className="text-sm text-muted-foreground">
          Teams place themselves by the scope of their skills mandate and of their work mandate:
          where they are now, and where they're heading. Drag a team from the list onto the map, or
          pick it and click a spot; drag a dot to move it.
        </p>
      </div>

      {!list.length ? (
        <p className="text-sm text-muted-foreground">
          There are no teams yet. Teams are set up on the Teams page.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`w-full max-w-2xl touch-none select-none rounded-xl ${
              listDrag?.active && spotAt(listDrag.x, listDrag.y)
                ? "outline-dashed outline-2 outline-primary"
                : ""
            }`}
            role="img"
            aria-label="Org topology map with the teams' places"
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => setDrag(null)}
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
            {/* The map itself takes clicks: the chosen team goes to that spot. */}
            <rect
              x={X0}
              y={Y0}
              width={4 * CELL}
              height={4 * CELL}
              fill="transparent"
              className={chosen ? "cursor-crosshair" : ""}
              onClick={(e) => {
                if (!chosen || busy) return;
                const spot = spotAt(e.clientX, e.clientY);
                if (spot) placeAt(chosen, placing, spot);
              }}
            />
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
              if (len < 26) return null;
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
              const movable = canPlace(m.team);
              return (
                <g
                  key={`${m.team.id}-${m.kind}`}
                  className={movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                  onPointerDown={(e) => startDrag(e, m)}
                >
                  <title>{`${m.team.name}: ${m.kind === "now" ? "now" : "heading"}${
                    movable ? " — drag to move" : ""
                  }`}</title>
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
                  <li
                    key={t.id}
                    className={editable ? "cursor-grab active:cursor-grabbing" : ""}
                    onPointerDown={(e) => {
                      if (!editable || e.button !== 0) return;
                      // On touch, only the badge drags, so the list still scrolls.
                      if (
                        e.pointerType !== "mouse" &&
                        !(e.target as Element).closest("[data-drag-handle]")
                      )
                        return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setListDrag({
                        teamId: t.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        x: e.clientX,
                        y: e.clientY,
                        active: false,
                      });
                    }}
                    onPointerMove={(e) => {
                      if (!listDrag || listDrag.teamId !== t.id) return;
                      const far =
                        Math.hypot(e.clientX - listDrag.startX, e.clientY - listDrag.startY) > 6;
                      setListDrag({
                        ...listDrag,
                        x: e.clientX,
                        y: e.clientY,
                        active: listDrag.active || far,
                      });
                    }}
                    onPointerUp={(e) => {
                      if (!listDrag || listDrag.teamId !== t.id) return;
                      if (listDrag.active) {
                        justDragged.current = true;
                        const spot = spotAt(e.clientX, e.clientY);
                        if (spot) {
                          setSelected(t.id);
                          placeAt(t, placing, spot);
                        }
                      }
                      setListDrag(null);
                    }}
                    onPointerCancel={() => setListDrag(null)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // The click that ends a drag isn't a pick.
                        if (justDragged.current) {
                          justDragged.current = false;
                          return;
                        }
                        setSelected(on ? null : t.id);
                      }}
                      className={`w-full rounded-xl border-2 p-2 text-left text-sm ${
                        on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                      title={editable ? "Drag onto the map, or click to pick" : undefined}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          data-drag-handle
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${editable ? "touch-none" : ""}`}
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
                              Click the map to set{" "}
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
                          <span className="text-muted-foreground">{NOT_ALLOWED}.</span>
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

      {listDrag?.active &&
        (() => {
          const t = list.find((x) => x.id === listDrag.teamId);
          if (!t) return null;
          return (
            <div
              className="pointer-events-none fixed z-50 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[10px] font-bold shadow-lg"
              style={{
                left: listDrag.x,
                top: listDrag.y,
                background: placing === "now" ? colorOf(t.id) : "#ffffff",
                color: placing === "now" ? "#ffffff" : "#0b0b0b",
                border: `2px ${placing === "now" ? "solid" : "dashed"} ${colorOf(t.id)}`,
              }}
            >
              {initials(t.name)}
            </div>
          );
        })()}

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
