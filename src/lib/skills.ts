/**
 * A person's skills live on their profile in two columns: `skills` (the names,
 * in the person's order) and `skill_levels` (name → level 1–4). A skill without
 * an entry in `skill_levels` simply has no level yet.
 */

export const SKILL_LEVELS = [
  { value: 1, label: "Novice" },
  { value: 2, label: "Basic" },
  { value: 3, label: "Advanced" },
  { value: 4, label: "Master" },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];
export type Skill = { name: string; level: SkillLevel | null };

export const MAX_SKILLS = 30;
export const MAX_SKILL_LENGTH = 60;

export function skillLevelLabel(level: SkillLevel | null): string | null {
  return SKILL_LEVELS.find((l) => l.value === level)?.label ?? null;
}

function asLevel(v: unknown): SkillLevel | null {
  return SKILL_LEVELS.some((l) => l.value === v) ? (v as SkillLevel) : null;
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
