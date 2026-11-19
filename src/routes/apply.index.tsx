import { useEffect, useRef, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  CalendarPlus,
  ExternalLink,
  EyeOff,
  MapPin,
  RotateCcw,
  Search,
} from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { StarRating } from "@/components/StarRating";
import { usePositionRatings } from "@/hooks/usePositionRatings";
import { useBoardPrefs } from "@/hooks/useBoardPrefs";
import { listOpenPositions, type BoardEntry } from "@/lib/apply.functions";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www./, "");
  } catch {
    return "the original site";
  }
}

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "rating-desc", label: "Highest rated" },
  { value: "rating-asc", label: "Lowest rated" },
  { value: "deadline", label: "Deadline soonest" },
  { value: "company", label: "Company A–Z" },
] as const;

// "Active", "Past" and "All" leave out what the visitor discarded; "All"
// is open and closed roles together. Rated and Discarded need signing in.
const VIEWS = [
  { value: "active", label: "Active", signedIn: false },
  { value: "past", label: "Past", signedIn: false },
  { value: "all", label: "All", signedIn: false },
  { value: "rated", label: "Rated", signedIn: true },
  { value: "discarded", label: "Discarded", signedIn: true },
] as const;

export const Route = createFileRoute("/apply/")({
  head: () => ({
    meta: [
      { title: "Find your next role — Talentloom" },
      {
        name: "description",
        content:
          "Explore roles from companies hiring on Talentloom. Find a great fit and apply without wasting your time.",
      },
      { property: "og:title", content: "Find your next role — Talentloom" },
      {
        property: "og:description",
        content:
          "Explore roles from companies hiring on Talentloom. Find a great fit and apply without wasting your time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; org?: string; sort?: string; view?: string } => ({
    ...(typeof search["q"] === "string" && search["q"] ? { q: search["q"] as string } : {}),
    ...(typeof search["org"] === "string" && search["org"] ? { org: search["org"] as string } : {}),
    ...(typeof search["sort"] === "string" && search["sort"]
      ? { sort: search["sort"] as string }
      : {}),
    ...(typeof search["view"] === "string" && search["view"]
      ? { view: search["view"] as string }
      : {}),
  }),
  component: JobBoard,
});

function JobBoard() {
  const { q = "", org = "", sort = "newest", view = "active" } = Route.useSearch();
  const navigate = useNavigate({ from: "/apply/" });
  const ratings = usePositionRatings();

  const boardPrefs = useBoardPrefs();

  const safeSort = SORTS.some((s) => s.value === sort) ? sort : "newest";
  const safeView = VIEWS.some((v) => v.value === view) ? view : "active";

  // Restore saved selections once, only when the URL carries none of its own.
  const restored = useRef(false);
  const search = Route.useSearch();
  useEffect(() => {
    if (restored.current || !boardPrefs.ready) return;
    restored.current = true;
    const urlHasFilters = !!(search.q || search.org || search.sort || search.view);
    const p = boardPrefs.prefs;
    if (urlHasFilters || !p) return;
    const next = {
      ...(p.q ? { q: p.q } : {}),
      ...(p.org_id ? { org: p.org_id } : {}),
      ...(p.sort && SORTS.some((s) => s.value === p.sort) ? { sort: p.sort } : {}),
      ...(p.view && VIEWS.some((v) => v.value === p.view) ? { view: p.view } : {}),
    };
    if (Object.keys(next).length > 0) navigate({ search: next, replace: true });
  }, [boardPrefs.ready, boardPrefs.prefs, search, navigate]);

  const apply = (patch: Partial<{ q: string; org: string; sort: string; view: string }>) => {
    const next = { q, org, sort: safeSort, view: safeView, ...patch };
    navigate({ search: () => next, replace: true });
    boardPrefs.save(next);
  };

  const resetFilters = () => {
    navigate({ search: () => ({}), replace: true });
    boardPrefs.save({ q: "", org: "", sort: "newest", view: "active" });
  };

  const { data: positions, isLoading } = useQuery({
    queryKey: ["open-positions"],
    queryFn: () => listOpenPositions(),
  });

  const all = positions ?? [];
  const companies = [
    ...new Map(all.filter((p) => p.orgName).map((p) => [p.orgId, p.orgName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));

  // Several titles at once: "designer, product manager" matches either one.
  const terms = q
    .toLowerCase()
    .slice(0, 500)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  const filtered = all
    .filter((p) => {
      if (org && p.orgId !== org) return false;
      const discarded = ratings.isDiscarded(p.id);
      if (safeView === "discarded" && !discarded) return false;
      if (safeView !== "discarded" && discarded) return false;
      if (safeView === "rated" && ratings.ratingOf(p.id) === null) return false;
      if (safeView === "active" && p.closed) return false;
      if (safeView === "past" && !p.closed) return false;
      if (terms.length === 0) return true;
      return [p.title, p.orgName, p.department ?? "", p.location ?? ""].some((v) =>
        terms.some((t) => v.toLowerCase().includes(t)),
      );
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
          return b.postedAt.localeCompare(a.postedAt);
      }
    });

  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Find a role worth your time
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Browse clear, current opportunities and apply in minutes. No account needed — create one
            when you want to save time later.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="glass flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => apply({ q: e.target.value })}
              placeholder="Try “designer, engineer” — separate titles with commas"
              className="w-full bg-transparent text-sm outline-none"
              aria-label="Search open positions"
            />
          </label>
          <select
            value={org}
            onChange={(e) => apply({ org: e.target.value })}
            aria-label="Filter by company"
            className="glass rounded-xl px-3 py-2 text-sm sm:w-56"
          >
            <option value="">Every company</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={safeSort}
            onChange={(e) => apply({ sort: e.target.value })}
            aria-label="Sort positions"
            className="glass rounded-xl px-3 py-2 text-sm sm:w-48"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {VIEWS.filter((v) => ratings.signedIn || !v.signedIn).map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => apply({ view: v.value })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                safeView === v.value
                  ? "bg-primary text-primary-foreground"
                  : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="glass rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            Reset filters
          </button>
        </div>
        {!ratings.signedIn && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            <Link
              to="/candidate/auth"
              search={{ redirect: "/apply" }}
              className="font-semibold text-primary"
            >
              Sign in
            </Link>{" "}
            to save your shortlist and keep your search organised.
          </p>
        )}

        {!isLoading && filtered.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {filtered.length === 1 ? "1 role" : `${filtered.length} roles`}
          </p>
        )}

        <div className="mt-3 grid gap-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
            ))}

          {!isLoading && filtered.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-display text-lg font-semibold">
                {all.length === 0
                  ? "Nothing open just yet"
                  : safeView === "past" && terms.length === 0 && !org
                    ? "No past roles yet"
                    : "No roles match that search"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {all.length === 0
                  ? "New opportunities land here regularly. Check back soon — your next role could be on its way."
                  : "Try another keyword or broaden your company filter."}
              </p>
            </div>
          )}

          {filtered.map((p) => (
            <BoardCard key={p.id} entry={p}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{p.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    {p.orgName && (
                      <>
                        <Building2 className="h-4 w-4 shrink-0" /> {p.orgName}
                        {p.department ? ` · ${p.department}` : ""}
                      </>
                    )}
                    {p.location && (
                      <>
                        <MapPin className="ml-1 h-4 w-4 shrink-0" /> {p.location}
                      </>
                    )}
                    {p.addedOn && (
                      <>
                        <CalendarPlus className="ml-1 h-4 w-4 shrink-0" /> Added {p.addedOn}
                      </>
                    )}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {p.targetStartDate && (
                    <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground/80">
                      Starts {p.targetStartDate}
                    </span>
                  )}
                  {p.closed ? (
                    <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {p.closed === "removed"
                        ? "No longer listed"
                        : `Closed ${p.deadlineDate ?? ""}`.trim()}
                    </span>
                  ) : (
                    p.deadlineDate && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        Apply by {p.deadlineDate}
                      </span>
                    )
                  )}
                </span>
              </div>
              {p.excerpt && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {p.url ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Read the ad on {hostOf(p.url)} <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-primary">
                    See the role and apply →
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <StarRating
                    value={ratings.ratingOf(p.id)}
                    locked={!ratings.signedIn}
                    onChange={(v) => ratings.setRating(p.id, v)}
                    label={`Your rating for ${p.title}`}
                  />
                  {ratings.signedIn && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        ratings.setDiscarded(p.id, !ratings.isDiscarded(p.id));
                      }}
                      className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground active:scale-95"
                    >
                      {ratings.isDiscarded(p.id) ? (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> Discard
                        </>
                      )}
                    </button>
                  )}
                </span>
              </div>
            </BoardCard>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

/** A Talentloom position opens its page here; an imported ad opens the
 *  original ad in a new tab. */
function BoardCard({ entry, children }: { entry: BoardEntry; children: ReactNode }) {
  // Every match is on the page at once (up to some 1,600), so the browser
  // skips rendering cards while they are off screen.
  const className =
    "glass rounded-2xl p-6 transition hover:brightness-105 [content-visibility:auto] [contain-intrinsic-size:auto_180px]";
  if (entry.url) {
    return (
      <a href={entry.url} target="_blank" rel="noopener noreferrer nofollow" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to="/apply/position/$id" params={{ id: entry.id }} className={className}>
      {children}
    </Link>
  );
}
