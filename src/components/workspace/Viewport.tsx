import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef } from "react";

export type ChatTurn = {
  id: string;
  utterance: string;
  reply: string;
  pending: boolean;
  createdAt: number;
};

const spring = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.8 };

// Model output is untrusted: block any element that can trigger an outbound
// request, and allow only https:/mailto: URLs on whatever links remain.
const DISALLOWED_ELEMENTS = ["img", "iframe", "video", "audio", "embed", "object"];

function safeUrlTransform(url: string): string {
  try {
    const parsed = new URL(url, "https://invalid.example");
    return parsed.protocol === "https:" || parsed.protocol === "mailto:" ? url : "";
  } catch {
    return "";
  }
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="ml-2 text-xs">Thinking…</span>
    </div>
  );
}

export function Viewport({ turns }: { turns: ChatTurn[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, turns[turns.length - 1]?.reply]);

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6">
      <div className="mx-auto max-w-3xl py-6">
        {turns.length === 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass mt-16 rounded-3xl p-8 text-center"
          >
            <div className="font-display text-3xl font-bold sm:text-4xl text-foreground">
              Ask anything.
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Your organization's recruiting brain. Ask in plain English — I'll pull from
              your pipeline, requisitions, candidates, and stage history to answer.
            </p>

            <div className="mx-auto mt-6 max-w-xl text-left">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Try asking
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li>· Who's stuck in interview for the Senior Engineer role?</li>
                <li>· How's our pipeline looking this week?</li>
                <li>· Which source has the best offer conversion?</li>
                <li>· Give me an update on Ava Thompson</li>
                <li>· What roles are open and who's furthest along on each?</li>
              </ul>

              <p className="mt-5 text-xs text-muted-foreground">
                Answers are grounded in your data — you're still the reviewer. Double-check
                anything you'd send to a candidate or hiring manager.
              </p>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {turns.map((turn) => (
            <motion.div
              key={turn.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={spring}
              className="mb-6"
            >
              <div className="flex justify-end">
                <motion.div
                  layout
                  className="max-w-[85%] rounded-2xl bg-secondary border border-border px-4 py-2 text-sm text-foreground shadow-sm"
                >
                  {turn.utterance}
                </motion.div>
              </div>

              <motion.div
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 max-w-[92%]"
              >
                {turn.pending && !turn.reply ? (
                  <ThinkingDots />
                ) : (
                  <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-[#4B73FF] prose-code:text-foreground prose-code:bg-secondary prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none">
                    <ReactMarkdown
                      disallowedElements={DISALLOWED_ELEMENTS}
                      unwrapDisallowed
                      urlTransform={safeUrlTransform}
                    >
                      {turn.reply}
                    </ReactMarkdown>
                  </div>
                )}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
