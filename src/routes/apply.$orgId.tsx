import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SOURCES } from "@/lib/constants";
import { getApplyContext, submitApplication } from "@/lib/apply.functions";
import { ACCEPTED_FILE_TYPES, validateCandidateFile } from "@/lib/candidate-files";
import { CheckCircle2, Paperclip } from "lucide-react";

export const Route = createFileRoute("/apply/$orgId")({
  head: () => ({
    meta: [
      { title: "Apply for a role — Talently" },
      { name: "description", content: "Submit your application, CV and cover letter in a couple of minutes." },
      { property: "og:title", content: "Apply for a role" },
      { property: "og:description", content: "Submit your application, CV and cover letter in a couple of minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    req: typeof search['req'] === "string" ? (search['req'] as string) : undefined,
  }),
  component: ApplyPage,
});

async function toBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { name: file.name, type: file.type || "", data: btoa(binary) };
}

const inputCls = "w-full rounded-xl border border-input bg-white/70 px-3 py-2 text-sm";

function ApplyPage() {
  const { orgId } = Route.useParams();
  const { req } = Route.useSearch();
  const ctxFn = useServerFn(getApplyContext);
  const submitFn = useServerFn(submitApplication);

  const ctx = useQuery({
    queryKey: ["apply-context", orgId],
    queryFn: () => ctxFn({ data: { org_id: orgId } }),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reqId, setReqId] = useState(req ?? "");
  const [source, setSource] = useState<string>("Website");
  const [notes, setNotes] = useState("");
  const [cv, setCv] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const pickFile = (file: File | null, set: (f: File | null) => void) => {
    if (!file) return set(null);
    const err = validateCandidateFile(file);
    if (err) { toast.error(err); return; }
    set(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cv) { toast.error("Please attach your CV."); return; }
    setBusy(true);
    try {
      await submitFn({
        data: {
          org_id: orgId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          requisition_id: reqId || null,
          source: source as (typeof SOURCES)[number],
          notes: notes.trim(),
          cv: await toBase64(cv),
          cover_letter: cover ? await toBase64(cover) : null,
        },
      });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your application");
    } finally {
      setBusy(false);
    }
  };

  if (ctx.isLoading) {
    return <Wrapper><p className="text-sm text-muted-foreground">Loading…</p></Wrapper>;
  }
  if (!ctx.data?.org) {
    return (
      <Wrapper>
        <h1 className="font-display text-2xl font-bold">Application link not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please check the link with the person who sent it to you.</p>
      </Wrapper>
    );
  }

  if (done) {
    return (
      <Wrapper>
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-2xl font-bold">Application received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks {name.split(" ")[0] || "for applying"} — the {ctx.data.org.name} team will be in touch by email.
        </p>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Apply to {ctx.data.org.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tell us about yourself and attach your CV. It takes two minutes.</p>

      <form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Email">
          <input required type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Role">
          <select value={reqId} onChange={(e) => setReqId(e.target.value)} className={inputCls}>
            <option value="">General application</option>
            {ctx.data.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </Field>
        <Field label="How did you hear about us?">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Anything else we should know?">
            <textarea rows={4} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <FilePicker label="CV (required)" file={cv} onPick={(f) => pickFile(f, setCv)} />
        <FilePicker label="Cover letter (optional)" file={cover} onPick={(f) => pickFile(f, setCover)} />

        <div className="sm:col-span-2">
          <button disabled={busy} type="submit" className="btn-teal w-full rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            {busy ? "Submitting…" : "Submit application"}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">PDF, DOC or DOCX · up to 10 MB per file</p>
        </div>
      </form>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-12">
      <div className="glass rounded-2xl p-6 sm:p-8">{children}</div>
    </main>
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

function FilePicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <label className="glass flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/80">
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="truncate">{file ? file.name : "Choose file"}</span>
        <input
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
