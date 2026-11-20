import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Check, Network, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/lib/org";
import { cn } from "@/lib/utils";
import { fetchOrgPeople, orgPeopleKey } from "@/lib/orgCharts";
import {
  addSupervisors,
  fetchSuggestions,
  fetchSupervisors,
  removeSupervisor,
  suggestionsKey,
  supervisorsKey,
  wouldCycle,
  type Edge,
} from "@/lib/supervisors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The Supervisors tab of the Org chart & teams page: a table of everyone
 * and their supervisors. People without one are highlighted; for them the
 * active org chart's suggestions are filled in, to accept one by one or all
 * at once. Relationships that would go round in a circle can't be made.
 */
export function SupervisorsPanel() {
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const peopleQ = useQuery({
    queryKey: orgPeopleKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchOrgPeople(orgId!),
  });
  const edgesQ = useQuery({
    queryKey: supervisorsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchSupervisors(orgId!),
  });
  const suggestQ = useQuery({
    queryKey: suggestionsKey(orgId),
    enabled: !!orgId,
    queryFn: () => fetchSuggestions(orgId!),
  });
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!orgId) return null;
  const people = peopleQ.data ?? [];
  const inOrg = new Set(people.map((p) => p.id));
  const edges = (edgesQ.data ?? []).filter(
    (e) => inOrg.has(e.person_id) && inOrg.has(e.supervisor_id),
  );
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const supervisorsOf = (id: string) =>
    edges.filter((e) => e.person_id === id).map((e) => e.supervisor_id);
  const supervises = (id: string) => edges.filter((e) => e.supervisor_id === id).length;
  /** The chart's suggestions for someone who has no supervisor yet. */
  const suggestionsFor = (id: string) =>
    supervisorsOf(id).length
      ? []
      : (suggestQ.data?.edges ?? [])
          .filter((e) => e.person_id === id && inOrg.has(e.supervisor_id))
          .map((e) => e.supervisor_id);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(
        e && typeof e === "object" && "message" in e ? String(e.message) : "Something went wrong",
      );
    } finally {
      await qc.invalidateQueries({ queryKey: supervisorsKey(orgId) });
      setBusy(false);
    }
  };

  /** Adds relationships in order, skipping any that would close a circle with those before. */
  const addSafely = (wanted: Edge[]) => {
    const now = [...edges];
    const ok: Edge[] = [];
    for (const e of wanted)
      if (!wouldCycle(now, e.person_id, e.supervisor_id)) {
        now.push(e);
        ok.push(e);
      }
    return { ok, skipped: wanted.length - ok.length };
  };

  const missing = people.filter((p) => supervisorsOf(p.id).length === 0);
  const allSuggested = missing.flatMap((p) =>
    suggestionsFor(p.id).map((s) => ({ person_id: p.id, supervisor_id: s })),
  );
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = people
    .filter((p) => !onlyMissing || supervisorsOf(p.id).length === 0)
    .filter((p) =>
      words.every((w) =>
        `${p.name} ${supervisorsOf(p.id).map(nameOf).join(" ")}`.toLowerCase().includes(w),
      ),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm">
            <strong>{people.length - missing.length}</strong> of {people.length} people have a
            supervisor
            {missing.length > 0 && (
              <>
                {" "}
                · <strong className="text-amber-700 dark:text-amber-300">
                  {missing.length}
                </strong>{" "}
                without one
              </>
            )}
            .
          </p>
          <p className="text-xs text-muted-foreground">
            Someone can have several supervisors. Supervisor relationships can't go round in a
            circle.{" "}
            {suggestQ.data?.chart
              ? `Suggestions come from the active org chart, ${suggestQ.data.chart}: a unit's head supervises its members, and is supervised by the head of the unit above.`
              : "Make an org chart active to get suggestions from it."}
          </p>
        </div>
        {allSuggested.length > 0 && (
          <Button
            disabled={busy}
            onClick={() => {
              const { ok, skipped } = addSafely(allSuggested);
              void run(
                () => addSupervisors(orgId, ok),
                `Accepted ${ok.length} ${ok.length === 1 ? "suggestion" : "suggestions"}${skipped ? `; ${skipped} would have been circular` : ""}`,
              );
            }}
          >
            <Sparkles className="mr-1 h-4 w-4" /> Accept all {allSuggested.length} suggestions
          </Button>
        )}
      </div>

      <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person or supervisor"
            aria-label="Find a person or supervisor"
            className="h-9 sm:max-w-xs"
          />
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} />
            Only people without a supervisor
          </label>
        </div>
        {peopleQ.isLoading || edgesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-64 py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 font-semibold">Supervisors</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const sups = supervisorsOf(p.id);
                  const suggested = suggestionsFor(p.id);
                  const none = sups.length === 0;
                  const options = people.filter((x) => x.id !== p.id && !sups.includes(x.id));
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border/60 align-top",
                        none && "bg-amber-50/70 dark:bg-amber-950/30",
                      )}
                    >
                      <td className={cn("py-2 pr-3", none && "border-l-4 border-l-amber-400 pl-2")}>
                        <div className="font-medium">{p.name}</div>
                        {supervises(p.id) > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Supervises {supervises(p.id)}
                          </div>
                        )}
                        {none && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5" /> No supervisor set
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sups.map((s) => (
                            <span
                              key={s}
                              className="flex items-center gap-1 rounded-full border-2 border-border bg-background py-0.5 pl-2.5 pr-1"
                            >
                              {nameOf(s)}
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Remove ${nameOf(s)} as supervisor of ${p.name}`}
                                onClick={() =>
                                  run(
                                    () =>
                                      removeSupervisor(orgId, {
                                        person_id: p.id,
                                        supervisor_id: s,
                                      }),
                                    `${nameOf(s)} no longer supervises ${p.name}`,
                                  )
                                }
                                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ))}
                          {suggested.map((s) => {
                            const circular = wouldCycle(edges, p.id, s);
                            return (
                              <span
                                key={s}
                                title={
                                  circular
                                    ? "From the org chart, but it would make a circle"
                                    : "Suggested by the org chart"
                                }
                                className={cn(
                                  "flex items-center gap-1 rounded-full border-2 border-dashed py-0.5 pl-2.5 pr-1",
                                  circular
                                    ? "border-border text-muted-foreground line-through"
                                    : "border-primary/50 bg-primary/5",
                                )}
                              >
                                <Network className="h-3 w-3 text-muted-foreground" />
                                {nameOf(s)}
                                {!circular && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      run(
                                        () =>
                                          addSupervisors(orgId, [
                                            { person_id: p.id, supervisor_id: s },
                                          ]),
                                        `${nameOf(s)} supervises ${p.name}`,
                                      )
                                    }
                                    className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                                  >
                                    <Check className="h-3 w-3" /> Accept
                                  </button>
                                )}
                              </span>
                            );
                          })}
                          <Select
                            value=""
                            disabled={busy}
                            onValueChange={(s) =>
                              s &&
                              run(
                                () =>
                                  addSupervisors(orgId, [{ person_id: p.id, supervisor_id: s }]),
                                `${nameOf(s)} supervises ${p.name}`,
                              )
                            }
                          >
                            <SelectTrigger
                              className="h-8 w-44"
                              aria-label={`Add a supervisor for ${p.name}`}
                            >
                              <SelectValue placeholder="Add a supervisor" />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((x) => {
                                const circular = wouldCycle(edges, p.id, x.id);
                                return (
                                  <SelectItem key={x.id} value={x.id} disabled={circular}>
                                    {x.name}
                                    {circular ? " — would be circular" : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                {onlyMissing ? "Everyone has a supervisor." : "No one matches."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
