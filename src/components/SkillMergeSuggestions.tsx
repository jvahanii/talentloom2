import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Merge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeSkills } from "@/lib/people.functions";
import { findMergeSuggestions, type MergeSuggestion, type SkillCount } from "@/lib/skillMerge";
import { learningGroupsKey } from "@/lib/learning";
import { orgSkillNamesKey } from "@/hooks/useOrgSkillNames";
import { MAX_SKILL_LENGTH } from "@/lib/skills";

/** Merges skills into one name and refreshes everything that shows skills. */
function useMergeSkills(orgId: string) {
  const qc = useQueryClient();
  return async (variants: string[], into: string) => {
    const { people } = await mergeSkills({ data: { orgId, variants, into } });
    toast.success(`Merged into ${into} for ${people} ${people === 1 ? "person" : "people"}`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["org-skills", orgId] }),
      qc.invalidateQueries({ queryKey: ["org-people", orgId] }),
      qc.invalidateQueries({ queryKey: orgSkillNamesKey(orgId) }),
      qc.invalidateQueries({ queryKey: learningGroupsKey(orgId) }),
    ]);
  };
}

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
  const runMerge = useMergeSkills(orgId);
  // The most common spelling is kept unless someone picks another.
  const [into, setInto] = useState(suggestion.skills[0].name);
  const [busy, setBusy] = useState(false);

  const merge = async () => {
    setBusy(true);
    try {
      await runMerge(
        suggestion.skills.map((s) => s.name),
        into,
      );
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

const NEW_NAME = "__new__";

/**
 * Merging by hand: pick any skills that mean the same, choose the name to
 * keep (or type a new one), and merge them as the suggestions do.
 */
export function ManualSkillMerge({ orgId, skills }: { orgId: string; skills: SkillCount[] }) {
  const runMerge = useMergeSkills(orgId);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [into, setInto] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Forget picks for skills that no longer exist (merged, or removed elsewhere).
  const names = new Set(skills.map((s) => s.name));
  const chosen = picked.filter((n) => names.has(n));
  const count = (n: string) => skills.find((s) => s.name === n)?.count ?? 0;
  const keep =
    into === NEW_NAME ? newName.trim() : chosen.includes(into) ? into : (chosen[0] ?? "");

  const q = filter.trim().toLowerCase();
  const listed = skills
    .filter((s) => !q || s.name.toLowerCase().includes(q) || chosen.includes(s.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));

  const reset = () => {
    setPicked([]);
    setInto("");
    setNewName("");
    setFilter("");
  };

  const merge = async () => {
    if (chosen.length < 2 || !keep) return;
    const people = chosen.reduce((n, s) => n + count(s), 0);
    if (
      !window.confirm(
        `Merge ${chosen.join(", ")} into "${keep}"? ${people} skill ${people === 1 ? "entry" : "entries"} change, and the new name shows in people's other organisations too.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await runMerge(chosen, keep);
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge the skills");
    } finally {
      setBusy(false);
    }
  };

  if (skills.length < 2) return null;
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Merge className="mr-1 h-4 w-4" /> Merge skills…
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <Merge className="h-4 w-4 shrink-0" /> Merge skills
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick two or more skills that mean the same and the name to keep. Everyone who has any of
            them gets that name once, at their highest level, and the learning groups move along.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Find skills to merge"
        className="max-w-sm"
        aria-label="Find skills to merge"
      />

      <div
        className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto"
        role="group"
        aria-label="Skills"
      >
        {listed.map((s) => {
          const on = chosen.includes(s.name);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => toggle(s.name)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary hover:border-primary"
              }`}
            >
              {on && <Check className="h-3 w-3" />}
              {s.name}
              <span className="opacity-70">· {s.count}</span>
            </button>
          );
        })}
        {!listed.length && <p className="text-xs text-muted-foreground">No skill matches.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-border pt-3">
        {chosen.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            {chosen.length ? "Pick at least one more skill." : "Pick the skills to merge."}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-sm">
              Keep as
              <select
                value={into === NEW_NAME ? NEW_NAME : keep}
                onChange={(e) => setInto(e.target.value)}
                disabled={busy}
                className="h-9 rounded-xl border border-input bg-background px-2 text-sm"
                aria-label="Name to keep"
              >
                {chosen.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={NEW_NAME}>Another name…</option>
              </select>
            </label>
            {into === NEW_NAME && (
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New name"
                maxLength={MAX_SKILL_LENGTH}
                className="h-9 w-48"
                aria-label="New skill name"
                autoFocus
              />
            )}
            <Button size="sm" onClick={merge} disabled={busy || !keep}>
              {busy ? "Merging…" : `Merge ${chosen.length} skills`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
