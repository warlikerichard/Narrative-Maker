# Story events: UI and local state

Story events currently use **React state and browser localStorage only**. There are no story-event tables, SQL statements, migrations, or Server Actions. Existing project ownership and character data are still read through the application's existing server code.

## User flow

1. In a project, select **Story events**, then **New story event**.
2. Enter a title and optionally upload a cover image.
3. **Create and edit** saves a local event and navigates to `/projects/[projectId]/story-events/[eventId]`.
4. On this page, edit the title/cover, add sections and subsections, reorder them, and select involved characters.
5. Changes save automatically in this browser. The project's cards, search results, and counts include these local events. Opening or editing an event navigates to its page; it does not open the generic entity modal.

## Where to learn from the code

| File                                                           | Role                                                                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/types.ts`                                             | `StoryEvent`, `StoryEventSection`, and `StoryEventSubsection` describe the data.                                        |
| `src/components/story-event-form.tsx`                          | Creation modal: title/image state, local save, then `router.push`.                                                      |
| `src/components/story-event-editor.tsx`                        | Full editor: `draft` state, immutable array updates, section ordering, character selection, and deletion confirmations. |
| `src/components/story-image-field.tsx`                         | Reads an image into a data URL and previews it, without an upload request.                                              |
| `src/lib/local-story-events.ts`                                | Temporary persistence boundary: read, validate, save, delete, and subscribe to local changes.                           |
| `src/components/workspace.tsx`                                 | Combines existing database entries with local event card data. Routes event actions to their dedicated UI/store.        |
| `src/app/projects/[projectId]/story-events/[eventId]/page.tsx` | Checks the current user/project and supplies available characters to the client editor.                                 |
| `src/styles/story-events.css`                                  | Styles for the event page. Category colors live in `src/styles/theme.css`.                                              |

The `update` function in the editor first updates React state with `setDraft`. It then calls `saveLocalStoryEvent`. Storage failures are shown explicitly; unsaved edits remain in memory and can be retried. Section and subsection IDs remain stable when titles or positions change.

The workspace maps `StoryEvent` into the existing card's shape **for display only**. These mapped values must never be sent to `saveEntity`: the SQLite `entities` table does not support this shape.

## Storage behavior

The localStorage key is `narrative-maker:story-events:v1:<userId>`. Its value contains `{ version: 1, events: [...] }`. Each event also contains its `projectId`, so events are filtered per account and project. This is browser organization, not server-enforced protection of localStorage.

- Reloads and navigation preserve successfully saved events.
- Another tab on the same origin receives list updates. An editor with an outdated saved version cannot silently overwrite a newer version.
- A missing event URL shows a recovery state with a link back to the project.
- Images are limited to 2 MB each; the browser has a separate total storage limit. Failed writes do not silently erase existing events.
- Invalid stored data is reported instead of being replaced with an empty list.
- Clearing browser data removes events. A different browser, device, port, or hostname (for example `localhost` versus `127.0.0.1`) has separate storage.
- Deleting a project also attempts to remove its events from the current browser. It cannot clear another browser's local data.

## Later: connect the database yourself

The future work is deliberately left open: design the tables/migration, implement ownership-scoped repository methods, validate input in Server Actions, and load events from the server. Replace calls to `saveLocalStoryEvent`/`deleteLocalStoryEvent` and the `useLocalStoryEvents` reader as part of that step. The form and section-editing UI can remain largely unchanged. Decide explicitly how to import existing browser drafts when adding persistence; they will not migrate automatically.

## Validation

`tests/e2e/story-events.spec.ts` exercises the creation modal, dedicated page, cover selection/removal, nested editing, reload persistence, character selection, list updates between tabs, reordering, deletion, unavailable-event handling, mobile width, and browser-storage failures. It also checks that event mutations do not send POST requests to the server. The browser suite uses a separate test database for the existing account/project setup and `.next-e2e` for its server output.
