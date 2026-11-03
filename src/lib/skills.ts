/**
 * A person's skills live on their profile in two columns: `skills` (the names,
 * in the person's order) and `skill_levels` (name → level 1–4). A skill without
 * an entry in `skill_levels` simply has no level yet.
 *
 * The levels themselves are just 1–4; each organisation names them in
 * `organizations.skill_level_names` (null means the defaults below).
 */

export const SKILL_LEVEL_VALUES = [1, 2, 3, 4] as const;
export const DEFAULT_SKILL_LEVEL_NAMES = ["Novice", "Basic", "Advanced", "Master"];
export const MAX_SKILL_LEVEL_NAME_LENGTH = 30;

export type SkillLevel = (typeof SKILL_LEVEL_VALUES)[number];
export type Skill = { name: string; level: SkillLevel | null };

export const MAX_SKILLS = 30;
export const MAX_SKILL_LENGTH = 60;

/** An organisation's level names, falling back to the defaults when unset or malformed. */
export function skillLevelNames(custom: unknown): string[] {
  return Array.isArray(custom) &&
    custom.length === SKILL_LEVEL_VALUES.length &&
    custom.every((n) => typeof n === "string" && n.trim())
    ? (custom as string[])
    : DEFAULT_SKILL_LEVEL_NAMES;
}

export function skillLevelLabel(
  level: SkillLevel | null,
  names: string[] = DEFAULT_SKILL_LEVEL_NAMES,
): string | null {
  return level === null ? null : (names[level - 1] ?? null);
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
export function skillLevelColor(level: SkillLevel | null): string {
  switch (level) {
    case 1:
      return "bg-[#FFE9A8] text-[#7A5C00]"; // butter
    case 2:
      return "bg-[#BDF5E0] text-[#0B6B4F]"; // mint
    case 3:
      return "bg-[#CDBCF5] text-[#4A3A7A]"; // lavender
    case 4:
      return "bg-[#FF9EC7] text-[#7A1F4B]"; // bubblegum
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function asLevel(v: unknown): SkillLevel | null {
  return SKILL_LEVEL_VALUES.some((l) => l === v) ? (v as SkillLevel) : null;
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

/** Builds the list from the two profile columns. */
export function readSkills(names: string[] | null | undefined, levels: unknown): Skill[] {
  const map = levels && typeof levels === "object" ? (levels as Record<string, unknown>) : {};
  return (names ?? []).map((name) => ({ name, level: asLevel(map[name]) }));
}

/** Splits the list back into the two profile columns. */
export function writeSkills(list: Skill[]): {
  skills: string[];
  skill_levels: Record<string, number>;
} {
  const clean = cleanSkills(list);
  return {
    skills: clean.map((s) => s.name),
    skill_levels: Object.fromEntries(
      clean.filter((s) => s.level !== null).map((s) => [s.name, s.level as number]),
    ),
  };
}
