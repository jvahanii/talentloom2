import { useState } from "react";
import { X } from "lucide-react";
import {
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  SKILL_LEVEL_VALUES,
  cleanSkills,
  skillLevelLabel,
  type Skill,
  type SkillLevel,
} from "@/lib/skills";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";

const chipCls =
  "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary";

/** Read-only skills, each with its level (in the organisation's words) when one is set. */
export function SkillChips({ skills }: { skills: Skill[] }) {
  const levelNames = useSkillLevelNames();
  if (!skills.length) return <>—</>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span key={s.name} className={chipCls}>
          {s.name}
          {s.level !== null && (
            <span className="font-normal opacity-75">· {skillLevelLabel(s.level, levelNames)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Skills as removable chips, each with a level picker. Enter or a comma adds
 * what's typed; pasting a comma list adds them all. New skills have no level.
 */
export function SkillsInput({
  value,
  onChange,
  disabled,
  placeholder = "Add a skill and press Enter",
}: {
  value: Skill[];
  onChange: (next: Skill[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const levelNames = useSkillLevelNames();

  const add = (text: string) => {
    const parts = text.split(/[,;\n]/).map((name) => ({ name, level: null }));
    const next = cleanSkills([...value, ...parts]);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  const setLevel = (name: string, level: SkillLevel | null) =>
    onChange(value.map((s) => (s.name === name ? { ...s, level } : s)));

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-white/70 px-2 py-1.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30 dark:bg-white/5">
      {value.map((s) => (
        <span key={s.name} className={chipCls}>
          {s.name}
          <select
            value={s.level ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setLevel(s.name, e.target.value ? (Number(e.target.value) as SkillLevel) : null)
            }
            className="cursor-pointer rounded-full bg-transparent text-xs font-normal outline-none hover:underline disabled:cursor-default"
            aria-label={`Level of ${s.name}`}
          >
            <option value="">no level</option>
            {SKILL_LEVEL_VALUES.map((l) => (
              <option key={l} value={l}>
                {skillLevelLabel(l, levelNames)}
              </option>
            ))}
          </select>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v.name !== s.name))}
              className="rounded-full hover:text-destructive"
              aria-label={`Remove ${s.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && value.length < MAX_SKILLS && (
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : placeholder}
          maxLength={MAX_SKILL_LENGTH}
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none"
          aria-label="Add a skill"
        />
      )}
    </div>
  );
}
