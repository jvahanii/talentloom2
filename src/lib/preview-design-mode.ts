// Preview-only "design mode": true only on Lovable editor preview hosts
// (id-preview--*.lovable.app / project--*.lovable.app) and local dev.
// Never true on the published site (talentloom.org, talentloom2.lovable.app),
// so the sign-in gates stay fully enforced there.
export function isPreviewDesignMode(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^id-preview(--|-)/i.test(host) ||
    /^project--/i.test(host) ||
    /\.lovableproject(-dev)?\.com$/i.test(host) ||
    /\.(gpt-eng\.com|gptengineer\.run)$/i.test(host)
  );
}
