/**
 * A person's skills and levels are kept per organisation in `org_member_skills`
 * (in the person's order), so someone in several organisations sets their
 * skills separately in each. (`profiles.skills`, `profiles.skill_levels` and
 * `org_skill_levels` are no longer read; they hold the data from before the
 * split, which was copied to every organisation the person was in.)
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

/** A row of org_member_skills, as read. */
export type MemberSkillRow = {
  user_id: string;
  skill: string;
  level: number | null;
  position: number;
};

/** Groups org_member_skills rows into each person's list, in their order. */
export function skillsByUser(rows: MemberSkillRow[]): Map<string, Skill[]> {
  const out = new Map<string, MemberSkillRow[]>();
  for (const r of rows) out.set(r.user_id, [...(out.get(r.user_id) ?? []), r]);
  return new Map(
    [...out].map(([user, list]) => [
      user,
      list
        .sort((a, b) => a.position - b.position || a.skill.localeCompare(b.skill))
        .map((r) => ({ name: r.skill, level: asLevel(r.level) })),
    ]),
  );
}

/** A person's list as rows to store for one organisation. */
export function writeSkills(
  list: Skill[],
): { skill: string; level: number | null; position: number }[] {
  return cleanSkills(list).map((s, i) => ({ skill: s.name, level: s.level, position: i + 1 }));
}
