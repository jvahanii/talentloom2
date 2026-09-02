# Fix the permission tickboxes

## What's wrong

The tickboxes in Settings → Organisation → Titles & permissions never reflect the
saved state. Every box renders unticked, no matter what is stored, so:

- You can't see a title's real permissions.
- Clicking a box always saves "allowed" — you can never turn a permission off.

## Cause

The permissions are stored in the database as `can_view_candidates`,
`can_edit_candidates`, and so on, but the checkbox reads the plain key
(`view_candidates`). That lookup is always empty, so the box is drawn unticked
and each click sends "true".

Saving itself works correctly — it already maps to the `can_` column — which is
why the underlying data changes but the screen doesn't.

## Fix

In `src/components/OrgSettings.tsx`, read the checkbox state through the same
`permColumn(item.key)` mapping already used when saving, so the box shows the
stored value and toggling turns permissions both on and off.

Also make the toggle feel instant: update the local cache immediately and revert
if the save fails, instead of waiting for a full refetch.

## Verify

Load Settings → Organisation, confirm existing titles show their real
permissions, untick one, reload the page and confirm it stayed unticked.
