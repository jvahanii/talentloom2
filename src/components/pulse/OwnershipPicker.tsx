import { useOrg } from "@/lib/org";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type Ownership = { allOrgs: boolean; orgIds: string[]; ownerEmails: string[]; invite: boolean; selected: boolean };

export const emptyOwnership = (): Ownership => ({ allOrgs: false, orgIds: [], ownerEmails: [], invite: false, selected: false });

export function parseEmails(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Payload sent to the server from the picker state. */
export function ownershipPayload(o: Ownership, emailText: string) {
  return {
    allOrgs: o.allOrgs,
    orgIds: !o.allOrgs && o.selected ? o.orgIds : [],
    ownerEmails: o.invite ? parseEmails(emailText) : [],
  };
}

function Check({ checked, onChange, disabled, label, hint }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string; hint?: string }) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "opacity-70" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function OwnershipPicker({ value, onChange, emailText, onEmailText }: { value: Ownership; onChange: (o: Ownership) => void; emailText: string; onEmailText: (t: string) => void }) {
  const { orgs } = useOrg();
  const set = (p: Partial<Ownership>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-2 rounded-2xl border-2 border-border p-3">
      <Label>Who owns it</Label>
      <Check checked disabled label="Just me" hint="You always own the surveys you create." />
      <Check checked={value.allOrgs} disabled={!orgs.length} onChange={(v) => set({ allOrgs: v })} label="All my organisations" />
      {!value.allOrgs && (
        <>
          <Check checked={value.selected} disabled={!orgs.length} onChange={(v) => set({ selected: v })} label="Selected organisations" />
          {value.selected && (
            <div className="ml-6 space-y-1">
              {orgs.map((o) => (
                <Check
                  key={o.org_id}
                  label={o.name}
                  checked={value.orgIds.includes(o.org_id)}
                  onChange={(v) => set({ orgIds: v ? [...value.orgIds, o.org_id] : value.orgIds.filter((x) => x !== o.org_id) })}
                />
              ))}
            </div>
          )}
        </>
      )}
      <Check checked={value.invite} onChange={(v) => set({ invite: v })} label="Invited users" hint="They can see and edit the survey after signing in with this email." />
      {value.invite && (
        <Textarea className="ml-6 w-[calc(100%-1.5rem)]" placeholder="anna@firm.com, ben@firm.com" value={emailText} onChange={(e) => onEmailText(e.target.value)} />
      )}
    </div>
  );
}

export function ownershipLabel(s: { all_orgs?: boolean; orgCount?: number; ownerCount?: number }) {
  const parts: string[] = [];
  if (s.all_orgs) parts.push("All my organisations");
  else if (s.orgCount) parts.push(`${s.orgCount} organisation${s.orgCount === 1 ? "" : "s"}`);
  if (s.ownerCount) parts.push(`${s.ownerCount} ${s.ownerCount === 1 ? "person" : "people"}`);
  return parts.length ? parts.join(" + ") : "Just me";
}
