# Narrative Maker

A game narrative workspace built with Next.js App Router, React, TypeScript, Supabase Postgres, Supabase Auth, and private Supabase Storage. Source, documentation, and interface copy are in English.

## Setup

1. Install Node.js 22.13 or newer and run `npm install`.
2. Follow [Supabase setup](docs/supabase.md): run the SQL migration, configure Auth, and fill `.env.local` using `.env.example`.
3. Run `npm run dev` and open http://localhost:3000.
4. Create an account, confirm your email if enabled, sign in, and create a project or sample world.

## Features

- Account-owned projects, favorites, characters, character types, regions, and items.
- Cloud-backed story events with sections, subsections, ordering, and character associations. Click **Save changes** in the event editor; concurrent edits are detected instead of silently overwritten.
- PNG/JPEG/WebP uploads up to **10 MB**, automatically converted to WebP at **200,000 bytes or less**. Aspect ratio and transparency are preserved. Large images are resized; original files are not retained.
- Private images served through authenticated routes. Cards request 400-pixel thumbnails and load lazily; thumbnails are generated on demand without storing a second copy.
- Deleted/replaced images enter a persistent cleanup queue. Cleanup checks references before removing files, and retries on subsequent mutations if Storage is unavailable.
- Per-account row-level security in Postgres and Storage. The application uses a publishable key, never a service-role key.

## Architecture

- `src/lib/database.ts`: request-scoped Supabase SSR client.
- `src/proxy.ts`: session refresh.
- `src/lib/auth.ts`: server-side identity checks.
- `src/lib/repository.ts`: asynchronous project and entity operations.
- `src/app/actions.ts`: authenticated form mutations and compression.
- `src/app/api/story-events/route.ts`: story document persistence.
- `src/lib/story-events.ts`: browser fetch state, without localStorage persistence.
- `src/lib/image-processing.ts`: bounded decoding, resizing, and compression.
- `src/app/api/images/[...path]/route.ts`: private image delivery and thumbnails.
- `supabase/migrations/202610220001_initial.sql`: schema, integrity constraints, RLS, triggers, and bucket.

`src/styles/theme.css` remains the single source of truth for the interface palette. Layout styles live in `src/app/globals.css` and `src/styles/story-events.css`.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Unit tests exercise compression using multi-megabyte images and run the migration in embedded Postgres (PGlite), including ownership, character references, concurrent updates, and cascade cleanup. This does not replace a live Supabase integration test.

`npm run test:e2e` requires a dedicated configured Supabase test project with email confirmation disabled. Set `SUPABASE_E2E=1` explicitly. Tests create accounts and data; never point them at production.

## Existing local data

The application no longer reads SQLite or browser localStorage. Existing files in `data/` and old browser events are left untouched, but are **not automatically imported**. Old accounts must be recreated in Supabase Auth. See [setup and migration notes](docs/supabase.md).
