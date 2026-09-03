# Use the file's own name as the default document label

Today the label box on the candidate "My documents" upload form stays empty until you type something; only at save time does it silently fall back to the file name (minus extension).

## Change

When a candidate picks a file, immediately fill the label box with the file's name without its extension (e.g. `Jarno-CV-2026.pdf` becomes `Jarno-CV-2026`), so they can see and edit it before saving.

Details:
- Only auto-fill when the label box is empty or still holds the auto-filled name from a previously chosen file — anything the candidate typed themselves is never overwritten.
- Trim to the 120-character limit.
- Clearing the file selection leaves the label as-is.
- The existing save-time fallback stays as a safety net.

## Technical notes

Single file: `src/routes/candidate.applications.tsx`, in `DocumentsSection`. The file input's `onChange` sets both `file` and, conditionally, `label`; track the last auto-generated value in a ref to decide whether it's safe to overwrite. No backend, storage or schema changes.
