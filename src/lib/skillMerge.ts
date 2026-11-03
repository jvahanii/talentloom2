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

/**
 * Derivational endings that make a different word form of the same skill:
 * Finnish (ratsasta-minen / ratsast-us, ohjelmoi-nti, mentor-ointi) and
 * English (coach-ing, manage-ment). Longest first; one is removed.
 */
const WORD_ENDINGS = [
  "aminen",
  "äminen",
  "minen",
  "ation",
  "ointi",
  "öinti",
  "ment",
  "inti",
  "uus",
  "yys",
  "ing",
  "nta",
  "ntä",
  "us",
  "ys",
];

/** The word without its ending, and without a final vowel (suunnittel-u / suunnittel-e-minen). */
function stem(word: string): string {
  // Endings before the English plural, or "johtajuus" would lose its s first.
  const cut = (w: string) => WORD_ENDINGS.find((e) => w.endsWith(e) && w.length - e.length >= 3);
  const ending = cut(word);
  const w = ending ? word : singular(word);
  const end = ending ?? cut(w);
  const base = end ? w.slice(0, -end.length) : w;
  return base.length > 4 ? base.replace(/[aeiouyäö]$/, "") : base;
}

/** Same stem, or one stem the other plus a letter or two (ratsast / ratsasta, opet / opett). */
function sameStem(a: string, b: string): boolean {
  if (a === b) return a.length >= 4;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2;
}

/** Whether two names are the same words in other forms, word by word ("Ratsastaminen" / "Ratsastus"). */
function sameWordForms(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .split(/[\s\-_/]+/)
      .map(normaliseSkill)
      .filter(Boolean);
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || wa.length !== wb.length) return false;
  // Words match as they are or by a stem long enough to mean something.
  return wa.every((w, i) => w === wb[i] || sameStem(stem(w), stem(wb[i])));
}

/**
 * A typo is one word off by a letter (words of 5+) or two (9+); the other
 * words must match, so "Project management" isn't "Product management".
 * Words run together or apart ("Data base" / "Database") compare as one.
 */
function isTypo(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .split(/[\s\-_/]+/)
      .map(normaliseSkill)
      .filter(Boolean);
  const wa = words(a);
  const wb = words(b);
  const [pa, pb] = wa.length === wb.length ? [wa, wb] : [[wa.join("")], [wb.join("")]];
  const differing = pa.map((w, i) => [w, pb[i]]).filter(([x, y]) => x !== y);
  if (differing.length !== 1) return false;
  const [x, y] = differing[0];
  const len = Math.min(x.length, y.length);
  const allowed = len >= 9 ? 2 : len >= 5 ? 1 : 0;
  return allowed > 0 && distance(x, y) <= allowed;
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
  // Numbers must match ("Level 2" ≠ "Level 3").
  if (short.replace(/\D/g, "") !== long.replace(/\D/g, "")) return null;
  if (isTypo(a, b)) return "Possible typo";
  if (sameWordForms(a, b)) return "Same word in another form";
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
