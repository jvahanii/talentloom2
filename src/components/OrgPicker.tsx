import { Building2 } from "lucide-react";
import { useOrg } from "@/lib/org";

/**
 * Full-screen chooser shown right after sign-in when the person belongs to
 * several organisations and none is remembered yet. Picking one saves it as
 * the last-used organisation, so the next sign-in goes straight there.
 */
export function OrgPicker() {
  const { orgs, setOrgId } = useOrg();
  const ownOrgs = orgs.filter((o) => !o.viaSuperuser);
  if (ownOrgs.length < 2) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 shadow-[0_6px_0_var(--brand-mint)]">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Choose your organisation</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          You belong to several organisations. Which one do you want to open? We remember your
          choice, so next time you sign in you land straight there.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {ownOrgs.map((o) => (
            <button
              key={o.org_id}
              type="button"
              onClick={() => setOrgId(o.org_id)}
              className="flex items-center gap-3 rounded-xl border-2 border-border bg-background px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5 hover:shadow-[0_3px_0_var(--brand-mint)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-primary/60 bg-primary/10 text-sm font-bold text-primary">
                {o.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{o.name}</span>
                {o.title_name && (
                  <span className="block text-xs text-muted-foreground">{o.title_name}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
