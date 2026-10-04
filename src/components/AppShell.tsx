import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  KanbanSquare,
  Users,
  Briefcase,
  Settings,
  BarChart3,
  Download,
  Upload,
  LogOut,
  Building2,
  Plus,
  Activity,
  UserRound,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { clerkSignOut } from "@/lib/clerk";
import { useSession, type AppUser } from "@/lib/auth";
import { ACCOUNT_ROLES, OrgProvider, applyAccountRole, useOrg, type AccountRole } from "@/lib/org";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// `org: true` items only make sense inside an organisation.
const NAV = [
  { to: "/pipeline", label: "Candidate flow", icon: KanbanSquare, org: true },
  { to: "/candidates", label: "Candidates", icon: Users, org: true },
  { to: "/requisitions", label: "Positions", icon: Briefcase, org: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, org: true },
  { to: "/surveys", label: "My surveys", icon: Activity, org: false },
  { to: "/import", label: "Import", icon: Upload, org: true },
  { to: "/export", label: "Export", icon: Download, org: true },
  { to: "/settings", label: "Settings", icon: Settings, org: false },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { orgs, loaded } = useOrg();
  const noOrganisation = loaded && orgs.length === 0;
  const items = noOrganisation ? NAV.filter((item) => !item.org) : NAV;
  return (
    <nav className="flex flex-col gap-1">
      {noOrganisation && (
        // /pipeline shows onboarding or the create-organisation screen, as fits.
        <Link
          to="/pipeline"
          onClick={onNavigate}
          className="mb-1 flex items-center gap-2.5 rounded-lg border border-dashed border-primary/50 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
          Create organisation
        </Link>
      )}
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavUser({ user, fullName }: { user: AppUser | null; fullName?: string | null }) {
  if (!user) return null;
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border px-2 pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {fullName || user.user_metadata?.full_name || user.email || "Account"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
      </div>
    </div>
  );
}

/** Always in the top-right corner of the header. */
function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await clerkSignOut();
        navigate({ to: "/auth" });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      title="Sign out"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

function OrgSwitcher() {
  const navigate = useNavigate();
  const { orgs, orgId, setOrgId, refresh } = useOrg();
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [accountType, setAccountType] = useState<"recruiter" | "candidate" | "">("");
  const [companyName, setCompanyName] = useState("");
  const [accountRole, setAccountRole] = useState<AccountRole>("Owner");

  const resetDialog = () => {
    setStep(1);
    setAccountType("");
    setCompanyName("");
    setAccountRole("Owner");
  };

  const handleChange = (value: string) => {
    if (value === "__new__") {
      resetDialog();
      setCreateDialogOpen(true);
      return;
    }
    setOrgId(value);
  };

  const handleOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) resetDialog();
  };

  const continueFromAccountType = () => {
    if (accountType === "candidate") {
      setCreateDialogOpen(false);
      resetDialog();
      navigate({ to: "/candidate/applications" });
      return;
    }
    if (accountType === "recruiter") setStep(2);
  };

  if (!orgId) return null;

  return (
    <>
      <Select value={orgId} onValueChange={handleChange}>
        <SelectTrigger
          disabled={creating}
          className="h-8 w-auto max-w-44 gap-1.5 border-border/70 bg-secondary/60 text-xs font-medium"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Choose organisation" />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.org_id} value={o.org_id}>
              {o.name}
            </SelectItem>
          ))}
          <SelectItem value="__new__">
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create account
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <Dialog open={createDialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const name = companyName.trim();
              if (!name) return;
              setCreating(true);
              try {
                const { data: newId, error } = await supabase.rpc("create_organization", {
                  _name: name,
                });
                if (error) throw error;
                await applyAccountRole(newId as string, accountRole);
                refresh();
                setOrgId(newId as string);
                setCreateDialogOpen(false);
                resetDialog();
                toast.success(`Account "${name}" created`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create account");
              } finally {
                setCreating(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Create account</DialogTitle>
              <DialogDescription>
                {step === 1
                  ? "How will you use Talentloom?"
                  : "Tell us about your company to finish setting up your account."}
              </DialogDescription>
            </DialogHeader>

            {step === 1 ? (
              <div className="space-y-3 py-2">
                {[
                  {
                    value: "recruiter" as const,
                    icon: Briefcase,
                    title: "Recruiter",
                    description: "Manage positions, candidates and your team.",
                  },
                  {
                    value: "candidate" as const,
                    icon: UserRound,
                    title: "Candidate",
                    description: "Browse roles and keep track of your applications.",
                  },
                ].map((option) => {
                  const active = accountType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAccountType(option.value)}
                      disabled={creating}
                      className={
                        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition " +
                        (active
                          ? "border-primary bg-primary/10"
                          : "border-input hover:bg-secondary/60")
                      }
                    >
                      <option.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {option.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="company-name" required>
                    Company name
                  </Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="e.g. Acme Inc."
                    autoFocus
                    disabled={creating}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-role" required>
                    Account role
                  </Label>
                  <Select
                    value={accountRole}
                    onValueChange={(value) => setAccountRole(value as AccountRole)}
                    disabled={creating}
                  >
                    <SelectTrigger id="account-role">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              {step === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="button" disabled={!accountType} onClick={continueFromAccountType}>
                    Continue
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={creating}>
                    Back
                  </Button>
                  <Button type="submit" disabled={creating || !companyName.trim()}>
                    {creating ? "Setting it up…" : "Create account"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Shown to signed-in recruiters who belong to no organisation (e.g. theirs was deleted). */
function NoOrganisation() {
  const { setOrgId, refresh } = useOrg();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border-2 border-border bg-card p-6 shadow-[0_4px_0_var(--brand-mint)]">
      <Building2 className="h-6 w-6 text-primary" />
      <h1 className="mt-2 text-xl font-bold">You're not in an organisation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Candidates, positions and the candidate flow live inside an organisation. Create your own,
        or join a team through an invite link from one of its owners or admins.
      </p>
      <form
        className="mt-5 space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setCreating(true);
          try {
            const { data: newId, error } = await supabase.rpc("create_organization", {
              _name: trimmed,
            });
            if (error) throw error;
            refresh();
            setOrgId(newId as string);
            toast.success(`"${trimmed}" created`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create the organisation");
          } finally {
            setCreating(false);
          }
        }}
      >
        <Label htmlFor="new-org-name" required>
          Organisation name
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="new-org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Acme Inc."
            className="min-w-52 flex-1"
            disabled={creating}
            required
          />
          <Button type="submit" disabled={creating || !name.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            {creating ? "Creating…" : "Create organisation"}
          </Button>
        </div>
      </form>
      <p className="mt-5 text-xs text-muted-foreground">
        Joining a team? Ask an owner or admin to invite you, then open the link from the invite.
        Pulse surveys work without an organisation. Looking for jobs instead?{" "}
        <Link to="/candidate/applications" className="font-medium text-primary hover:underline">
          Go to my applications
        </Link>
        .
      </p>
    </div>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { orgs, loaded } = useOrg();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Pulse surveys can be personal, so they stay usable without an organisation.
  const noOrganisation = loaded && orgs.length === 0 && !pathname.startsWith("/surveys");
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user!.id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-card p-4 md:flex">
        <Link to="/pipeline" className="mb-6 flex items-center gap-2 px-2">
          <KanbanSquare className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">Talentloom</span>
        </Link>
        <NavLinks />
        <NavUser user={user} fullName={profile?.full_name} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-56 flex-col border-r border-border bg-card p-4">
            <Link
              to="/pipeline"
              className="mb-6 flex items-center gap-2 px-2"
              onClick={() => setMobileOpen(false)}
            >
              <KanbanSquare className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold tracking-tight">Talentloom</span>
            </Link>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <NavUser user={user} fullName={profile?.full_name} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col md:ml-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur md:px-4">
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <KanbanSquare className="h-5 w-5 text-primary" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-2 py-1 shadow-[0_2px_0_var(--brand-mint)]">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary/15 text-[11px] font-bold text-primary">
                  {(profile?.full_name || user.user_metadata?.full_name || user.email || "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <span
                  className="hidden max-w-44 truncate text-xs font-medium sm:inline"
                  title={user.email ?? undefined}
                >
                  {profile?.full_name || user.user_metadata?.full_name || user.email}
                </span>
              </div>
            )}
            <OrgSwitcher />
            {user && <SignOutButton />}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{noOrganisation ? <NoOrganisation /> : children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <ShellInner>{children}</ShellInner>
    </OrgProvider>
  );
}
