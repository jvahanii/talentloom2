import { createMiddleware } from "@tanstack/react-start";
import { getClerkToken } from "@/lib/clerk";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getClerkToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
