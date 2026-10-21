# Narrative Maker

A game narrative workspace built with **Next.js App Router, React, TypeScript, and SQLite**. The interface takes its restrained dark surfaces, docked navigation, and muted blue accents from game editors. All application code, UI copy, and documentation are in English.

## Run locally

Requirements: **Node.js 22.13 or newer** and npm. Dependencies are already installed in this workspace.

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), choose **Create an account**, and create your own login. There are no default credentials. Each account starts with an empty workspace. **Explore a sample world** creates an editable example owned by that account.

SQLite tables and the `data/` directory are created automatically. No database service, API keys, or manual migrations are needed for this initial version. Your data survives reloads and server restarts. The default database is `data/narrative-maker.db`; it is excluded from Git.

To change the database location, copy `.env.example` to `.env.local` and edit `DATABASE_PATH`. Stop the application before copying the database for backup, or use SQLite's backup API so its WAL is handled consistently.

## Included

- Registration, sign-in, and sign-out with per-user project ownership.
- Any number of narrative projects, with name, description, cover image, status, and favorites.
- Create, read, edit, delete, and search characters, regions, items, and character types.
- Required character types, scoped to the same project. A referenced type cannot be deleted until its characters are reassigned or removed.
- Optional PNG, JPEG, and WebP images, up to 2 MB each; image preview, replacement, and removal.
- Project and entry search, alphabetical/recent sorting, grid/list layouts, and responsive navigation.
- Confirmation dialogs for deletion, accessible native modal dialogs, empty states, and error feedback.
- An optional sample world, including two types, two characters, two regions, and one item.

## Change the visual theme

**`src/styles/theme.css` is the single source of truth for the interface palette.** Change the semantic variables for backgrounds, borders, text, accent, status, and entity categories. RGB channel variables provide transparent variants; update both the hex color and corresponding RGB channels together. Fonts and the shared corner radius are also defined there.

`src/app/globals.css` contains layouts, component styles, and responsive breakpoints. The two original SVG illustrations in `public/art/` are self-contained local assets with their own illustration colors. No external fonts or image services are required.

## Code map

```text
src/
  app/
    actions.ts                  Authenticated server mutations and validation
    page.tsx                    Project dashboard
    login/page.tsx              Authentication page
    projects/[projectId]/       Project workspace
    layout.tsx                  Shared metadata and styles
    globals.css                 Component and responsive styles
  components/
    auth-form.tsx               Login and registration forms
    workspace.tsx               Dashboard, navigation, cards, and entity views
    editor-form.tsx             Shared project/entity editor and image input
    modal.tsx                   Native dialog with focus containment
  lib/
    types.ts                    Shared domain types and entity labels
    validation.ts               Zod schemas and image upload validation
    database.ts                 SQLite connection, schema, and indexes
    repository.ts               Ownership-scoped persistence and domain rules
    auth.ts                     Password hashing and server-side sessions
  styles/theme.css              Editable design tokens
public/art/                     Local SVG environment illustrations
tests/repository.test.ts        Domain, ownership, integrity, and upload tests
tests/e2e/workspace.spec.ts      Browser workflow and responsive checks
```

Server components load data, client components provide interaction, and Server Actions validate writes and revalidate pages. The repository keeps persistence rules out of the UI. SQL uses bound parameters. `character_types` is a separate table; `entities` holds characters, regions, and items. A composite foreign key `(character_type_id, project_id)` enforces type membership at the database level, and a check constraint requires a type for every character.

To add another kind of narrative entry, start with `EntityKind` and the label registry in `types.ts`, then extend the validation, schema migration, repository, and icon/category mapping. For entities with significantly different fields or relationships, add a dedicated table and editor instead of expanding the generic entry indefinitely. Schema changes for existing databases should be implemented as versioned migrations; `CREATE TABLE IF NOT EXISTS` does not modify existing tables.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build

# Install the browser once, then run the full workflow.
npx playwright install chromium
npm run test:e2e
```

The browser suite launches its own development server on port **3100** and uses a separate timestamped database under `data/`. It never uses the normal application database. Screenshots and failure traces are written to `test-results/`. Test databases remain available for debugging and can be removed after the test server has stopped.

Validation at handoff: lint, TypeScript, the production build, five domain tests, and the complete Chromium workflow pass. Desktop and mobile screenshots were visually inspected. `npm audit --omit=dev` reports no production dependency vulnerabilities. The full audit currently reports five development-only findings in the `eslint-config-next → fast-glob → micromatch → braces` chain; npm's suggested forced fix downgrades the Next.js lint configuration to an incompatible major version, so it has not been applied.

## Authentication and deployment

Passwords are salted and hashed with Node's `scrypt`; session tokens are random, stored as hashes in SQLite, and sent in HttpOnly, SameSite cookies. Sessions expire after seven days. Authentication attempts are limited by email over a 15-minute window. Every data operation checks project ownership on the server. Next.js Server Actions enforce same-origin mutations.

For a production build:

```bash
npm run build
npm start
```

This initial implementation targets **one Node.js server with a persistent, writable disk**. Serve it over HTTPS in production, since production session cookies are Secure. Use an absolute database path on a persistent volume. Stateless/serverless deployments and multiple app replicas need a shared database and object storage instead of the local SQLite file.

Images are stored as data URLs in SQLite to keep the starter self-contained; for larger libraries, move images to object storage and serve them through authenticated endpoints. This version does not include email verification, password reset, invitations, project sharing, or collaboration. Add those flows and infrastructure-level rate limiting before opening registration to a public audience.

## References

- [Next.js App Router installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication)
- [SQLite foreign key constraints](https://sqlite.org/foreignkeys.html)
