import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import {
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  displayLevel,
  skillLevelValues,
  cleanSkills,
  skillLevelLabel,
  skillLevelColor,
  type Skill,
  type SkillLevel,
  type KnownSkill,
  suggestSkills,
  canonicalSkillName,
} from "@/lib/skills";
import { useOrgSkillNames } from "@/hooks/useOrgSkillNames";
import { useSkillLevelNames } from "@/hooks/useSkillLevelNames";

// Coloured by level, as on the Skills page, over the organisation's number of levels.
const chipCls = (level: SkillLevel | null, count: number) =>
  `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${skillLevelColor(level, count)}`;

/** Read-only skills, each with its level (in the organisation's words) when one is set. */
export function SkillChips({ skills }: { skills: Skill[] }) {
  const levelNames = useSkillLevelNames();
  if (!skills.length) return <>—</>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span key={s.name} className={chipCls(s.level, levelNames.length)}>
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
 * Suggestions for what's being typed, from skills already in the organisation.
 * Arrow keys move, Enter or a click picks, Escape closes. `onKey` returns true
 * when it handled the key, so the field leaves Enter to it.
 */
function useSkillSuggestions(typed: string, exclude: string[], pick: (name: string) => void) {
  const known = useOrgSkillNames();
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const list = closed ? [] : suggestSkills(known, typed, exclude);
  const index = Math.min(active, list.length - 1);

  const onKey = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!list.length) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((index + step + list.length) % list.length);
      return true;
    }
    if (e.key === "Escape") {
      setClosed(true);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(list[index].name);
      return true;
    }
    return false;
  };

  return {
    known,
    onKey,
    // Any new text opens the list again, starting from the top.
    reset: () => {
      setActive(0);
      setClosed(false);
    },
    menu: list.length ? (
      <SuggestionList items={list} active={index} onPick={pick} onHover={setActive} />
    ) : null,
  };
}

function SuggestionList({
  items,
  active,
  onPick,
  onHover,
}: {
  items: KnownSkill[];
  active: number;
  onPick: (name: string) => void;
  onHover: (i: number) => void;
}) {
  return (
    <ul
      role="listbox"
      aria-label="Existing skills"
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border-2 border-border bg-card py-1 text-sm shadow-lg"
    >
      {items.map((k, i) => (
        <li
          key={k.name}
          role="option"
          aria-selected={i === active}
          // mousedown, not click, so the field doesn't blur and add the half-typed text first.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(k.name);
          }}
          onMouseEnter={() => onHover(i)}
          className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${
            i === active ? "bg-primary/10" : ""
          }`}
        >
          <span className="truncate">{k.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {k.count} {k.count === 1 ? "person" : "people"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One skill name, with suggestions from the organisation's existing skills.
 * Picking one, or typing one in another case, gives the existing spelling.
 */
export function SkillNameInput({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel = "Skill name",
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const s = useSkillSuggestions(focused ? value : "", [value], (name) => {
    onChange(name);
    setFocused(false);
  });
  return (
    <div className={`relative ${className}`}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          s.reset();
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (value.trim()) onChange(canonicalSkillName(s.known, value));
        }}
        onKeyDown={(e) => s.onKey(e)}
        placeholder={placeholder}
        maxLength={MAX_SKILL_LENGTH}
        autoComplete="off"
        aria-label={ariaLabel}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      />
      {s.menu}
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
  withLevels = true,
}: {
  value: Skill[];
  onChange: (next: Skill[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Off where there's no organisation to hold the levels. */
  withLevels?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const levelNames = useSkillLevelNames();

  const add = (text: string) => {
    const parts = text
      .split(/[,;\n]/)
      .map((name) => ({ name: canonicalSkillName(suggest.known, name), level: null }));
    const next = cleanSkills([...value, ...parts]);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  const suggest = useSkillSuggestions(
    draft,
    value.map((s) => s.name),
    (name) => add(name),
  );

  const setLevel = (name: string, level: SkillLevel | null) =>
    onChange(value.map((s) => (s.name === name ? { ...s, level } : s)));

  return (
    <div className="relative flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-white/70 px-2 py-1.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30 dark:bg-white/5">
      {value.map((s) => (
        <span key={s.name} className={chipCls(s.level, levelNames.length)}>
          {s.name}
          {withLevels && (
            <select
              value={displayLevel(s.level, levelNames.length) ?? ""}
              disabled={disabled}
              onChange={(e) =>
                setLevel(s.name, e.target.value ? (Number(e.target.value) as SkillLevel) : null)
              }
              className="cursor-pointer rounded-full bg-transparent text-xs font-normal outline-none hover:underline disabled:cursor-default"
              aria-label={`Level of ${s.name}`}
            >
              <option value="">no level</option>
              {skillLevelValues(levelNames).map((l) => (
                <option key={l} value={l}>
                  {skillLevelLabel(l, levelNames)}
                </option>
              ))}
            </select>
          )}
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
            suggest.reset();
            if (/[,;]/.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (suggest.onKey(e)) return;
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
          autoComplete="off"
          aria-label="Add a skill"
        />
      )}
      {suggest.menu}
    </div>
  );
}
