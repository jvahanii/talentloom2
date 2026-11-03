import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mergeSkills } from "@/lib/people.functions";
import { findMergeSuggestions, type MergeSuggestion, type SkillCount } from "@/lib/skillMerge";
import { learningGroupsKey } from "@/lib/learning";
import { orgSkillNamesKey } from "@/hooks/useOrgSkillNames";

const SHOWN = 3;
const dismissedKey = (orgId: string) => `talentloom:skill-merge-dismissed:${orgId}`;

function readDismissed(orgId: string): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(dismissedKey(orgId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Skills that look like the same thing written differently, with a way to
 * merge each group into one name or to say they're not the same. "Not the
 * same" is remembered in this browser.
 */
export function SkillMergeSuggestions({ orgId, skills }: { orgId: string; skills: SkillCount[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setDismissed(readDismissed(orgId)), [orgId]);

  const suggestions = useMemo(
    () => findMergeSuggestions(skills).filter((s) => !dismissed.includes(s.key)),
    [skills, dismissed],
  );
  if (!suggestions.length) return null;

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      window.localStorage.setItem(dismissedKey(orgId), JSON.stringify(next));
    } catch {
      /* not remembered, only hidden for now */
    }
  };

  const visible = showAll ? suggestions : suggestions.slice(0, SHOWN);
  return (
    <div className="rounded-2xl border-2 border-[#FFD66B] bg-[#FFF6D6] p-4 text-[#5C4500] dark:border-[#7A5C00] dark:bg-[#2E2610] dark:text-[#FFE9A8]">
      <div className="flex items-center gap-2">
        <Merge className="h-4 w-4 shrink-0" />
        <p className="font-semibold">
          {suggestions.length === 1
            ? "These skills may be the same"
            : `${suggestions.length} groups of skills may be the same`}
        </p>
      </div>
      <p className="mt-0.5 text-xs opacity-80">
        Merging gives everyone who has any of them the one name you keep, at their highest level,
        and moves the learning groups along. The new name shows in their other organisations too.
      </p>
      <ul className="mt-3 space-y-2">
        {visible.map((s) => (
          <SuggestionRow
            key={s.key}
            orgId={orgId}
            suggestion={s}
            onDismiss={() => dismiss(s.key)}
          />
        ))}
      </ul>
      {suggestions.length > SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs font-medium underline"
        >
          {showAll ? "Show fewer" : `Show all ${suggestions.length}`}
        </button>
      )}
    </div>
  );
}

function SuggestionRow({
  orgId,
  suggestion,
  onDismiss,
}: {
  orgId: string;
  suggestion: MergeSuggestion;
  onDismiss: () => void;
}) {
  const qc = useQueryClient();
  // The most common spelling is kept unless someone picks another.
  const [into, setInto] = useState(suggestion.skills[0].name);
  const [busy, setBusy] = useState(false);

  const merge = async () => {
    setBusy(true);
    try {
      const { people } = await mergeSkills({
        data: { orgId, variants: suggestion.skills.map((s) => s.name), into },
      });
      toast.success(`Merged into ${into} for ${people} ${people === 1 ? "person" : "people"}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["org-skills", orgId] }),
        qc.invalidateQueries({ queryKey: ["org-people", orgId] }),
        qc.invalidateQueries({ queryKey: orgSkillNamesKey(orgId) }),
        qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge the skills");
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-white/70 p-3 text-foreground sm:flex-row sm:items-center dark:bg-black/20">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestion.skills.map((s) => (
            <span
              key={s.name}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
            >
              {s.name} <span className="text-muted-foreground">· {s.count}</span>
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs">
          Keep
          <select
            value={into}
            onChange={(e) => setInto(e.target.value)}
            disabled={busy}
            className="h-8 rounded-full border-2 border-border bg-background px-2 text-xs"
            aria-label="Name to keep"
          >
            {suggestion.skills.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={merge} disabled={busy}>
          {busy ? "Merging…" : "Merge"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
          Not the same
        </Button>
      </div>
    </li>
  );
}
