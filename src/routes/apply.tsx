import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2 } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { listOpenOrganizations } from "@/lib/apply.functions";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Find a role — Talently" },
      { name: "description", content: "Browse companies hiring on Talently and apply with your CV in minutes." },
      { property: "og:title", content: "Find a role — Talently" },
      { property: "og:description", content: "Browse companies hiring on Talently and apply with your CV in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyDirectory,
});

function ApplyDirectory() {
  const { data: orgs, isLoading } = useQuery({
    queryKey: ["open-organizations"],
    queryFn: () => listOpenOrganizations(),
  });

  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Find your next role</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            These companies are hiring right now. Pick one to see its open roles and apply with your CV — no account needed.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
            ))}

          {!isLoading && (orgs ?? []).length === 0 && (
            <div className="glass col-span-full rounded-2xl p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-display text-lg font-semibold">No open roles right now</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Check back soon — new positions are added regularly. If a company sent you an apply link, use that link directly.
              </p>
            </div>
          )}

          {(orgs ?? []).map((org) => (
            <div key={org.id} className="glass flex flex-col justify-between rounded-2xl p-6">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-lg font-semibold">{org.name}</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {org.openRoles} open role{org.openRoles === 1 ? "" : "s"}
                </p>
              </div>
              <Link
                to="/apply/$orgId"
                params={{ orgId: org.id }}
                className="btn-light mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
              >
                View roles &amp; apply
              </Link>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
