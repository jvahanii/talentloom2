## GitHub sync: what I can and can't see

I don't push anything to GitHub myself. When I save changes in Lovable, Lovable syncs them to your GitHub repository automatically. That's why your changes have been showing up there today. The connection and its status ("in sync", "GitHub is N commits ahead", "diverged") are only shown to you, in the Lovable editor.

### How to check
1. Open Project settings → Git. The status card there tells you whether both sides match.
2. If you see a "sync branch" notice, some Lovable work was saved to a `lovable-sync` branch. Merge that branch into your main branch on GitHub.
3. If GitHub is ahead (someone pushed directly), Lovable pulls those changes once a new commit is pushed to the synced branch.

No code changes are needed.
