import { createFileRoute, redirect } from "@tanstack/react-router";

// Teams is now a tab of Org chart & teams; old links and bookmarks land there.
export const Route = createFileRoute("/_authenticated/teams")({
  beforeLoad: () => {
    throw redirect({ to: "/org-chart", search: { section: "teams" }, replace: true });
  },
});
