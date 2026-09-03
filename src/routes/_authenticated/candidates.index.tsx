import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { STAGE_LABEL, type Stage } from "@/lib/constants";
import { useOrg } from "@/lib/org";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/candidates/")({
  head: () => ({
    meta: [
      { title: "Candidates — TalentLoom" },
      { name: "description", content: "Every candidate in your pipeline with their stage and the role they're up for." },
      { property: "og:title", content: "Candidates — TalentLoom" },
      { property: "og:description", content: "Every candidate in your pipeline with their stage and the role they're up for." },
    ],
  }),
  component: CandidatesPage,
});

interface Row {
  id: string;
  name: string;
  email: string | null;
  stage: Stage;
  requisition_id: string | null;
  requisitions: { title: string } | null;
}

function CandidatesPage() {
  const { orgId } = useOrg();
  const [q, setQ] = useState("");

  const candidates = useQuery({
    queryKey: ["all-candidates", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, name, email, stage, requisition_id, requisitions(title)")
        .eq("org_id", orgId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const term = q.trim().toLowerCase();
  const rows = (candidates.data ?? []).filter(
    (c) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term) ||
      (c.requisitions?.title ?? "").toLowerCase().includes(term),
  );

  return (
    <div>
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Candidates</h1>
          <p className="text-sm text-muted-foreground">Everyone in your pipeline and the role they're up for.</p>
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates"
            aria-label="Search candidates"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="glass mt-4 overflow-hidden rounded-2xl">
        <div className="hidden grid-cols-[2fr_1fr_1.5fr] gap-3 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Name</span>
          <span>Status</span>
          <span>Position</span>
        </div>

        {candidates.isLoading && <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {candidates.isError && <p className="p-10 text-center text-sm text-muted-foreground">Couldn't load candidates.</p>}

        {!candidates.isLoading &&
          rows.map((c) => (
            <Link
              key={c.id}
              to="/candidates/$id"
              params={{ id: c.id }}
              className="grid gap-1 border-b border-border px-5 py-4 transition last:border-0 hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[2fr_1fr_1.5fr] sm:items-center sm:gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                {c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
              </div>
              <div>
                <span className="inline-block rounded-full border border-primary/30 bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                  {STAGE_LABEL[c.stage]}
                </span>
              </div>
              <p className="truncate text-sm text-muted-foreground">{c.requisitions?.title ?? "Unassigned"}</p>
            </Link>
          ))}

        {!candidates.isLoading && rows.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">No candidates found.</p>
        )}
      </div>
    </div>
  );
}
