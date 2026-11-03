import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { APP_BUILD } from "@/lib/appVersion";

/**
 * Which build the site is serving now. Open tabs poll this and offer a reload
 * when it no longer matches the build they're running.
 */
export const Route = createFileRoute("/version.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(`${JSON.stringify(APP_BUILD)}\n`, {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
    },
  },
});
