// Sign-in pages take a ?redirect= to return to afterwards. Only a path on this
// site may be used, or a link could send someone who just signed in to
// another site (an open redirect).
//
// TanStack Router keeps URL parameters a route's validateSearch leaves out,
// so a route must return `redirect: undefined` for a rejected value, and the
// page checks the value again before using it.

export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
