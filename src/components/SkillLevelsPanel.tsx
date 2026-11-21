import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequiredIndicator } from "@/components/ui/label";
import { saveSkillLevelNames } from "@/lib/skillSpace.functions";
import { useSkillLevelNames, skillLevelNamesKey } from "@/hooks/useSkillLevelNames";
import {
  DEFAULT_SKILL_LEVEL_NAMES,
  MAX_SKILL_LEVEL_NAME_LENGTH,
  MAX_SKILL_LEVELS,
  MIN_SKILL_LEVELS,
  skillLevelColor,
} from "@/lib/skills";

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

/** Names for skill levels 1–4 in this organisation. Skills and their levels belong to each person. */
export function SkillLevelsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const current = useSkillLevelNames();
  const [names, setNames] = useState(current);
  useEffect(() => setNames(current), [current]);
  const [saving, setSaving] = useState(false);

  const trimmed = names.map((n) => n.trim());
  const changed = trimmed.length !== current.length || trimmed.some((n, i) => n !== current[i]);
  const valid = trimmed.every(Boolean);
  const isDefault =
    current.length === DEFAULT_SKILL_LEVEL_NAMES.length &&
    current.every((n, i) => n === DEFAULT_SKILL_LEVEL_NAMES[i]);
  const fewer = names.length < current.length;

  /** Keeps the names already typed; new levels start as "Level n" for renaming. */
  const setCount = (count: number) =>
    setNames(
      Array.from({ length: count }, (_, i) =>
        i < names.length
          ? names[i]
          : count === 4 && isDefault
            ? DEFAULT_SKILL_LEVEL_NAMES[i]
            : `Level ${i + 1}`,
      ),
    );

  const save = async (next: string[] | null) => {
    setSaving(true);
    try {
      // Saved for the whole skill space when organisations are connected.
      await saveSkillLevelNames({ data: { orgId, names: next } });
      toast.success(next ? "Skill levels saved" : "Skill levels reset");
      await qc.invalidateQueries({ queryKey: skillLevelNamesKey(orgId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the skill levels");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4">
      <h2 className="font-semibold">Skill levels</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        How many levels skills have in this organisation and what they're called, from lowest to
        highest. People pick a level for each skill in Settings, on the People page and on the
        Skills tab. Connected organisations share one set. Everyone in the organisation can change
        them.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Number of levels
        <select
          value={names.length}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={saving}
          className="h-9 rounded-xl border border-input bg-white/70 px-2 text-sm dark:bg-white/5"
        >
          {Array.from(
            { length: MAX_SKILL_LEVELS - MIN_SKILL_LEVELS + 1 },
            (_, i) => i + MIN_SKILL_LEVELS,
          ).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {names.map((name, i) => (
          <label key={i} className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span
                className={`inline-block h-3 w-3 rounded-full ${skillLevelColor(i + 1, names.length)}`}
                aria-hidden
              />
              Level {i + 1} <RequiredIndicator />
            </span>
            <input
              required
              value={name}
              maxLength={MAX_SKILL_LEVEL_NAME_LENGTH}
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              className={inputCls}
            />
          </label>
        ))}
      </div>
      {fewer && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          People whose skills are at a higher level will show at the highest one,{" "}
          <strong>{trimmed[trimmed.length - 1] || `Level ${names.length}`}</strong>, in this
          organisation. Their levels aren't changed, so adding levels back restores them.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => save(trimmed)}
          disabled={saving || !changed || !valid}
          className="btn-teal rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          Save levels
        </button>
        {!isDefault && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            Reset to {DEFAULT_SKILL_LEVEL_NAMES.join(", ")}
          </button>
        )}
      </div>
    </div>
  );
}
