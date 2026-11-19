import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * The cat and the pig, once above the landing page title, now drop by now and
 * then: on some page views, a few seconds in, one of them (or both) peeks up
 * from the bottom edge, stays a moment and ducks away again. Clicking sends
 * them off early. Purely decorative; hidden from screen readers.
 */

/** The share of page views they visit. */
const CHANCE = 0.15;
/** At least this long between visits, per browser tab. */
const COOLDOWN_MS = 3 * 60_000;
/** How long they stay in view. */
const STAY_MS = 4500;
const LAST_VISIT_KEY = "talentloom:friends:last-visit";
const VISITORS = [["🐱"], ["🐷"], ["🐱", "🐷"]];

type Visit = { id: number; who: string[]; left: number; shown: boolean };

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

/** For trying it out: localStorage "talentloom:friends:always" = "1" brings them every page. */
function alwaysVisit() {
  try {
    return window.localStorage.getItem("talentloom:friends:always") === "1";
  } catch {
    return false;
  }
}

function recentlyVisited() {
  try {
    return Date.now() - Number(window.sessionStorage.getItem(LAST_VISIT_KEY) ?? 0) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberVisit() {
  try {
    window.sessionStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  } catch {
    /* they may visit again sooner */
  }
}

export function PeekingFriends() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visit, setVisit] = useState<Visit | null>(null);

  useEffect(() => {
    if (!alwaysVisit() && (Math.random() >= CHANCE || recentlyVisited())) return;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const id = Date.now();
    const update = (fn: (v: Visit) => Visit | null) =>
      setVisit((v) => (v && v.id === id ? fn(v) : v));
    later(2000 + Math.random() * 6000, () => {
      rememberVisit();
      // Somewhere along the bottom edge, clear of the corners.
      setVisit({ id, who: pick(VISITORS), left: 12 + Math.random() * 76, shown: false });
      // Placed below the edge first, then slid up, so the move animates.
      later(50, () => update((v) => ({ ...v, shown: true })));
      later(50 + STAY_MS, () => update((v) => ({ ...v, shown: false })));
      later(50 + STAY_MS + 800, () => update(() => null));
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      setVisit(null);
    };
  }, [pathname]);

  if (!visit) return null;
  return (
    <div
      aria-hidden
      onClick={() => setVisit((v) => (v ? { ...v, shown: false } : v))}
      className="pointer-events-auto fixed bottom-0 z-40 flex cursor-pointer select-none gap-1 text-5xl drop-shadow-md transition-[transform,opacity] duration-700 ease-out motion-reduce:transition-opacity sm:text-6xl"
      style={{
        left: `${visit.left}%`,
        transform: `translateX(-50%) translateY(${visit.shown ? "18%" : "110%"})`,
        opacity: visit.shown ? 1 : 0.6,
      }}
    >
      {visit.who.map((emoji, i) => (
        <span
          key={i}
          className="peeking-friend inline-block"
          style={{ animationDelay: `${i * 180}ms` }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
