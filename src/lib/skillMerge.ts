/**
 * Spots skills in an organisation that are probably the same thing written
 * differently, so they can be merged into one. Plain rules, no AI: it catches
 * spelling, punctuation, plurals, small typos, abbreviations and ".js" — not
 * synonyms or translations.
 */

export type SkillCount = { name: string; count: number };
export type MergeSuggestion = {
  /** Stable id for remembering a dismissal: the variants, sorted, lowercased. */
  key: string;
  skills: SkillCount[];
  reason: string;
};

/** Lowercase, no accents, "&" as "and", and no spaces or punctuation (but keep + and #). */
export function normaliseSkill(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9+#À-ɏ]/g, "");
}

function singular(n: string): string {
  if (n.length > 4 && n.endsWith("ies")) return n.slice(0, -3) + "y";
  if (n.length > 4 && /(ses|xes|ches|shes)$/.test(n)) return n.slice(0, -2);
  if (n.length > 3 && n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1);
  return n;
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function initials(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[\s\-_/&]+/)
    .filter((w) => w && !["and", "of", "the", "ja"].includes(w));
  return words.length > 1 ? words.map((w) => w[0]).join("") : "";
}

/** Why two skills look like one, or null when they don't. */
export function similarity(a: string, b: string): string | null {
  const na = normaliseSkill(a);
  const nb = normaliseSkill(b);
  if (!na || !nb) return null;
  if (na === nb) return "Written differently";
  if (singular(na) === singular(nb)) return "Singular and plural";
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (long === `${short}js`) return "Same technology";
  const ia = initials(a);
  const ib = initials(b);
  if ((ia && ia === nb && nb.length >= 2) || (ib && ib === na && na.length >= 2)) {
    return "Abbreviation";
  }
  // Typos: one letter off in names of 5+, two in names of 9+. Numbers must match ("Level 2" ≠ "Level 3").
  if (short.replace(/\D/g, "") !== long.replace(/\D/g, "")) return null;
  const allowed = short.length >= 9 ? 2 : short.length >= 5 ? 1 : 0;
  if (allowed && distance(na, nb) <= allowed) return "Possible typo";
  return null;
}

/** Groups probably-same skills together (a chain of similar pairs counts as one group). */
export function findMergeSuggestions(skills: SkillCount[]): MergeSuggestion[] {
  const parent = skills.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstReason = new Map<string, string>();
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const why = similarity(skills[i].name, skills[j].name);
      if (!why) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
      firstReason.set(skills[i].name, firstReason.get(skills[i].name) ?? why);
    }
  }
  const clusters = new Map<number, SkillCount[]>();
  skills.forEach((s, i) => {
    const r = find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), s]);
  });
  return [...clusters.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([, list]) => {
      const sorted = [...list].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return {
        key: sorted
          .map((s) => s.name.toLowerCase())
          .sort()
          .join("|"),
        skills: sorted,
        reason: list.map((s) => firstReason.get(s.name)).find(Boolean) ?? "Similar",
      };
    })
    .sort(
      (a, b) =>
        b.skills.reduce((n, s) => n + s.count, 0) - a.skills.reduce((n, s) => n + s.count, 0),
    );
}
