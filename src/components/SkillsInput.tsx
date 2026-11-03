import { useState } from "react";
import { X } from "lucide-react";

export const MAX_SKILLS = 30;
export const MAX_SKILL_LENGTH = 60;

/** Trims, drops empties and case-insensitive duplicates, and caps the list. */
export function cleanSkills(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = raw.trim().replace(/\s+/g, " ").slice(0, MAX_SKILL_LENGTH);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, MAX_SKILLS);
}

/** Skills as removable chips. Enter or a comma adds what's typed; pasting a comma list adds them all. */
export function SkillsInput({
  value,
  onChange,
  disabled,
  placeholder = "Add a skill and press Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (text: string) => {
    const parts = text.split(/[,;\n]/);
    const next = cleanSkills([...value, ...parts]);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-white/70 px-2 py-1.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30 dark:bg-white/5">
      {value.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          {s}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== s))}
              className="rounded-full hover:text-destructive"
              aria-label={`Remove ${s}`}
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
