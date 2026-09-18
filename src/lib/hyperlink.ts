/**
 * Tidies a link typed into a form: trims it, and adds "https://" when the
 * scheme is missing ("example.com/jobs/1" → "https://example.com/jobs/1").
 * Returns null for an empty value so it saves as no link.
 */
export function normalizeHyperlink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Host name for showing a link compactly, e.g. "www.example.com". */
export function hyperlinkLabel(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
