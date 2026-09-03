import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, EyeOff, RotateCcw, Search } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { StarRating } from "@/components/StarRating";
import { usePositionRatings } from "@/hooks/usePositionRatings";
import { listOpenPositions } from "@/lib/apply.functions";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "rating-desc", label: "Highest rated" },
  { value: "rating-asc", label: "Lowest rated" },
  { value: "deadline", label: "Deadline soonest" },
  { value: "company", label: "Company A–Z" },
] as const;

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "rated", label: "Rated" },
  { value: "discarded", label: "Discarded" },
] as const;

export const Route = createFileRoute("/apply/")({
  head: () => ({
    meta: [
      { title: "Open positions — TalentLoom" },
      { name: "description", content: "Browse open positions from companies hiring on TalentLoom and apply with your CV in minutes." },
      { property: "og:title", content: "Open positions — TalentLoom" },
      { property: "og:description", content: "Browse open positions from companies hiring on TalentLoom and apply with your CV in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { q?: string; org?: string; sort?: string; view?: string } => ({
    ...(typeof search['q'] === "string" && search['q'] ? { q: search['q'] as string } : {}),
    ...(typeof search['org'] === "string" && search['org'] ? { org: search['org'] as string } : {}),
    ...(typeof search['sort'] === "string" && search['sort'] ? { sort: search['sort'] as string } : {}),
    ...(typeof search['view'] === "string" && search['view'] ? { view: search['view'] as string } : {}),
  }),
  component: JobBoard,
});

function JobBoard() {
  const { q = "", org = "", sort = "newest", view = "active" } = Route.useSearch();
  const navigate = useNavigate({ from: "/apply/" });
  const ratings = usePositionRatings();

  const safeSort = SORTS.some((s) => s.value === sort) ? sort : "newest";
  const safeView = VIEWS.some((v) => v.value === view) ? view : "active";

  const { data: positions, isLoading } = useQuery({
    queryKey: ["open-positions"],
    queryFn: () => listOpenPositions(),
  });

  const all = positions ?? [];
  const companies = [...new Map(all.map((p) => [p.orgId, p.orgName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const term = q.trim().toLowerCase().slice(0, 100);
  const filtered = all
    .filter((p) => {
      if (org && p.orgId !== org) return false;
      const discarded = ratings.isDiscarded(p.id);
      if (safeView === "discarded" && !discarded) return false;
      if (safeView !== "discarded" && discarded) return false;
      if (safeView === "rated" && ratings.ratingOf(p.id) === null) return false;
      if (!term) return true;
      return [p.title, p.orgName, p.department ?? ""].some((v) => v.toLowerCase().includes(term));
    })
    .sort((a, b) => {
      switch (safeSort) {
        case "rating-desc":
          return (ratings.ratingOf(b.id) ?? 0) - (ratings.ratingOf(a.id) ?? 0);
        case "rating-asc":
          return (ratings.ratingOf(a.id) ?? 6) - (ratings.ratingOf(b.id) ?? 6);
        case "deadline":
          return (a.deadlineDate ?? "9999").localeCompare(b.deadlineDate ?? "9999");
        case "company":
          return a.orgName.localeCompare(b.orgName);
        default:
          return 0;
      }
    });

  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Open positions</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Read the full description of every role companies are hiring for right now, then apply with your CV — no account needed.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="glass flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }) })}
              placeholder="Search by role, company or team"
              className="w-full bg-transparent text-sm outline-none"
              aria-label="Search open positions"
            />
          </label>
          <select
            value={org}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, org: e.target.value }) })}
            aria-label="Filter by company"
            className="glass rounded-xl px-3 py-2 text-sm sm:w-56"
          >
            <option value="">All companies</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        <div className="mt-6 grid gap-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="glass h-28 animate-pulse rounded-2xl" />)}

          {!isLoading && filtered.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-display text-lg font-semibold">
                {all.length === 0 ? "No open positions right now" : "No positions match your search"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {all.length === 0
                  ? "Check back soon — new positions are added regularly."
                  : "Try a different keyword or clear the company filter."}
              </p>
            </div>
          )}

          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/apply/position/$id"
              params={{ id: p.id }}
              className="glass rounded-2xl p-6 transition hover:brightness-105"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{p.title}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" /> {p.orgName}
                    {p.department ? ` · ${p.department}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {p.targetStartDate && (
                    <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground/80">
                      Starts {p.targetStartDate}
                    </span>
                  )}
                  {p.deadlineDate && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      Apply by {p.deadlineDate}
                    </span>
                  )}
                </span>
              </div>
              {p.excerpt && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>}
              <span className="mt-4 inline-block text-sm font-semibold text-primary">View description &amp; apply →</span>
            </Link>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
