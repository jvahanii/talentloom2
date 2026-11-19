import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Called once a day by the pg_cron job "import-job-ads" on the database, with
// the token kept in its vault (job_ad_import_token).
export const Route = createFileRoute("/api/import-job-ads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const { importAllJobAdFeeds, isImportTokenValid } =
          await import("@/lib/job-ad-import.server");
        if (!token || !(await isImportTokenValid(token))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const results = await importAllJobAdFeeds();
        const ok = results.every((r) => r.ok);
        return Response.json({ results }, { status: ok ? 200 : 502 });
      },
    },
  },
});
