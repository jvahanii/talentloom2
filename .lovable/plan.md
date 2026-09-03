# Create new owner user across all organizations

## Goal

Create a new recruiter/team user in the external Supabase project and make them an Owner of every existing organization.

## User details

- Email: `talentloom.org@gmail.com`
- Full name: `Talent Loom`
- Role in every organization: `Owner`

## Steps

1. **Create the Auth user**
   - Use the Supabase Auth Admin API (`supabaseAdmin.auth.admin.createUser`) in the external project.
   - Set `email_confirm: true` so the account is active immediately.
   - Generate a strong random temporary password and set it on the account.
   - Set `user_metadata.full_name` to `Talent Loom`.

2. **Create the profile row**
   - Insert a row into `public.profiles(id, full_name, onboarding_step)` with the new user's UUID.

3. **Add Owner memberships for every organization**
   - Query `public.organizations` for all existing organizations.
   - For each organization, look up its system `Owner` title in `public.organization_titles`.
   - Insert a row into `public.organization_members(org_id, user_id, role, title_id)` with `role = 'owner'` and the matching `Owner` title ID.

4. **Hand over credentials**
   - Provide the generated temporary password to the user once, in chat.
   - Recommend signing in and changing the password immediately, or using the "Forgot password" flow to set a personal password.

## Security note

This user will have full Owner privileges in every organization, including renaming organizations, managing titles, removing users, and deleting data. This is intentional per the request.

## Verification

- Confirm the user exists in Auth and can sign in.
- Confirm the organization switcher shows all organizations for the new user.
- Confirm at least one organization lists the new user with the Owner title.
