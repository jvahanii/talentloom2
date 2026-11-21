import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { supabase } from "@/integrations/supabase/app-client";

/**
 * Everyone in an organisation can see and edit everything in it. Its creator is
 * its Owner and everyone else an Admin; the two differ in name only.
 */
export type OrgRole = "owner" | "admin";

export interface OrgMembership {
  org_id: string;
  role: OrgRole;
  name: string;
  title_id: string | null;
  title_name: string | null;
  /** A superuser's access to an organisation they aren't a member of. */
  viaSuperuser?: boolean;
}

const STORAGE_KEY = "talently:current-org";

type MemberRow = {
  org_id: string;
  role: OrgRole;
  title_id: string | null;
  organizations: { name: string } | null;
  organization_titles: { name: string } | null;
};

/** Remembers the organisation last used, on the person's profile (all devices). */
async function saveLastOrg(orgId: string) {
  const { data: uid } = await (
    supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: unknown }>
  )("current_profile_id");
  if (!uid) return;
  await (supabase.from("profiles") as any).update({ last_org_id: orgId }).eq("id", uid);
}

async function fetchLastOrg(uid: string): Promise<string | null> {
  const { data } = await (supabase.from("profiles") as any)
    .select("last_org_id")
    .eq("id", uid)
    .maybeSingle();
  return (data?.last_org_id as string | null) ?? null;
}

let lastOrgFromProfile: string | null = null;

async function fetchMemberships(signedIn: boolean): Promise<OrgMembership[]> {
  const { data: uid, error: uidError } = await (
    supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: unknown }>
  )("current_profile_id");
  if (uidError || !uid) {
    // A signed-in user with no profile id means the request ran without a valid
    // session token (e.g. right after OAuth sign-in). Fail the query so React
    // Query shows loading and retries, instead of caching an empty org list
    // that leaves every org-scoped page (pipeline, candidates, …) empty until
    // a manual refresh.
    if (signedIn) throw new Error("Could not load your organisation membership yet");
    return [];
  }
  const [{ data, error }, lastOrg] = await Promise.all([
    supabase
      .from("organization_members")
      .select("org_id, role, title_id, organizations(name), organization_titles(name)")
      .eq("user_id", uid as string),
    fetchLastOrg(uid as string).catch(() => null),
  ]);
  lastOrgFromProfile = lastOrg;
  if (error) throw error;
  const memberships: OrgMembership[] = ((data ?? []) as unknown as MemberRow[]).map((m) => ({
    org_id: m.org_id,
    role: m.role,
    name: m.organizations?.name ?? "Organisation",
    title_id: m.title_id,
    title_name: m.organization_titles?.name ?? null,
  }));

  // Superusers work in every organisation, also those they aren't a member of.
  // The database enforces this; here the organisations are only listed. A missing or failing
  // check simply means "not a superuser".
  const { data: superuser } = await (
    supabase.rpc as unknown as (fn: string) => Promise<{ data: boolean | null; error: unknown }>
  )("is_superuser");
  if (superuser !== true) return memberships;
  const { data: allOrgs } = await supabase.from("organizations").select("id, name").order("name");
  const mine = new Set(memberships.map((m) => m.org_id));
  return [
    ...memberships,
    ...((allOrgs ?? []) as { id: string; name: string }[])
      .filter((o) => !mine.has(o.id))
      .map((o) => ({
        org_id: o.id,
        role: "owner" as OrgRole,
        name: o.name,
        title_id: null,
        title_name: "Owner",
        viaSuperuser: true,
      })),
  ];
}

/** Returns the user's first org id, creating a personal org when none exists. */
export async function ensureOrg(userId: string, name?: string): Promise<string> {
  const { data: m } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (m?.org_id) return m.org_id;
  const { data, error } = await supabase.rpc("create_organization", {
    _name: name?.trim() || "My organisation",
  });
  if (error) throw error;
  return data as string;
}

interface OrgContextValue {
  orgs: OrgMembership[];
  orgId: string | null;
  role: OrgRole | null;
  title: string | null;
  loading: boolean;
  /** Memberships loaded successfully (false while loading or after an error). */
  loaded: boolean;
  /**
   * True right after sign-in when the person belongs to several organisations
   * and none is remembered yet (no choice in this browser, none saved on the
   * profile). The app then asks them to pick one.
   */
  needsOrgChoice: boolean;
  setOrgId: (id: string) => void;
  refresh: () => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  orgId: null,
  role: null,
  title: null,
  loading: true,
  loaded: false,
  needsOrgChoice: false,
  setOrgId: () => {},
  refresh: () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = Boolean(isLoaded && isSignedIn);
  const q = useQuery({
    queryKey: ["org-memberships", signedIn],
    queryFn: () => fetchMemberships(signedIn),
    retry: signedIn ? 3 : false,
  });
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const orgs = q.data ?? [];
  // Priority: this browser's choice → last used (saved on profile) → own
  // membership (only one = that one) → anything listed.
  const current =
    orgs.find((o) => o.org_id === lastOrgFromProfile) ??
    orgs.find((o) => o.org_id === selected) ??
    orgs.find((o) => !o.viaSuperuser) ??
    orgs[0] ??
    null;

  // Ask the person to choose an organisation when they have several of their
  // own and nothing remembers a previous choice (this browser or the profile).
  const ownOrgs = orgs.filter((o) => !o.viaSuperuser);
  // Only the choice saved on the profile counts; an old choice left in this
  // browser must not hide the picker.
  const hasRemembered =
    (lastOrgFromProfile != null && orgs.some((o) => o.org_id === lastOrgFromProfile));
  const needsOrgChoice = signedIn && q.isSuccess && !hasRemembered && ownOrgs.length >= 2;

  const setOrgId = (id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    lastOrgFromProfile = id;
    setSelected(id);
    void saveLastOrg(id).catch(() => {});
    qc.invalidateQueries();
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-memberships"] });
  };

  return (
    <OrgContext.Provider
      value={{
        orgs,
        orgId: current?.org_id ?? null,
        role: current?.role ?? null,
        title: current?.title_name ?? null,
        loading: q.isLoading,
        loaded: q.isSuccess,
        needsOrgChoice,
        setOrgId,
        refresh,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
