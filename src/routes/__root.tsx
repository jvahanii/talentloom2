import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/clerk";
import { Toaster } from "@/components/ui/sonner";
import { AppThemeProvider } from "@/hooks/useAppTheme";
import { UpdateBanner } from "@/components/UpdateBanner";
import { isStaleBuildError, nextAutoReload, reloadFreshPage } from "@/lib/appVersion";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass rounded-3xl p-10 max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        <Link
          to="/"
          className="btn-teal mt-6 inline-block rounded-xl px-5 py-2.5 text-sm font-medium"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // Stable across renders, so the effect below runs (and counts a reload) once per error.
  const err = useMemo(() => (error instanceof Error ? error : new Error(String(error))), [error]);
  const stale = isStaleBuildError(err);
  // A code file missing around a deployment: a fresh reload or a few usually fix it.
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (stale) {
      const wait = nextAutoReload();
      if (wait !== null) {
        setReloading(true);
        const timer = window.setTimeout(() => reloadFreshPage(), wait);
        return () => window.clearTimeout(timer);
      }
    }
    setReloading(false);
    reportLovableError(err, { boundary: "tanstack_root_error_component" });
  }, [err, stale]);

  if (reloading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass rounded-3xl p-10 max-w-md text-center" role="status">
          <h1 className="text-xl font-semibold">Loading the latest version…</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Talentloom was just updated. This takes a few seconds.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass rounded-3xl p-10 max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "A part of the app couldn't be loaded. A newer version is probably available."
            : "An unexpected error occurred. Please try again."}
        </p>
        {err.message ? (
          <p className="mt-3 break-words text-xs text-muted-foreground/80">{err.message}</p>
        ) : null}

        {stale ? (
          <button
            onClick={() => reloadFreshPage()}
            className="btn-teal mt-6 rounded-xl px-5 py-2.5 text-sm font-medium"
          >
            Load fresh version
          </button>
        ) : (
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-teal mt-6 rounded-xl px-5 py-2.5 text-sm font-medium"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Talentloom — One shared candidate flow" },
      {
        name: "description",
        content:
          "Replace the spreadsheet-and-inbox recruiting process with one shared candidate flow. Track candidates, positions, and hiring analytics in one place.",
      },
      { property: "og:title", content: "Talentloom — One shared candidate flow" },
      {
        property: "og:description",
        content: "A clean, glass-morphism candidate flow tracker for hiring teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Rubik:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Invalidates router + query caches when the Clerk sign-in state flips. */
function AuthChangeInvalidator() {
  const { isLoaded, isSignedIn } = useAuth();
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const prev = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (prev.current !== undefined && prev.current !== isSignedIn) {
      router.invalidate();
      if (isSignedIn) queryClient.invalidateQueries();
      else queryClient.clear();
    }
    prev.current = isSignedIn;
  }, [isLoaded, isSignedIn, router, queryClient]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
        <AppThemeProvider>
          <AuthChangeInvalidator />
          <Outlet />
          <Toaster />
          <UpdateBanner />
        </AppThemeProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}
