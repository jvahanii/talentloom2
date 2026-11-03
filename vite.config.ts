// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execSync } from "node:child_process";

/**
 * The build's identity, resolved once so the browser bundle and the server
 * (which answers /version.json) carry exactly the same value. The app compares
 * the two to notice a newer deployment. Vercel passes the commit as
 * VERCEL_GIT_COMMIT_SHA; a local build falls back to git. The timestamp is what
 * the comparison uses, so a build without git still differs from the last one.
 */
function resolveBuild() {
  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      commit = "unknown";
    }
  }
  return { commit: commit || "unknown", builtAt: new Date().toISOString() };
}

const build = resolveBuild();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILD__: JSON.stringify(build),
    },
  },
});
