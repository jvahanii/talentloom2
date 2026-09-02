import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, Search } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { listOpenPositions } from "@/lib/apply.functions";

export const Route = createFileRoute("/apply/")({
  head: () => ({
    meta: [
      { title: "Open positions — Talently" },
      { name: "description", content: "Browse open positions from companies hiring on Talently and apply with your CV in minutes." },
      { property: "og:title", content: "Open positions — Talently" },
      { property: "og:description", content: "Browse open positions from companies hiring on Talently and apply with your CV in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search['q'] === "string" ? (search['q'] as string) : "",
    org: typeof search['org'] === "string" ? (search['org'] as string) : "",
  }),
  component: JobBoard,
});

function JobBoard() {
  const { q, org } = Route.useSearch();
  const navigate = useNavigate({ from: "/apply" });

  const { data: positions, isLoading } = useQuery({
    queryKey: ["open-positions"],
    queryFn: () => listOpenPositions(),
  });

  const all = positions ?? [];
  const companies = [...new Map(all.map((p) => [p.orgId, p.orgName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const term = q.trim().toLowerCase().slice(0, 100);
  const filtered = all.filter((p) => {
    if (org && p.orgId !== org) return false;
    if (!term) return true;
    return [p.title, p.orgName, p.department ?? ""].some((v) => v.toLowerCase().includes(term));
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
                {p.targetStartDate && (
                  <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground/80">
                    Starts {p.targetStartDate}
                  </span>
                )}
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
