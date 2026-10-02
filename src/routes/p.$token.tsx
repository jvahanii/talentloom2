import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicPulseForm, submitPublicPulse } from "@/lib/pulse.functions";
import { AnswerForm } from "@/components/pulse/AnswerForm";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$token")({
  head: () => ({
    meta: [
      { title: "Answer a survey — Talentloom Pulse" },
      { name: "description", content: "Share your answers in a short Talentloom Pulse survey." },
      { property: "og:title", content: "Answer a survey — Talentloom Pulse" },
      {
        property: "og:description",
        content: "Share your answers in a short Talentloom Pulse survey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicSurvey,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="mb-6 text-center text-sm font-semibold text-muted-foreground">
          Talentloom Pulse
        </p>
        {children}
      </div>
    </div>
  );
}

function PublicSurvey() {
  const { token } = Route.useParams();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["public-pulse", token],
    queryFn: () => getPublicPulseForm({ data: { token } }),
    retry: false,
  });

  if (isLoading)
    return (
      <Shell>
        <p className="text-center text-muted-foreground">Loading…</p>
      </Shell>
    );
  if (!data || !data.found)
    return (
      <Shell>
        <Card title="Survey not found">
          This link doesn't lead to a survey. Check the link you received.
        </Card>
      </Shell>
    );
  if (done || data.alreadyAnswered)
    return (
      <Shell>
        <Card
          title="Thank you!"
          footer={
            canGoBack && (
              <button
                onClick={() => router.history.back()}
                className="btn-mint mt-6 rounded-xl px-5 py-2.5 text-sm font-medium"
              >
                ← Back to where you were
              </button>
            )
          }
        >
          Your answers have been saved.{canGoBack ? "" : " You can close this page."}
        </Card>
      </Shell>
    );
  if (!data.open)
    return (
      <Shell>
        <Card title={data.title}>This survey isn't taking answers right now.</Card>
      </Shell>
    );

  return (
    <Shell>
      <div className="mb-6 rounded-2xl border-2 border-border bg-card p-6 shadow-[0_4px_0_var(--brand-mint)]">
        {data.greetingName && (
          <p className="mb-1 text-sm text-muted-foreground">Hi {data.greetingName}!</p>
        )}
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {data.roundNumber && (
          <p className="text-xs text-muted-foreground">Round {data.roundNumber}</p>
        )}
        {data.description && <p className="mt-3 whitespace-pre-line text-sm">{data.description}</p>}
      </div>
      <AnswerForm
        questions={data.questions}
        previousRounds={data.previousRounds}
        submitting={sending}
        onSubmit={async (answers) => {
          setSending(true);
          try {
            await submitPublicPulse({ data: { token, answers } });
            setDone(true);
            void qc.invalidateQueries({ queryKey: ["pulse-awaiting"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send answers");
          } finally {
            setSending(false);
          }
        }}
      />
    </Shell>
  );
}

function Card({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-8 text-center shadow-[0_4px_0_var(--brand-mint)]">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      {footer}
    </div>
  );
}
