/**
 * A person's skill names live on their profile (`profiles.skills`, in the
 * person's order) and show in all their organisations. Levels are kept per
 * organisation in `org_skill_levels`, so a skill can have a level in one
 * organisation and none in another. (`profiles.skill_levels` is no longer read;
 * it holds the levels from before they moved, which went to the HRD workshop.)
 *
 * Levels are just numbers. Each organisation decides how many it uses (2–7)
 * and what they're called, in `organizations.skill_level_names` (null means the
 * four defaults below). A level above the current count — after the count was
 * lowered — shows as the highest level until it's raised again.
 */

export const MIN_SKILL_LEVELS = 2;
export const MAX_SKILL_LEVELS = 7;
export const DEFAULT_SKILL_LEVEL_NAMES = ["Novice", "Basic", "Advanced", "Master"];
export const MAX_SKILL_LEVEL_NAME_LENGTH = 30;

/** 1 (lowest) up to the organisation's number of levels. */
export type SkillLevel = number;
export type Skill = { name: string; level: SkillLevel | null };

export const MAX_SKILLS = 30;
export const MAX_SKILL_LENGTH = 60;

/** An organisation's level names, falling back to the defaults when unset or malformed. */
export function skillLevelNames(custom: unknown): string[] {
  return Array.isArray(custom) &&
    custom.length >= MIN_SKILL_LEVELS &&
    custom.length <= MAX_SKILL_LEVELS &&
    custom.every((n) => typeof n === "string" && n.trim())
    ? (custom as string[])
    : DEFAULT_SKILL_LEVEL_NAMES;
}

/** The levels to choose from: 1 up to as many as the organisation has names. */
export function skillLevelValues(names: string[] = DEFAULT_SKILL_LEVEL_NAMES): number[] {
  return names.map((_, i) => i + 1);
}

/** A stored level as this organisation shows it: capped at its highest level. */
export function displayLevel(level: SkillLevel | null, count: number): SkillLevel | null {
  return level === null ? null : Math.min(level, count);
}

export function skillLevelLabel(
  level: SkillLevel | null,
  names: string[] = DEFAULT_SKILL_LEVEL_NAMES,
): string | null {
  const shown = displayLevel(level, names.length);
  return shown === null ? null : (names[shown - 1] ?? null);
}

/** A skill name already used in the organisation, and how many people have it. */
export type KnownSkill = { name: string; count: number };

/**
 * Existing skills matching what's being typed: names starting with it first,
 * then names containing it, the most common first. Skips ones in `exclude`.
 */
export function suggestSkills(
  known: KnownSkill[],
  typed: string,
  exclude: string[] = [],
  limit = 6,
): KnownSkill[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const skip = new Set(exclude.map((n) => n.toLowerCase()));
  return known
    .filter((k) => !skip.has(k.name.toLowerCase()) && k.name.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** The organisation's spelling of a skill when it already exists in another case. */
export function canonicalSkillName(known: KnownSkill[], name: string): string {
  const trimmed = name.trim();
  return known.find((k) => k.name.toLowerCase() === trimmed.toLowerCase())?.name ?? trimmed;
}

/** Background and text colours for a level, the same wherever skills are shown. */
// Lowest to highest. With four levels this picks butter, mint, lavender and bubblegum.
const LEVEL_COLORS = [
  "bg-[#FFE9A8] text-[#7A5C00]", // butter
  "bg-[#FFD6B8] text-[#7A3A12]", // peach
  "bg-[#BDF5E0] text-[#0B6B4F]", // mint
  "bg-[#C4E4FF] text-[#17497A]", // sky
  "bg-[#CDBCF5] text-[#4A3A7A]", // lavender
  "bg-[#F2C4F0] text-[#6B1E66]", // orchid
  "bg-[#FF9EC7] text-[#7A1F4B]", // bubblegum
];

/**
 * Background and text colours for a level, spread from yellow to pink over the
 * organisation's number of levels, the same wherever skills are shown.
 */
export function skillLevelColor(
  level: SkillLevel | null,
  count = DEFAULT_SKILL_LEVEL_NAMES.length,
): string {
  const shown = displayLevel(level, count);
  if (shown === null || shown < 1) return "bg-secondary text-muted-foreground";
  const at = count > 1 ? Math.round(((shown - 1) * (LEVEL_COLORS.length - 1)) / (count - 1)) : 0;
  return LEVEL_COLORS[at];
}

function asLevel(v: unknown): SkillLevel | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_SKILL_LEVELS ? v : null;
}

/** Trims, drops empties and case-insensitive duplicates (the first one wins), and caps the list. */
export function cleanSkills(list: Skill[]): Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const s of list) {
    const name = s.name.trim().replace(/\s+/g, " ").slice(0, MAX_SKILL_LENGTH);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, level: asLevel(s.level) });
  }
  return out.slice(0, MAX_SKILLS);
}

/** A person's levels in one organisation: lowercased skill name → level. */
export type LevelMap = Record<string, number>;

/** Builds the list from the profile's skill names and the person's levels in an organisation. */
export function readSkills(names: string[] | null | undefined, levels?: LevelMap): Skill[] {
  return (names ?? []).map((name) => ({ name, level: asLevel(levels?.[name.toLowerCase()]) }));
}

/** Groups org_skill_levels rows by person. */
export function levelMapsByUser(
  rows: { user_id: string; skill: string; level: number }[],
): Map<string, LevelMap> {
  const out = new Map<string, LevelMap>();
  for (const r of rows) {
    const m = out.get(r.user_id) ?? {};
    m[r.skill.toLowerCase()] = r.level;
    out.set(r.user_id, m);
  }
  return out;
}

/** Splits the list into the profile's names and the organisation's levels. */
export function writeSkills(list: Skill[]): {
  skills: string[];
  levels: { skill: string; level: number }[];
} {
  const clean = cleanSkills(list);
  return {
    skills: clean.map((s) => s.name),
    levels: clean
      .filter((s) => s.level !== null)
      .map((s) => ({ skill: s.name, level: s.level as number })),
  };
}
