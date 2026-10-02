# Personal answer history while answering

Show each invited respondent their own earlier answers beneath every question, newest round first. Keep public-link responses anonymous and never show another person's answers.

## What changes
- Replace the current single “Last time” line with a compact timeline under each question. Mark the newest answer clearly, show round number and response date, and soften older entries without making them unreadable.
- For 1–5 ratings, add a small connected trend chart with labeled rounds and visible values. For yes/no and choices, show clear labeled responses; for free text, show the complete previous text without truncation.
- Show history only when the survey's existing “Show people their previous answers” setting is on and the person is answering through their personal link. Update the setting description to reflect all earlier rounds.

## Technical details
- Expand the public form's personal-history query to fetch all earlier responses for that respondent and survey, ordered by round, including response dates and answers; keep the token and ownership checks server-side.
- Pass the history into the shared answer form, leaving interview entry and public anonymous links unchanged.
- Check the public form in desktop and mobile layouts and verify the latest preview diagnostics.
