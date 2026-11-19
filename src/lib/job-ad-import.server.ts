// Imports job ads from public lists (Agilefant public links) onto the job board.
//
// The feeds live in public.job_ad_feeds; the ads in public.imported_job_ads.
// Both were created directly on the backend project, so the generated types
// don't know them — the client is cast locally. A pg_cron job on the database
// calls /api/import-job-ads once a day, which runs importAllJobAdFeeds().
//
// An ad that drops off its list is marked removed (and leaves the board);
// one that comes back is shown again.

import { supabaseAdmin } from "@/integrations/supabase/app-admin.server";

interface FeedRow {
  id: string;
  url: string;
}

interface AgilefantItem {
  id: string;
  title: string | null;
  parentId: string | null;
  deadline: string | null;
  createdOn: string | null;
  links: { url: string; altText: string | null }[] | null;
}

export interface ParsedAd {
  source_key: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  deadline_date: string | null;
  posted_on: string | null;
}

export interface FeedResult {
  url: string;
  ok: boolean;
  count?: number;
  removed?: number;
  error?: string;
}

type Db = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const db = () => supabaseAdmin as unknown as Db;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  auml: "ä",
  Auml: "Ä",
  ouml: "ö",
  Ouml: "Ö",
  aring: "å",
  Aring: "Å",
  oslash: "ø",
  Oslash: "Ø",
  aelig: "æ",
  AElig: "Æ",
  uuml: "ü",
  Uuml: "Ü",
  eacute: "é",
  Eacute: "É",
  szlig: "ß",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

const clean = (s: string | null | undefined) =>
  decodeEntities(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * A list item reads "Company - Role (Location)", and its link's text
 * "Company - Role". The location is what the title adds in brackets after the
 * link text; the company is what comes before the first spaced dash.
 */
export function parseItem(item: AgilefantItem): ParsedAd | null {
  if (item.parentId) return null; // sub-items are notes, not ads
  const link = (item.links ?? []).find((l) => /^https?:\/\//i.test(l.url ?? ""));
  if (!link) return null;
  try {
    new URL(link.url);
  } catch {
    return null;
  }
  const full = clean(item.title);
  const alt = clean(link.altText);
  if (!full && !alt) return null;

  let base = full || alt;
  let location: string | null = null;
  if (alt && full.startsWith(alt)) {
    const rest = /^\s*\((.+)\)$/.exec(full.slice(alt.length));
    if (rest) {
      location = rest[1]!.trim();
      base = alt;
    }
  }

  const dash = /\s[-–—]\s/.exec(base);
  const company = dash ? base.slice(0, dash.index).trim() : null;
  const role = dash ? base.slice(dash.index + dash[0].length).trim() : base;

  return {
    source_key: item.id,
    title: (role || base).slice(0, 300),
    company: company ? company.slice(0, 200) : null,
    location: location ? location.slice(0, 200) : null,
    url: link.url.slice(0, 2000),
    deadline_date: isDate(item.deadline) ? item.deadline : null,
    posted_on: isDate(item.createdOn) ? item.createdOn : null,
  };
}

/** https://agilefant.org/p/<token> → the JSON the public page itself loads. */
export function feedApiUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  const m = /^\/p\/([A-Za-z0-9_-]{20,128})\/?$/.exec(u.pathname);
  if (!m) throw new Error("Not an Agilefant public list link");
  return `${u.origin}/api/public-list/${m[1]}`;
}

async function fetchItems(pageUrl: string): Promise<AgilefantItem[]> {
  const res = await fetch(feedApiUrl(pageUrl), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`List answered ${res.status}`);
  const body = (await res.json()) as { list?: { items?: AgilefantItem[] } | null };
  if (!body.list) throw new Error("The list is not published (link switched off?)");
  return body.list.items ?? [];
}

async function importFeed(feed: FeedRow): Promise<FeedResult> {
  const startedAt = new Date().toISOString();
  try {
    const items = await fetchItems(feed.url);
    const byKey = new Map<string, ParsedAd>();
    for (const item of items) {
      const ad = parseItem(item);
      if (ad) byKey.set(ad.source_key, ad);
    }
    const ads = [...byKey.values()];
    // An empty answer is more likely a fault than every job closing at once.
    if (ads.length === 0) throw new Error("The list had no job ads; nothing changed");

    for (let i = 0; i < ads.length; i += 500) {
      const rows = ads.slice(i, i + 500).map((a) => ({
        ...a,
        feed_id: feed.id,
        last_seen_at: startedAt,
        removed_at: null,
      }));
      const { error } = await db()
        .from("imported_job_ads")
        .upsert(rows, { onConflict: "feed_id,source_key" });
      if (error) throw new Error(error.message);
    }

    const { data: gone, error: goneError } = await db()
      .from("imported_job_ads")
      .update({ removed_at: startedAt })
      .eq("feed_id", feed.id)
      .is("removed_at", null)
      .lt("last_seen_at", startedAt)
      .select("id");
    if (goneError) throw new Error(goneError.message);

    await db()
      .from("job_ad_feeds")
      .update({
        last_run_at: startedAt,
        last_ok_at: startedAt,
        last_error: null,
        last_count: ads.length,
      })
      .eq("id", feed.id);
    return { url: feed.url, ok: true, count: ads.length, removed: (gone ?? []).length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db()
      .from("job_ad_feeds")
      .update({ last_run_at: startedAt, last_error: message.slice(0, 1000) })
      .eq("id", feed.id);
    return { url: feed.url, ok: false, error: message };
  }
}

export async function importAllJobAdFeeds(): Promise<FeedResult[]> {
  const { data, error } = await db().from("job_ad_feeds").select("id, url").eq("enabled", true);
  if (error) throw new Error(error.message);
  const results: FeedResult[] = [];
  for (const feed of (data ?? []) as FeedRow[]) results.push(await importFeed(feed));
  return results;
}

export async function isImportTokenValid(token: string): Promise<boolean> {
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc.call(supabaseAdmin, "check_job_ad_import_token", {
    _token: token,
  });
  return !error && data === true;
}
