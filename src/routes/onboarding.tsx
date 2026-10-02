import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { clerkSignOut, hasClerkSession } from "@/lib/clerk";
import { getMyProfileId } from "@/lib/auth";
import { toast } from "sonner";
import { STAGES, type Stage } from "@/lib/constants";
import { ensureOrg } from "@/lib/org";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { ArrowLeft, ArrowRight, Check, LogOut, Upload, Sparkles, Download } from "lucide-react";
import { RequiredIndicator } from "@/components/ui/label";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({ meta: [{ title: "Get started — Talentloom" }] }),
  beforeLoad: async () => {
    if (!(await hasClerkSession())) throw redirect({ to: "/auth" });
    const uid = await getMyProfileId();
    if (!uid) throw redirect({ to: "/auth" });
    const { data: p } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", uid)
      .maybeSingle();
    if (p?.onboarding_completed_at) throw redirect({ to: "/pipeline" });
    return {};
  },
  component: Onboarding,
});

type AccountType = "recruiter" | "candidate";

export const ACCOUNT_TYPE_KEY = "talently:onboarding-account-type";
/** Set when someone signs up through "Create organisation": onboarding opens on naming it. */
export const CREATE_ORG_INTENT_KEY = "talently:onboarding-create-org";
const ACCOUNT_ROLE_KEY = "talently:onboarding-account-role";

const TEMPLATE =
  "name,email,phone,requisition_title,source,stage,notes\nJane Doe,jane@example.com,555-0100,Senior Frontend Engineer,LinkedIn,applied,\n";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        /* skip */
      } else cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type ProfileState = {
  full_name: string;
  company_name: string;
  company_industry: string;
  company_size: string;
  onboarding_step: number;
};

const EMPTY: ProfileState = {
  full_name: "",
  company_name: "",
  company_industry: "",
  company_size: "",
  onboarding_step: 1,
};

function Onboarding() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [state, setState] = useState<ProfileState>(EMPTY);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // People who skip step 1 give their name alongside the organisation name.
  const [askNameInStep2, setAskNameInStep2] = useState(false);
  const [accountType, setAccountType] = useState<AccountType | "">(() => {
    try {
      const stored = window.localStorage.getItem(ACCOUNT_TYPE_KEY);
      return stored === "recruiter" || stored === "candidate" ? stored : "";
    } catch {
      return "";
    }
  });

  const chooseAccountType = (type: AccountType) => {
    setAccountType(type);
    try {
      window.localStorage.setItem(ACCOUNT_TYPE_KEY, type);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    (async () => {
      const uid = await getMyProfileId();
      if (!uid) {
        navigate({ to: "/auth" });
        return;
      }
      setUid(uid);
      let joinedViaInvite = false;
      // Accept a pending workspace invite, if the user arrived via one
      try {
        const token = window.sessionStorage.getItem(PENDING_INVITE_KEY);
        if (token) {
          const { data: joinedOrg, error } = await supabase.rpc("accept_invite", { _token: token });
          if (!error && joinedOrg) {
            window.sessionStorage.removeItem(PENDING_INVITE_KEY);
            window.localStorage.setItem("talently:current-org", joinedOrg as string);
            setOrgId(joinedOrg as string);
            joinedViaInvite = true;
            toast.success("You joined the organisation");
          }
        }
      } catch {
        /* invite issues are non-fatal here */
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, company_name, company_industry, company_size, onboarding_step")
        .eq("id", uid)
        .maybeSingle();
      if (p) {
        setState({
          full_name: p.full_name ?? "",
          company_name: p.company_name ?? "",
          company_industry: p.company_industry ?? "",
          company_size: p.company_size ?? "",
          onboarding_step: p.onboarding_step ?? 1,
        });
        let startStep = Math.min(Math.max(p.onboarding_step ?? 1, 1), 3);
        let createOrgIntent = false;
        try {
          createOrgIntent = window.localStorage.getItem(CREATE_ORG_INTENT_KEY) === "1";
        } catch {
          /* ignore */
        }
        // Signed up through "Create organisation": go straight to naming it.
        if (createOrgIntent && startStep === 1 && !joinedViaInvite) {
          chooseAccountType("recruiter");
          startStep = 2;
          setAskNameInStep2(!(p.full_name ?? "").trim());
        }
        setStep(startStep);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const persist = async (patch: Partial<ProfileState> & { onboarding_step?: number }) => {
    if (!uid) return;
    const next = { ...state, ...patch };
    setState(next);
    await supabase.from("profiles").update(next).eq("id", uid);
  };

  const step1Valid = state.full_name.trim().length > 0 && accountType !== "";
  const step2Valid =
    state.company_name.trim().length > 0 && (!askNameInStep2 || state.full_name.trim().length > 0);

  const goNext = async () => {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    if (step === 1 && accountType === "candidate") {
      // Candidates don't need a hiring workspace — send them to their portal.
      navigate({ to: "/candidate/applications" });
      return;
    }
    // Someone who joined through an invite already has an organisation, so
    // they skip naming one.
    const next = step === 1 && orgId ? 3 : step + 1;
    await persist({ onboarding_step: next });
    if (step === 2 && uid && !orgId) {
      // Create the organisation as soon as we know its name; the creator is its Owner.
      const id = await ensureOrg(uid, state.company_name);
      setOrgId(id);
    }
    setStep(next);
  };
  const goBack = async () => {
    const prev = Math.max(1, step - 1);
    await persist({ onboarding_step: prev });
    setStep(prev);
  };

  const complete = async (opts: { seedSamples: boolean }) => {
    if (!uid) return;
    setSaving(true);
    try {
      const org = orgId ?? (await ensureOrg(uid, state.company_name));
      setOrgId(org);
      if (opts.seedSamples) {
        const { error } = await supabase.rpc("seed_sample_data");
        if (error) throw error;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          ...state,
          onboarding_step: 3,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", uid);
      if (error) throw error;
      try {
        window.localStorage.removeItem(ACCOUNT_TYPE_KEY);
        window.localStorage.removeItem(ACCOUNT_ROLE_KEY);
        window.localStorage.removeItem(CREATE_ORG_INTENT_KEY);
      } catch {
        /* ignore */
      }
      toast.success("You're all set");
      navigate({ to: "/pipeline", replace: true });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: unknown }).message)
            : "Failed to finish onboarding";
      console.error("[onboarding] finish failed:", e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const skipStep3 = async () => complete({ seedSamples: false });

  const signOut = async () => {
    await clerkSignOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="font-display text-lg font-bold">Talentloom</div>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Exit
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <Progress step={step} />

        <div className="glass-strong mt-6 rounded-3xl p-6 sm:p-8">
          {step === 1 && (
            <Step1
              state={state}
              accountType={accountType}
              onAccountType={chooseAccountType}
              onChange={(patch) => setState({ ...state, ...patch })}
            />
          )}
          {step === 2 && (
            <Step2
              state={state}
              askName={askNameInStep2}
              onChange={(patch) => setState({ ...state, ...patch })}
            />
          )}
          {step === 3 && (
            <Step3
              orgId={orgId}
              onImport={async (count) => {
                toast.success(`Imported ${count} candidates`);
                await complete({ seedSamples: false });
              }}
              onSeedSamples={() => complete({ seedSamples: true })}
              onSkip={skipStep3}
              onBack={goBack}
              busy={saving}
            />
          )}

          {step < 3 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={goBack}
                disabled={step === 1}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={goNext}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                  className="btn-teal inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can update these details anytime in Settings.
        </p>
      </main>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  const items = ["Account type", "Organisation", "Bring in data"];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold " +
                (done
                  ? "bg-teal-600 text-white"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
              }
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <div className="min-w-0">
              <div
                className={
                  "truncate text-xs font-medium " +
                  (active ? "text-foreground" : "text-muted-foreground")
                }
              >
                Step {n}
              </div>
              <div className="hidden truncate text-xs text-muted-foreground sm:block">{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <RequiredIndicator />}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

function Step1({
  state,
  accountType,
  onAccountType,
  onChange,
}: {
  state: ProfileState;
  accountType: AccountType | "";
  onAccountType: (type: AccountType) => void;
  onChange: (patch: Partial<ProfileState>) => void;
}) {
  const options: { value: AccountType; title: string; description: string }[] = [
    {
      value: "recruiter",
      title: "Recruiter",
      description: "Manage positions, candidates and your team.",
    },
    {
      value: "candidate",
      title: "Candidate",
      description: "Browse roles and keep track of your applications.",
    },
  ];
  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Let’s make this yours</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A couple of quick details so we can personalise Talentloom.
      </p>
      <div className="mt-6 space-y-4">
        <Field label="Full name" required>
          <input
            className={inputCls}
            value={state.full_name}
            onChange={(e) => onChange({ full_name: e.target.value })}
            placeholder="Alex Rivera"
            autoFocus
          />
        </Field>
        <Field label="How will you use Talentloom?" required>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
              const active = accountType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onAccountType(option.value)}
                  className={
                    "rounded-xl border p-4 text-left transition-colors " +
                    (active
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-input bg-white/60 dark:bg-white/5 hover:bg-white/80")
                  }
                >
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </div>
  );
}

function Step2({
  state,
  askName,
  onChange,
}: {
  state: ProfileState;
  askName: boolean;
  onChange: (patch: Partial<ProfileState>) => void;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Name your organisation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your candidates, positions and team live here. You'll be its owner.
      </p>
      <div className="mt-6 space-y-4">
        <Field label="Organisation name" required>
          <input
            className={inputCls}
            value={state.company_name}
            onChange={(e) => onChange({ company_name: e.target.value })}
            placeholder="Acme Inc."
            autoFocus
          />
        </Field>
        {askName && (
          <Field label="Your name" required>
            <input
              className={inputCls}
              value={state.full_name}
              onChange={(e) => onChange({ full_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function Step3({
  orgId,
  onImport,
  onSeedSamples,
  onSkip,
  onBack,
  busy,
}: {
  orgId: string | null;
  onImport: (count: number) => Promise<void>;
  onSeedSamples: () => Promise<void>;
  onSkip: () => Promise<void>;
  onBack: () => Promise<void>;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);

  const headers = useMemo(() => preview?.[0]?.map((h) => h.trim().toLowerCase()) ?? [], [preview]);

  const onFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    setPreview(parseCSV(text).slice(0, 6));
  };

  const doImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const idx = (name: string) => headers.indexOf(name);
      const nameI = idx("name");
      if (nameI < 0) throw new Error("CSV needs a 'name' column");
      const uid = await getMyProfileId();
      if (!uid) throw new Error("Not authenticated");
      if (!orgId)
        throw new Error("Organisation not ready yet — go back one step and continue again");
      const emailI = idx("email"),
        phoneI = idx("phone"),
        sourceI = idx("source"),
        stageI = idx("stage"),
        notesI = idx("notes"),
        reqI = idx("requisition_title");
      const inserts = rows
        .slice(1)
        .map((r) => {
          const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
          const stageRaw = get(stageI).toLowerCase();
          const stage = (STAGES as readonly string[]).includes(stageRaw)
            ? (stageRaw as Stage)
            : "applied";
          return {
            user_id: uid,
            org_id: orgId,
            name: get(nameI) || "Unnamed",
            email: get(emailI) || null,
            phone: get(phoneI) || null,
            source: get(sourceI) || null,
            notes: get(notesI) || null,
            stage,
            // requisition_title lookup skipped in onboarding; user can link later
            _req: get(reqI),
          };
        })
        .filter((r) => (r.name && r.name !== "Unnamed") || r.email);
      if (inserts.length === 0) throw new Error("No valid rows found");

      // resolve requisition titles → ids if any exist
      const { data: reqs } = await supabase
        .from("requisitions")
        .select("id,title")
        .eq("org_id", orgId);
      const reqByTitle = new Map((reqs ?? []).map((r) => [r.title.toLowerCase(), r.id]));
      const payload = inserts.map(({ _req, ...rest }) => ({
        ...rest,
        requisition_id: _req ? (reqByTitle.get(_req.toLowerCase()) ?? null) : null,
      }));
      const { error } = await supabase.from("candidates").insert(payload);
      if (error) throw error;
      await onImport(payload.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "talentloom-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Ready to get hiring?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bring in your candidates now, or take a quick tour with sample data. You can change
        everything later.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-teal-600" />
            <h3 className="font-display font-semibold">Bring in candidates (CSV)</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Columns: name, email, phone, requisition_title, source, stage, notes.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={downloadTemplate}
              className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white/80"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/80">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          </div>

          {file && (
            <div className="mt-3 truncate text-xs text-muted-foreground">Selected: {file.name}</div>
          )}

          <button
            onClick={doImport}
            disabled={!file || importing || busy}
            className="btn-teal mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import & finish"}
          </button>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-600" />
            <h3 className="font-display font-semibold">Take a test drive</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We'll seed a few example positions and candidates so you can click around. You can clear
            them from Settings anytime.
          </p>
          <button
            onClick={onSeedSamples}
            disabled={busy || importing}
            className="mt-4 w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/80 disabled:opacity-50"
          >
            {busy ? "Setting up…" : "Use sample data"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={onSkip}
          disabled={busy || importing}
          className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
