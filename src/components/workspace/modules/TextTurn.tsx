export function TextTurn({ body }: { body: string }) {
  if (!body) return null;
  return (
    <div className="glass rounded-2xl px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
      {body}
    </div>
  );
}
