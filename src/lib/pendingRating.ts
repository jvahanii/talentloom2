// A star rating chosen on the job board before signing in. It is kept in this
// browser until the person signs in (Google sign-in leaves the page and comes
// back), then saved to their account. Kept for an hour at most.

const KEY = "talentloom.pendingRating";
const MAX_AGE_MS = 60 * 60 * 1000;

export interface PendingRating {
  positionId: string;
  rating: number | null;
}

export function keepPendingRating(p: PendingRating) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* storage unavailable: the prompt still works, the rating just isn't kept */
  }
}

export function readPendingRating(): PendingRating | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingRating & { at?: number };
    if (typeof p.positionId !== "string" || !p.at || Date.now() - p.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    const rating = typeof p.rating === "number" && p.rating >= 1 && p.rating <= 5 ? p.rating : null;
    return { positionId: p.positionId, rating };
  } catch {
    return null;
  }
}

export function clearPendingRating() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Where to return after signing in: a path on this site only, never another site. */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
