import { createFileRoute, redirect } from "@tanstack/react-router";

/** Bonus schemes moved to the Compensation page; old links land on its tab. */
export const Route = createFileRoute("/_authenticated/bonus-schemes")({
  beforeLoad: () => {
    try {
      window.localStorage.setItem("talentloom:tab:compensation", "bonuses");
    } catch {
      /* the default tab, then */
    }
    throw redirect({ to: "/compensation" });
  },
});
