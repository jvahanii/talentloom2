import { motion } from "framer-motion";
import { SLASH_COMMANDS } from "@/lib/workspace/intent";

export function HelpModule() {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-display text-lg font-semibold text-foreground">Commands</h3>
      <p className="mt-1 text-xs text-muted-foreground">Type any of these, or ask in plain language.</p>
      <div className="mt-3 grid gap-1.5">
        {SLASH_COMMANDS.map((s, i) => (
          <motion.div
            key={s.cmd}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-1.5 text-sm"
          >
            <span className="font-mono text-[#4B73FF]">{s.cmd}</span>
            <span className="text-muted-foreground">{s.hint}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
