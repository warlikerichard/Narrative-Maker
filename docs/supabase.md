# Supabase setup

## 1. Create the database and private bucket

Create a Supabase project. In its SQL Editor, run the complete contents of `supabase/migrations/202610220001_initial.sql` once against a new database. Alternatively apply the migration using the Supabase CLI. The script runs in a transaction and creates the domain tables, row-level security, triggers, cleanup queue, and the private `narrative-images` bucket. Do not make the bucket public.

## 2. Environment

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Get these from Supabase Project Settings (API / API Keys). The legacy anon key also works in the publishable-key variable. Never use a secret/service-role key here. Restart Next.js after changing environment values. Add the same variables to your hosting environment before building.

## 3. Authentication

Enable the email/password provider. Configure Auth > URL Configuration > Site URL as `http://localhost:3000` for development and your HTTPS origin in production. With email confirmation enabled, registration displays a confirmation message; use the email link and then sign in with your password. No custom callback is needed for the default confirmation template and this sign-in-after-confirmation flow. Supabase manages password hashing, token expiry, refresh, and authentication rate limits.

For automated E2E tests only, use a separate project and disable email confirmation. Set `SUPABASE_E2E=1` in the shell before running `npm run test:e2e`. Configure SMTP appropriately before opening registration publicly.

## 4. Try the application

1. Register, confirm email, sign in, and create the sample world.
2. Create/edit a project and character; upload a 2-3 MB PNG/JPEG.
3. In Storage, verify the resulting WebP is at most 200,000 bytes. Only its path is stored in Postgres.
4. Create a story event, add sections/subsections and characters, click **Save changes**, and reload.
5. Sign in from another browser and check that the event and images are available.
6. Use a second account to verify it cannot access the first account's projects, events, or images.
7. Open an event in two tabs, save one, then attempt to save the older draft: the second save should report a conflict.
8. Replace/remove images and delete a project; verify obsolete Storage objects are removed.

## Image processing

Input: static PNG/JPEG/WebP up to 10 MB and 40 million decoded pixels. Processing runs server-side with Sharp: apply EXIF orientation, remove metadata, preserve aspect ratio, start at 1600 pixels and quality 85, then lower quality/dimensions as necessary. The final WebP is checked against a strict **200,000-byte** limit; the Storage bucket independently enforces that limit. Original uploads are not retained. Extremely detailed images may lose visible detail to satisfy the size requirement.

Cards request generated 400-pixel thumbnails. Private responses use browser caching only; do not configure a shared public cache for authenticated routes. Storage objects use unique names and are never overwritten.

Database triggers queue obsolete images after updates/deletions. The application processes up to 100 queued objects per mutation, checks remaining references, and retries failed removals on later mutations. Aborted requests between upload and database commit may leave an orphan; periodically audit Storage against database paths if the app grows. Account deletion through the Supabase dashboard is outside the application's cleanup flow; clean up account-owned Storage objects before deleting an Auth user.

## Hosting

Run on a Node.js-compatible host with Sharp support. No writable persistent application disk is needed. Next.js accepts Server Action bodies up to 12 MB. Your host or reverse proxy must also allow that size: hosts with smaller request-body limits require client-side preprocessing or a dedicated upload endpoint before accepting the full 10 MB input. Set production Auth URLs to your deployed origin.

## Existing SQLite and localStorage data

This change switches the active persistence layer; it does not migrate old accounts or records automatically. Back up `data/` and export old browser localStorage before clearing anything. Existing local files and browser storage were not deleted. Importing old data requires mapping legacy user IDs to new Supabase Auth IDs, decoding/compressing Base64 images, and uploading each file to the new owner's folder. Do not copy old password hashes into Supabase Auth.

## References

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/storage/security/access-control
