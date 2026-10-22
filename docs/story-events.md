# Story events

Story events are stored in the Supabase `story_events` table. Sections and subsections are stored as an ordered JSON document; involved character IDs are validated against the same project. RLS checks ownership through `projects`. Deleting a character removes its associations; deleting a project cascades its events.

Creation saves immediately and opens the editor. Subsequent changes stay in React draft state until **Save changes** is clicked. The editor shows dirty, saving, success, and failure states and warns before leaving an unsaved draft. A timestamp compare-and-swap rejects stale writes. On conflict, reload the saved version before editing again. Listing refreshes after mutations and when the window regains focus; this is not realtime collaboration.

Images selected in the editor are compressed server-side before preview. Saving uploads the optimized image to private Storage and writes its path. Supabase credentials and initial SQL setup are documented in [supabase.md](supabase.md).

Legacy localStorage events remain in the browser but are not loaded or automatically imported.
