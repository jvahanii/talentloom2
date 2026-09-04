import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, User2, ArrowLeft, EyeOff, RotateCcw } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { StarRating } from "@/components/StarRating";
import { usePositionRatings } from "@/hooks/usePositionRatings";
import { getPosition } from "@/lib/apply.functions";

export const Route = createFileRoute("/apply/position/$id")({
  head: () => ({
    meta: [
      { title: "Position details — Talentloom" },
      { name: "description", content: "Read the full job description and apply with your CV and cover letter." },
      { property: "og:title", content: "Position details — Talentloom" },
      { property: "og:description", content: "Read the full job description and apply with your CV and cover letter." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PositionPage,
});

function PositionPage() {
  const { id } = Route.useParams();
  const ratings = usePositionRatings();
  const { data: position, isLoading } = useQuery({
    queryKey: ["position", id],
    queryFn: () => getPosition({ data: { id } }),
  });

  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link to="/apply" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All positions
        </Link>

        {isLoading && <div className="glass mt-6 h-64 animate-pulse rounded-2xl" />}

        {!isLoading && !position && (
          <div className="glass mt-6 rounded-2xl p-10 text-center">
            <h1 className="font-display text-2xl font-bold">Position not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This role may have been filled or closed. Browse the other open positions instead.
            </p>
          </div>
        )}

        {position && (
          <article className="glass mt-6 rounded-2xl p-6 sm:p-8">
            <h1 className="font-display text-3xl font-bold tracking-tight">{position.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1">
                <Building2 className="h-3.5 w-3.5" /> {position.orgName}
              </span>
              {position.department && (
                <span className="rounded-full border border-border bg-muted px-2.5 py-1">{position.department}</span>
              )}
              {position.hiringManager && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1">
                  <User2 className="h-3.5 w-3.5" /> {position.hiringManager}
                </span>
              )}
              {position.targetStartDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Starts {position.targetStartDate}
                </span>
              )}
              {position.deadlineDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" /> Apply by {position.deadlineDate}
                </span>
              )}
            </div>

            <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {position.description || "No description has been added for this position yet — apply and the team will share the details."}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <span className="text-sm font-semibold">Your rating</span>
              <StarRating
                value={ratings.ratingOf(id)}
                disabled={!ratings.signedIn}
                size="md"
                onChange={(v) => ratings.setRating(id, v)}
                label="Your rating for this position"
              />
              {ratings.signedIn ? (
                <button
                  type="button"
                  onClick={() => ratings.setDiscarded(id, !ratings.isDiscarded(id))}
                  className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground active:scale-95"
                >
                  {ratings.isDiscarded(id) ? (
                    <><RotateCcw className="h-3.5 w-3.5" /> Restore</>
                  ) : (
                    <><EyeOff className="h-3.5 w-3.5" /> Discard</>
                  )}
                </button>
              ) : (
                <Link to="/candidate/auth" className="text-xs font-semibold text-primary">
                  Sign in to rate and shortlist
                </Link>
              )}
            </div>

            <Link
              to="/apply/$orgId"
              params={{ orgId: position.orgId }}
              search={{ req: position.id }}
              className="btn-teal mt-8 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              Apply for this position
            </Link>
          </article>
        )}
      </section>
    </MarketingShell>
  );
}
