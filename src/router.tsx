import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isPreviewDesignMode } from "./lib/preview-design-mode";

export const getRouter = () => {
  // In the Lovable editor preview (design mode) there is no signed-in session,
  // so data queries fail — don't retry them, show the empty state right away.
  const designMode = isPreviewDesignMode();
  const queryClient = new QueryClient({
    defaultOptions: designMode
      ? { queries: { retry: false, staleTime: Infinity } }
      : undefined,
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
