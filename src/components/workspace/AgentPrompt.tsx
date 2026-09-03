import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { CornerDownLeft } from "lucide-react";

export function AgentPrompt({
  onSubmit,
  busy,
}: {
  onSubmit: (value: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
    setValue("");
    setTimeout(() => ref.current?.focus(), 0);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <motion.div layout className="sticky bottom-0 z-30 px-3 pb-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <motion.div
          layout
          className="glass-strong flex items-end gap-2 rounded-2xl px-3 py-2.5"
        >
          <label htmlFor="agent-prompt" className="sr-only">Ask the agent</label>
          <textarea
            id="agent-prompt"
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={busy ? "Thinking…" : "Ask anything about your funnel…"}
            disabled={busy}
            className="flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={submit}
            disabled={!value.trim() || busy}
            aria-label="Send"
            className="btn-teal inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
