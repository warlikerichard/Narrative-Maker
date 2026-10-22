"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronRight,
  FileText,
  Layers3,
  ListTree,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  deleteStoryEvent,
  saveStoryEvent,
  useStoryEvents,
} from "@/lib/story-events";
import type {
  NarrativeEntity,
  Project,
  StoryEvent,
  StoryEventSection,
} from "@/lib/types";
import { Modal } from "./modal";
import { StoryImageField } from "./story-image-field";

export function StoryEventEditor({
  userId,
  project,
  eventId,
  characters,
}: {
  userId: string;
  project: Project;
  eventId: string;
  characters: NarrativeEntity[];
}) {
  const local = useStoryEvents(userId);
  if (!local.ready)
    return (
      <main className="standalone-state" aria-live="polite">
        <span className="loading-orbit" />
        <p>Opening your story event…</p>
      </main>
    );
  const event = local.events.find(
    (entry) => entry.id === eventId && entry.projectId === project.id,
  );
  if (local.error || !event)
    return (
      <main className="standalone-state">
        <BookOpenText size={40} />
        <h1>
          {local.error
            ? "Could not open your events"
            : "This event was not found"}
        </h1>
        <p>
          {local.error ??
            "It may have been deleted, or you may not have access to it."}
        </p>
        <Link className="button primary" href={`/projects/${project.id}`}>
          Back to project
        </Link>
      </main>
    );
  return (
    <EventDocument
      key={event.id}
      userId={userId}
      project={project}
      initialEvent={event}
      characters={characters}
    />
  );
}

type Removal =
  | { kind: "event" }
  | { kind: "section"; sectionId: string }
  | { kind: "subsection"; sectionId: string; subsectionId: string };

function EventDocument({
  userId,
  project,
  initialEvent,
  characters,
}: {
  userId: string;
  project: Project;
  initialEvent: StoryEvent;
  characters: NarrativeEntity[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialEvent);
  const [error, setError] = useState("");
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [characterQuery, setCharacterQuery] = useState("");
  const savedVersion = useRef(initialEvent.updatedAt);
  const projectHref = `/projects/${project.id}`;
  const subsectionCount = draft.sections.reduce(
    (sum, section) => sum + section.subsections.length,
    0,
  );
  const missingCharacterIds = draft.characterIds.filter(
    (id) => !characters.some((character) => character.id === id),
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  function update(next: StoryEvent) {
    if (saving) return false;
    setDraft(next);
    setDirty(true);
    return true;
  }
  async function save() {
    if (saving || imageBusy) return;
    setSaving(true);
    try {
      const saved = await saveStoryEvent(userId, draft, savedVersion.current);
      savedVersion.current = saved.updatedAt;
      setDraft(saved);
      setDirty(false);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save your changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function beforeLeave(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      dirty &&
      !window.confirm(
        "Some changes have not been saved. Leave this page anyway?",
      )
    )
      event.preventDefault();
  }

  function updateSection(
    id: string,
    transform: (section: StoryEventSection) => StoryEventSection,
  ) {
    update({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === id ? transform(section) : section,
      ),
    });
  }

  function addSection() {
    update({
      ...draft,
      sections: [
        ...draft.sections,
        {
          id: crypto.randomUUID(),
          title: "",
          description: "",
          subsections: [],
        },
      ],
    });
  }

  function toggleCharacter(id: string) {
    update({
      ...draft,
      characterIds: draft.characterIds.includes(id)
        ? draft.characterIds.filter((entry) => entry !== id)
        : [...draft.characterIds, id],
    });
  }

  async function confirmRemoval() {
    if (!removal) return;
    if (removal.kind === "event") {
      try {
        await deleteStoryEvent(userId, project.id, draft.id);
        router.push(projectHref);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not delete this event.",
        );
      }
      return;
    }
    const sections =
      removal.kind === "section"
        ? draft.sections.filter((section) => section.id !== removal.sectionId)
        : draft.sections.map((section) =>
            section.id === removal.sectionId
              ? {
                  ...section,
                  subsections: section.subsections.filter(
                    (subsection) => subsection.id !== removal.subsectionId,
                  ),
                }
              : section,
          );
    if (update({ ...draft, sections })) setRemoval(null);
  }

  return (
    <div className="story-page">
      <header className="topbar story-topbar">
        <div className="breadcrumbs">
          <BookOpenText size={18} />
          <Link href={projectHref} onClick={beforeLeave}>
            {project.name}
          </Link>
          <ChevronRight size={14} />
          <span>Story events</span>
        </div>
        <span
          className={`story-save-status ${error ? "danger-text" : ""}`}
          role="status"
        >
          <Check size={14} />
          {saving
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : "Saved to your account"}
          <button
            className="button primary"
            disabled={saving || imageBusy || !dirty}
            onClick={save}
          >
            Save changes
          </button>
        </span>
      </header>
      <main className="story-layout">
        <aside className="story-outline">
          <Link className="back-link" href={projectHref} onClick={beforeLeave}>
            <ArrowLeft size={14} />
            Back to project
          </Link>
          <div className="story-outline-heading">
            <ListTree size={16} />
            <span>EVENT OUTLINE</span>
          </div>
          <nav aria-label="Event outline">
            <a href="#event-details">
              <BookOpenText size={15} />
              Event details
            </a>
            {draft.sections.map((section, index) => (
              <div key={section.id}>
                <a href={`#section-${section.id}`}>
                  <span className="outline-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.title || "Untitled section"}
                </a>
                {section.subsections.map((subsection) => (
                  <a
                    className="outline-subsection"
                    key={subsection.id}
                    href={`#subsection-${subsection.id}`}
                  >
                    {subsection.title || "Untitled subsection"}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <button className="text-button" onClick={addSection}>
            <Plus size={14} />
            Add section
          </button>
          <div className="story-outline-note">
            <FileText size={20} />
            <p>
              Give every turning point
              <br />a place in your story.
            </p>
          </div>
        </aside>
        <fieldset
          className="story-document"
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <section id="event-details" className="story-document-header">
            <span className="eyebrow">
              <BookOpenText size={14} />
              STORY EVENT
            </span>
            <h1>{draft.title || "Untitled event"}</h1>
            <p>Shape the moments that move your world forward.</p>
            <div className="story-document-meta">
              <span>
                <Layers3 size={14} />
                {draft.sections.length} sections
              </span>
              <span>
                <ListTree size={14} />
                {subsectionCount} subsections
              </span>
              <span>
                <Users size={14} />
                {draft.characterIds.length} characters
              </span>
            </div>
          </section>
          {error && (
            <div className="story-save-error">
              <p role="alert" className="form-error">
                {error}
              </p>
              <button className="button secondary" onClick={save}>
                Retry saving
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard unsaved changes and reload the saved version?",
                    )
                  )
                    window.location.reload();
                }}
              >
                Reload saved version
              </button>
            </div>
          )}
          <section
            className="story-panel form-stack"
            aria-label="Event details"
          >
            <label>
              Event title
              <input
                value={draft.title}
                maxLength={100}
                placeholder="Give this event a title"
                onChange={(event) =>
                  update({ ...draft, title: event.target.value })
                }
              />
            </label>
            <StoryImageField
              image={draft.image}
              onBusyChange={setImageBusy}
              onChange={(image) => update({ ...draft, image })}
            />
          </section>
          <div className="story-section-heading">
            <div>
              <h2>The story, step by step</h2>
              <p>Break your event into sections and smaller moments.</p>
            </div>
            <button className="button secondary" onClick={addSection}>
              <Plus size={16} />
              Add section
            </button>
          </div>
          {draft.sections.length === 0 && (
            <div className="empty-state story-empty">
              <span className="empty-icon">
                <Layers3 size={28} />
              </span>
              <h3>Every story starts somewhere</h3>
              <p>
                Add your first section to outline what happens, then use
                subsections to explore the details.
              </p>
              <button className="button primary" onClick={addSection}>
                <Plus size={16} />
                Add first section
              </button>
            </div>
          )}
          <div className="story-sections">
            {draft.sections.map((section, index) => (
              <section
                key={section.id}
                id={`section-${section.id}`}
                className="story-section-card"
                aria-label={`Section ${index + 1}`}
              >
                <header className="story-card-header">
                  <span className="story-section-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>SECTION</span>
                  <div className="story-card-actions">
                    <button
                      className="icon-button"
                      aria-label={`Move section ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() =>
                        update({
                          ...draft,
                          sections: move(draft.sections, index, -1),
                        })
                      }
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move section ${index + 1} down`}
                      disabled={index === draft.sections.length - 1}
                      onClick={() =>
                        update({
                          ...draft,
                          sections: move(draft.sections, index, 1),
                        })
                      }
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="icon-button danger-hover"
                      aria-label={`Delete section ${index + 1}`}
                      onClick={() =>
                        setRemoval({ kind: "section", sectionId: section.id })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </header>
                <div className="form-stack">
                  <label>
                    Section title
                    <input
                      value={section.title}
                      maxLength={200}
                      placeholder="e.g. The warning"
                      onChange={(event) =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      rows={4}
                      value={section.description}
                      maxLength={20000}
                      placeholder="What happens in this part of the story?"
                      onChange={(event) =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="story-subsections">
                  {section.subsections.map((subsection, subIndex) => (
                    <section
                      key={subsection.id}
                      id={`subsection-${subsection.id}`}
                      className="story-subsection"
                      aria-label={`Subsection ${index + 1}.${subIndex + 1}`}
                    >
                      <header className="story-card-header">
                        <span>
                          {index + 1}.{subIndex + 1}
                        </span>
                        <span>SUBSECTION</span>
                        <div className="story-card-actions">
                          <button
                            className="icon-button"
                            aria-label={`Move subsection ${index + 1}.${subIndex + 1} up`}
                            disabled={subIndex === 0}
                            onClick={() =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                subsections: move(
                                  current.subsections,
                                  subIndex,
                                  -1,
                                ),
                              }))
                            }
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move subsection ${index + 1}.${subIndex + 1} down`}
                            disabled={
                              subIndex === section.subsections.length - 1
                            }
                            onClick={() =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                subsections: move(
                                  current.subsections,
                                  subIndex,
                                  1,
                                ),
                              }))
                            }
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="icon-button danger-hover"
                            aria-label={`Delete subsection ${index + 1}.${subIndex + 1}`}
                            onClick={() =>
                              setRemoval({
                                kind: "subsection",
                                sectionId: section.id,
                                subsectionId: subsection.id,
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </header>
                      <div className="form-stack">
                        <label>
                          Subsection title
                          <input
                            value={subsection.title}
                            maxLength={200}
                            placeholder="e.g. The council meeting"
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                subsections: current.subsections.map((entry) =>
                                  entry.id === subsection.id
                                    ? { ...entry, title: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            rows={3}
                            value={subsection.description}
                            maxLength={20000}
                            placeholder="Explore this moment in more detail…"
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                subsections: current.subsections.map((entry) =>
                                  entry.id === subsection.id
                                    ? {
                                        ...entry,
                                        description: event.target.value,
                                      }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>
                <button
                  className="text-button story-add-subsection"
                  onClick={() =>
                    updateSection(section.id, (current) => ({
                      ...current,
                      subsections: [
                        ...current.subsections,
                        { id: crypto.randomUUID(), title: "", description: "" },
                      ],
                    }))
                  }
                >
                  <Plus size={15} />
                  Add subsection
                </button>
              </section>
            ))}
          </div>
          <p className="story-local-note story-bottom-note">
            Use Save changes to sync this event to your account and other
            devices.
          </p>
        </fieldset>
        <fieldset
          disabled={saving}
          className="story-context"
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <section className="story-panel story-cast">
            <div className="story-context-heading">
              <Users size={18} />
              <h2>Involved characters</h2>
              <span>{draft.characterIds.length}</span>
            </div>
            <p>Choose the characters who take part in this event.</p>
            {characters.length > 0 ? (
              <>
                <label className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Search characters"
                    placeholder="Find a character…"
                    value={characterQuery}
                    onChange={(event) => setCharacterQuery(event.target.value)}
                  />
                </label>
                <div className="story-character-list">
                  {characters
                    .filter((character) =>
                      character.name
                        .toLowerCase()
                        .includes(characterQuery.toLowerCase()),
                    )
                    .map((character) => (
                      <label
                        className={`story-character ${draft.characterIds.includes(character.id) ? "selected" : ""}`}
                        key={character.id}
                      >
                        <input
                          type="checkbox"
                          checked={draft.characterIds.includes(character.id)}
                          onChange={() => toggleCharacter(character.id)}
                        />
                        {character.image ? (
                          <img src={character.image} alt="" />
                        ) : (
                          <span className="story-character-avatar">
                            {character.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span>{character.name}</span>
                      </label>
                    ))}
                  {!characters.some((character) =>
                    character.name
                      .toLowerCase()
                      .includes(characterQuery.toLowerCase()),
                  ) && (
                    <p className="story-local-note">
                      No characters match your search.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="story-cast-empty">
                <Users size={26} />
                <p>No characters in this project yet.</p>
                <Link href={projectHref} onClick={beforeLeave}>
                  Add characters in your project
                </Link>
              </div>
            )}
            {missingCharacterIds.map((id) => (
              <label key={id} className="story-character">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleCharacter(id)}
                />
                <span>
                  Unavailable character
                  <small>Uncheck to remove this reference.</small>
                </span>
              </label>
            ))}
          </section>
          <section className="story-storage-note">
            <span className="tiny-dot" />
            <div>
              <strong>Saved with your account</strong>
              <p>
                Use Save changes to keep your work available across devices.
              </p>
            </div>
          </section>
          <button
            className="text-button danger-text"
            onClick={() => setRemoval({ kind: "event" })}
          >
            <Trash2 size={14} />
            Delete story event
          </button>
        </fieldset>
      </main>
      {removal && (
        <Modal
          title={`Delete ${removal.kind === "event" ? "story event" : removal.kind}?`}
          onClose={() => setRemoval(null)}
        >
          <p className="delete-description">
            {removal.kind === "event"
              ? "This event and all of its sections will be removed from this browser."
              : removal.kind === "section"
                ? "This section and all of its subsections will be removed."
                : "This subsection will be removed."}{" "}
            This cannot be undone.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRemoval(null)}
            >
              Keep it
            </button>
            <button className="button danger" onClick={confirmRemoval}>
              <Trash2 size={15} />
              Delete permanently
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
