import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { supabase } from "@/integrations/supabase/app-client";

export type OrgRole = "owner" | "admin" | "member";

export const PERMISSIONS = [
  "view_candidates",
  "edit_candidates",
  "delete_candidates",
  "view_positions",
  "edit_positions",
  "delete_positions",
  "invite_users",
  "change_titles",
  "remove_users",
  "export",
  "import",
  "use_ai",
  "rename_org",
  "manage_titles",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: "Candidates",
    items: [
      { key: "view_candidates", label: "View candidates" },
      { key: "edit_candidates", label: "Create / edit candidates" },
      { key: "delete_candidates", label: "Delete candidates" },
    ],
  },
  {
    label: "Positions",
    items: [
      { key: "view_positions", label: "View positions" },
      { key: "edit_positions", label: "Create / edit positions" },
      { key: "delete_positions", label: "Delete positions" },
    ],
  },
  {
    label: "People & invites",
    items: [
      { key: "invite_users", label: "Invite users" },
      { key: "change_titles", label: "Change titles" },
      { key: "remove_users", label: "Remove users" },
    ],
  },
  {
    label: "Data & settings",
    items: [
      { key: "export", label: "Export data" },
      { key: "import", label: "Import data" },
      { key: "use_ai", label: "Use AI copilot" },
      { key: "rename_org", label: "Rename organisation" },
      { key: "manage_titles", label: "Manage titles" },
    ],
  },
];

export const permColumn = (p: Permission) => `can_${p}` as const;

export type TitlePermissions = Record<Permission, boolean>;

export interface OrgTitle extends TitlePermissions {
  id: string;
  org_id: string;
  name: string;
  is_system: boolean;
  sort_order: number;
}

export interface OrgMembership {
  org_id: string;
  role: OrgRole;
  name: string;
  title_id: string | null;
  title_name: string | null;
  permissions: TitlePermissions;
  /** A superuser's access to an organisation they aren't a member of. */
  viaSuperuser?: boolean;
}

const STORAGE_KEY = "talently:current-org";

const EMPTY_PERMS = Object.fromEntries(PERMISSIONS.map((p) => [p, false])) as TitlePermissions;

function toPermissions(row: Record<string, unknown> | null | undefined): TitlePermissions {
  if (!row) return EMPTY_PERMS;
  return Object.fromEntries(
    PERMISSIONS.map((p) => [p, Boolean(row[permColumn(p)])]),
  ) as TitlePermissions;
}

type MemberRow = {
  org_id: string;
  role: OrgRole;
  title_id: string | null;
  organizations: { name: string } | null;
  organization_titles: (Record<string, unknown> & { name: string }) | null;
};

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
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, title_id, organizations(name), organization_titles(*)")
    .eq("user_id", uid as string);
  if (error) throw error;
  const memberships: OrgMembership[] = ((data ?? []) as unknown as MemberRow[]).map((m) => ({
    org_id: m.org_id,
    role: m.role,
    name: m.organizations?.name ?? "Organisation",
    title_id: m.title_id,
    title_name: m.organization_titles?.name ?? null,
    permissions: toPermissions(m.organization_titles),
  }));

  // Superusers work in every organisation with every permission. The database
  // enforces this; here the organisations are only listed. A missing or failing
  // check simply means "not a superuser".
  const { data: superuser } = await (
    supabase.rpc as unknown as (fn: string) => Promise<{ data: boolean | null; error: unknown }>
  )("is_superuser");
  if (superuser !== true) return memberships;
  const ALL_PERMS = Object.fromEntries(PERMISSIONS.map((p) => [p, true])) as TitlePermissions;
  const { data: allOrgs } = await supabase.from("organizations").select("id, name").order("name");
  const mine = new Set(memberships.map((m) => m.org_id));
  return [
    ...memberships.map((m) => ({ ...m, permissions: ALL_PERMS })),
    ...((allOrgs ?? []) as { id: string; name: string }[])
      .filter((o) => !mine.has(o.id))
      .map((o) => ({
        org_id: o.id,
        role: "owner" as OrgRole,
        name: o.name,
        title_id: null,
        title_name: "Owner",
        permissions: ALL_PERMS,
        viaSuperuser: true,
      })),
  ];
}

/** Organisation roles a recruiter can pick for themselves when creating an account. */
export const ACCOUNT_ROLES = ["Owner", "Admin", "Member"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/**
 * Applies a role chosen at account creation to the current user's membership of
 * the freshly created org. `create_organization` always seeds the creator as
 * Owner, so we switch the membership title afterwards when a different role was
 * picked. Choosing Owner needs no change.
 */
export async function applyAccountRole(orgId: string, roleName: AccountRole): Promise<void> {
  if (roleName === "Owner") return;
  const { data: uid, error: uidError } = await (
    supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: unknown }>
  )("current_profile_id");
  if (uidError || !uid) return;
  const { data: title, error: titleError } = await supabase
    .from("organization_titles")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", roleName)
    .maybeSingle();
  if (titleError || !title?.id) return;
  await supabase
    .from("organization_members")
    .update({ title_id: title.id, role: roleName.toLowerCase() as OrgRole })
    .eq("org_id", orgId)
    .eq("user_id", uid as string);
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
  permissions: TitlePermissions;
  can: (p: Permission) => boolean;
  loading: boolean;
  /** Memberships loaded successfully (false while loading or after an error). */
  loaded: boolean;
  setOrgId: (id: string) => void;
  refresh: () => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  orgId: null,
  role: null,
  title: null,
  permissions: EMPTY_PERMS,
  can: () => false,
  loading: true,
  loaded: false,
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
  const current = orgs.find((o) => o.org_id === selected) ?? orgs[0] ?? null;
  const permissions = current?.permissions ?? EMPTY_PERMS;

  const setOrgId = (id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setSelected(id);
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
        permissions,
        can: (p: Permission) => permissions[p],
        loading: q.isLoading,
        loaded: q.isSuccess,
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
