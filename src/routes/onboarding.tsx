import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STAGES, type Stage } from "@/lib/constants";
import { ensureOrg } from "@/lib/org";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { ArrowLeft, ArrowRight, Check, LogOut, Upload, Sparkles, Download } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({ meta: [{ title: "Get started — TalentLoom" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: p } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (p?.onboarding_completed_at) throw redirect({ to: "/pipeline" });
    return { user: data.user };
  },
  component: Onboarding,
});

const JOB_TITLES = ["Recruiter", "Hiring Manager", "HR Ops", "Talent Lead", "Other"] as const;
const INDUSTRIES = [
  "Software/SaaS",
  "Financial Services",
  "Retail/E-commerce",
  "Healthcare",
  "Manufacturing",
  "Marketing/Advertising",
  "Professional Services",
  "Media/Entertainment",
  "Education",
  "Non-profit",
  "Other",
] as const;
const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"] as const;

const TEMPLATE = "name,email,phone,requisition_title,source,stage,notes\nJane Doe,jane@example.com,555-0100,Senior Frontend Engineer,LinkedIn,applied,\n";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = ""; let row: string[] = []; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type ProfileState = {
  full_name: string;
  job_title: string;
  job_title_other: string;
  company_name: string;
  company_industry: string;
  company_size: string;
  onboarding_step: number;
};

const EMPTY: ProfileState = {
  full_name: "",
  job_title: "",
  job_title_other: "",
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

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/auth" }); return; }
      setUid(u.user.id);
      // Accept a pending workspace invite, if the user arrived via one
      try {
        const token = window.sessionStorage.getItem(PENDING_INVITE_KEY);
        if (token) {
          const { data: joinedOrg, error } = await supabase.rpc("accept_invite", { _token: token });
          if (!error && joinedOrg) {
            window.sessionStorage.removeItem(PENDING_INVITE_KEY);
            window.localStorage.setItem("talently:current-org", joinedOrg as string);
            setOrgId(joinedOrg as string);
            toast.success("You joined the workspace");
          }
        }
      } catch {
        /* invite issues are non-fatal here */
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, job_title, job_title_other, company_name, company_industry, company_size, onboarding_step")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p) {
        setState({
          full_name: p.full_name ?? "",
          job_title: p.job_title ?? "",
          job_title_other: p.job_title_other ?? "",
          company_name: p.company_name ?? "",
          company_industry: p.company_industry ?? "",
          company_size: p.company_size ?? "",
          onboarding_step: p.onboarding_step ?? 1,
        });
        setStep(Math.min(Math.max(p.onboarding_step ?? 1, 1), 3));
      }
      setLoading(false);
    })();
  }, [navigate]);

  const persist = async (patch: Partial<ProfileState> & { onboarding_step?: number }) => {
    if (!uid) return;
    const next = { ...state, ...patch };
    setState(next);
    await supabase.from("profiles").upsert({ id: uid, ...next });
  };

  const step1Valid = state.full_name.trim().length > 0
    && state.job_title.length > 0
    && (state.job_title !== "Other" || state.job_title_other.trim().length > 0);
  const step2Valid = state.company_name.trim().length > 0
    && state.company_industry.length > 0
    && state.company_size.length > 0;

  const goNext = async () => {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    const next = step + 1;
    await persist({ onboarding_step: next });
    if (step === 2 && uid && !orgId) {
      // Create the workspace as soon as we know the company name
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
      const { error } = await supabase.from("profiles").upsert({
        id: uid,
        ...state,
        onboarding_step: 3,
        onboarding_completed_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("You're all set");
      navigate({ to: "/pipeline", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finish onboarding");
    } finally { setSaving(false); }
  };

  const skipStep3 = async () => complete({ seedSamples: false });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="font-display text-lg font-bold">TalentLoom</div>
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
              onChange={(patch) => setState({ ...state, ...patch })}
            />
          )}
          {step === 2 && (
            <Step2
              state={state}
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
  const items = ["Personal info", "Company info", "Bring in data"];
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
              <div className={"truncate text-xs font-medium " + (active ? "text-foreground" : "text-muted-foreground")}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

function Step1({ state, onChange }: { state: ProfileState; onChange: (patch: Partial<ProfileState>) => void }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Tell us about you</h1>
      <p className="mt-1 text-sm text-muted-foreground">A couple of quick details so we can personalise TalentLoom.</p>
      <div className="mt-6 space-y-4">
        <Field label="Full name">
          <input
            className={inputCls}
            value={state.full_name}
            onChange={(e) => onChange({ full_name: e.target.value })}
            placeholder="Alex Rivera"
            autoFocus
          />
        </Field>
        <Field label="Job title / role">
          <select
            className={inputCls}
            value={state.job_title}
            onChange={(e) => onChange({ job_title: e.target.value })}
          >
            <option value="">Select a role…</option>
            {JOB_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {state.job_title === "Other" && (
          <Field label="Your role">
            <input
              className={inputCls}
              value={state.job_title_other}
              onChange={(e) => onChange({ job_title_other: e.target.value })}
              placeholder="e.g. Head of People"
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function Step2({ state, onChange }: { state: ProfileState; onChange: (patch: Partial<ProfileState>) => void }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">About your company</h1>
      <p className="mt-1 text-sm text-muted-foreground">We'll tailor examples and defaults to match.</p>
      <div className="mt-6 space-y-4">
        <Field label="Company name">
          <input
            className={inputCls}
            value={state.company_name}
            onChange={(e) => onChange({ company_name: e.target.value })}
            placeholder="Acme Inc."
            autoFocus
          />
        </Field>
        <Field label="Industry">
          <select
            className={inputCls}
            value={state.company_industry}
            onChange={(e) => onChange({ company_industry: e.target.value })}
          >
            <option value="">Select an industry…</option>
            {INDUSTRIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Company size">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {COMPANY_SIZES.map((s) => {
              const active = state.company_size === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ company_size: s })}
                  className={
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "border-teal-500 bg-teal-500/10 text-foreground"
                      : "border-input bg-white/60 dark:bg-white/5 text-muted-foreground hover:text-foreground")
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </div>
  );
}

function Step3({
  orgId, onImport, onSeedSamples, onSkip, onBack, busy,
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
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("Workspace not ready yet — go back one step and continue again");
      const emailI = idx("email"), phoneI = idx("phone"), sourceI = idx("source"),
        stageI = idx("stage"), notesI = idx("notes"), reqI = idx("requisition_title");
      const inserts = rows.slice(1).map((r) => {
        const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
        const stageRaw = get(stageI).toLowerCase();
        const stage = (STAGES as readonly string[]).includes(stageRaw) ? (stageRaw as Stage) : "applied";
        return {
          user_id: u.user!.id,
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
      }).filter((r) => r.name && r.name !== "Unnamed" || r.email);
      if (inserts.length === 0) throw new Error("No valid rows found");

      // resolve requisition titles → ids if any exist
      const { data: reqs } = await supabase.from("requisitions").select("id,title").eq("org_id", orgId);
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
    } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "talentloom-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Bring in your data</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Import your candidates now, or explore with sample data — you can always import later.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-teal-600" />
            <h3 className="font-display font-semibold">Import candidates (CSV)</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Columns: name, email, phone, requisition_title, source, stage, notes.</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={downloadTemplate} className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-white/80">
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-white/70 dark:bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/80">
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </div>

          {file && <div className="mt-3 truncate text-xs text-muted-foreground">Selected: {file.name}</div>}

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
            <h3 className="font-display font-semibold">Explore with sample data</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We'll seed a few example positions and candidates so you can click around. You can clear them from Settings anytime.
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
