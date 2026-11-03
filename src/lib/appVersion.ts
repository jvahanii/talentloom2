/**
 * Which build this app is running, and which build the site is now serving.
 *
 * The bundle carries its own identity (`__APP_BUILD__`, injected at build time)
 * and the deployed site publishes the same shape as `version.json`. Comparing
 * the two is the only way to notice a new deployment: the app has no service
 * worker, so nothing tells it the files underneath have changed.
 */

export type BuildInfo = { commit: string; builtAt: string };

/**
 * The build this copy of the app was made from. Empty when the constant was not
 * injected — the test runner and any hand-rolled bundle — which reads as
 * "nothing matches", so no bar is raised.
 */
export const APP_BUILD: BuildInfo =
  typeof __APP_BUILD__ !== "undefined" && __APP_BUILD__
    ? __APP_BUILD__
    : { commit: "unknown", builtAt: "" };

/**
 * Navigation goes through this object rather than straight to `window.location`,
 * so a test can watch what the bar would do instead of actually leaving the
 * page.
 */
export interface BuildNavigator {
  reload(): void;
  replace(url: string): void;
}

export const browserNavigator: BuildNavigator = {
  reload: () => window.location.reload(),
  replace: (url) => window.location.replace(url),
};

/**
 * Asks the site which build it is serving.
 *
 * Answered by the `/version.json` server route. Resolves to `null` whenever the
 * answer is not usable — an error page, an HTML body from a host in between, a
 * network failure. Only a JSON body naming a build counts.
 */
export async function fetchLiveBuild(): Promise<BuildInfo | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    const body = (await res.json()) as Partial<BuildInfo> | null;
    if (!body || typeof body.builtAt !== "string" || !body.builtAt) return null;
    return {
      commit: typeof body.commit === "string" ? body.commit : "unknown",
      builtAt: body.builtAt,
    };
  } catch {
    return null;
  }
}

/**
 * Whether the live build is not the one on screen.
 *
 * Deliberately "different" rather than "later": a rollback that leaves your open
 * tab running something the site no longer serves is just as much a dead end,
 * and the bar is the only way back onto what everyone else is seeing.
 */
export function isNewerBuild(live: BuildInfo, current: BuildInfo = APP_BUILD): boolean {
  return live.builtAt !== current.builtAt;
}

/**
 * Address marker that forces the browser to fetch a fresh copy of the page
 * instead of handing back the one it kept. Stripped once the new build is up,
 * so nobody ends up sharing a link with it in.
 */
export const BUILD_MARKER = "v";

export function buildMarkerUrl(build: BuildInfo): string {
  const params = new URLSearchParams(window.location.search);
  params.set(BUILD_MARKER, build.builtAt);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

/**
 * Leaves the current page for the live build.
 *
 * Go straight to a different document cache key: a normal reload can return
 * the same obsolete HTML. The marker check prevents repeated navigation to a
 * build the host still cannot serve.
 */
export function reloadIntoNewBuild(live: BuildInfo, nav: BuildNavigator = browserNavigator): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get(BUILD_MARKER) === live.builtAt) return;
  nav.replace(buildMarkerUrl(live));
}

/** Recover even when version.json is missing or the current build is unknown. */
export function reloadFreshPage(nav: BuildNavigator = browserNavigator): void {
  nav.replace(buildMarkerUrl({ commit: "recovery", builtAt: `recovery-${Date.now()}` }));
}

/**
 * Removes a build marker left in the address by a forced reload.
 */
export function stripBuildMarker(): void {
  try {
    // Checked before deleting: `delete` reports nothing useful here, so asking
    // afterwards would never tell us the address actually changed.
    const url = new URL(window.location.href);
    if (url.searchParams.has(BUILD_MARKER)) {
      url.searchParams.delete(BUILD_MARKER);
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    // An address we cannot rewrite is not worth failing over.
  }
}

/**
 * Whether an error looks like this tab asking for a code file that a newer
 * deployment has replaced. Reloading onto the live build usually fixes it.
 */
export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message ?? "";
  return (
    error.name === "ChunkLoadError" ||
    m.includes("dynamically imported module") ||
    m.includes("Importing a module script failed") ||
    m.includes("Loading chunk") ||
    m.includes("is not a valid JavaScript MIME type")
  );
}

/** Auto-reload at most once per this window, per tab. */
export const RELOAD_COOLDOWN_MS = 30_000;
const RELOAD_KEY = "staleBuildReloadedAt";

/**
 * Reloads onto a fresh page once, then leaves it to the person. The time is kept
 * in sessionStorage because it has to survive the reload it guards against;
 * without storage we never auto-reload, rather than risk a loop.
 */
export function autoReloadOnce(nav: BuildNavigator = browserNavigator): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reloadFreshPage(nav);
  return true;
}
