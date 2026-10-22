"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Feather,
  Folder,
  FolderOpen,
  Gem,
  LayoutGrid,
  List,
  LogOut,
  Map,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
  BookOpenText,
  type LucideIcon,
} from "lucide-react";
import {
  createExample,
  deleteEntity,
  deleteProject,
  signOut,
  toggleFavorite,
} from "@/app/actions";
import {
  entityKinds,
  entityLabels,
  type ActionResult,
  type EntityKind,
  type NarrativeEntity,
  type Project,
  type User,
} from "@/lib/types";
import { EditorForm } from "./editor-form";
import { Modal } from "./modal";
import { StoryEventForm } from "./story-event-form";
import { deleteStoryEvent, useStoryEvents } from "@/lib/story-events";

const icons: Record<EntityKind, LucideIcon> = {
  character: Users,
  region: Map,
  item: Gem,
  characterType: Shapes,
  storyEvent: BookOpenText,
};
const statusLabels = {
  concept: "Concept",
  "in-progress": "In progress",
  completed: "Completed",
};
type Editor =
  | { type: "project"; project?: Project }
  | { type: "entity"; kind: EntityKind; entity?: NarrativeEntity };
type Deletion =
  | { type: "project"; project: Project }
  | { type: "entity"; entity: NarrativeEntity };

export function Workspace({
  user,
  projects,
  project,
  entities = [],
  initialFilter = "all",
}: {
  user: User;
  projects: Project[];
  project?: Project;
  entities?: NarrativeEntity[];
  initialFilter?: "all" | "favorites";
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "favorites">(initialFilter);
  const [kind, setKind] = useState<EntityKind | "overview">("overview");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [details, setDetails] = useState<NarrativeEntity | null>(null);
  const [help, setHelp] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const types = entities.filter((entity) => entity.kind === "characterType");
  const stories = useStoryEvents(user.id);
  // Story documents use their dedicated persistence endpoint.
  const storyEntries: NarrativeEntity[] = stories.events
    .filter((event) => event.projectId === project?.id)
    .map((event) => ({
      id: event.id,
      projectId: event.projectId,
      kind: "storyEvent",
      name: event.title || "Untitled event",
      description:
        event.sections
          .map((section) =>
            [
              section.title,
              section.description,
              ...section.subsections.flatMap((subsection) => [
                subsection.title,
                subsection.description,
              ]),
            ]
              .filter(Boolean)
              .join(" · "),
          )
          .join(" · ") || "Open the editor to start shaping this story.",
      image: event.image,
      characterTypeId: null,
      updatedAt: event.updatedAt,
    }));
  const allEntries = [...entities, ...storyEntries];
  const displayProjects = projects.map((entry) => {
    const events = stories.events.filter(
      (event) => event.projectId === entry.id,
    );
    return {
      ...entry,
      entityCount: entry.entityCount + events.length,
      updatedAt: events.reduce(
        (latest, event) =>
          event.updatedAt > latest ? event.updatedAt : latest,
        entry.updatedAt,
      ),
    };
  });
  const totalEntries = displayProjects.reduce(
    (sum, entry) => sum + entry.entityCount,
    0,
  );

  async function run(action: () => Promise<ActionResult>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return result;
      }
      if (success) setMessage({ text: success });
      router.refresh();
      return result;
    } catch {
      setMessage({
        text: "Could not complete the action. Please try again.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  function newEntity(nextKind: EntityKind) {
    if (nextKind === "character" && types.length === 0) {
      setMessage({
        text: "Start by creating a character type. Then you can add your first character.",
      });
      setKind("characterType");
      setEditor({ type: "entity", kind: "characterType" });
    } else setEditor({ type: "entity", kind: nextKind });
  }

  async function confirmDelete() {
    if (!deletion) return;
    if (deletion.type === "entity" && deletion.entity.kind === "storyEvent") {
      setBusy(true);
      try {
        await deleteStoryEvent(
          user.id,
          deletion.entity.projectId,
          deletion.entity.id,
        );
        setDeletion(null);
        setMessage({ text: "Story event deleted." });
      } catch (error) {
        setMessage({
          text:
            error instanceof Error
              ? error.message
              : "Could not delete this event.",
          error: true,
        });
      } finally {
        setBusy(false);
      }
      return;
    }
    const result = await run(
      () =>
        deletion.type === "project"
          ? deleteProject(deletion.project.id)
          : deleteEntity(project!.id, deletion.entity.kind, deletion.entity.id),
      "Deleted successfully.",
    );
    if (result?.success) {
      setDeletion(null);
      if (deletion.type === "project" && project?.id === deletion.project.id)
        router.push("/");
    }
  }

  const filteredProjects = displayProjects
    .filter(
      (entry) =>
        (filter !== "favorites" || entry.favorite) &&
        `${entry.name} ${entry.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const filteredEntities = allEntries
    .filter(
      (entry) =>
        (kind === "overview" || entry.kind === kind) &&
        `${entry.name} ${entry.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Boxes size={24} />
          </span>
          <span>
            Narrative<span className="brand-light">Maker</span>
            <small>YOUR WORLDS. CONNECTED.</small>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div>
            {user.name.split(" ")[0]}’s workspace
            <small>Personal workspace</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Workspace navigation">
          <Link
            href="/"
            className={!project && filter === "all" ? "active" : ""}
            onClick={() => {
              setFilter("all");
              setQuery("");
              setSidebarOpen(false);
            }}
          >
            <LayoutGrid size={18} />
            All projects<span className="nav-count">{projects.length}</span>
          </Link>
          <Link
            href="/?view=favorites"
            className={!project && filter === "favorites" ? "active" : ""}
            onClick={() => {
              setFilter("favorites");
              setQuery("");
              setSidebarOpen(false);
            }}
          >
            <Star size={18} />
            Favorites
            <span className="nav-count">
              {projects.filter((entry) => entry.favorite).length}
            </span>
          </Link>
        </nav>
        <div className="nav-group-label recent-label">
          YOUR PROJECTS
          <button
            aria-label="Create a project"
            className="icon-button"
            onClick={() => setEditor({ type: "project" })}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="project-nav" aria-label="Your projects">
          {projects.length ? (
            projects.map((entry, index) => (
              <Link
                key={entry.id}
                href={`/projects/${entry.id}`}
                className={project?.id === entry.id ? "selected" : ""}
                onClick={() => {
                  setKind("overview");
                  setQuery("");
                  setSidebarOpen(false);
                }}
              >
                <span className={`project-dot dot-${index % 4}`} />
                {entry.name}
                {project?.id === entry.id && <ChevronRight size={13} />}
              </Link>
            ))
          ) : (
            <p className="nav-empty">Your worlds will appear here.</p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="creative-note">
            <Feather size={20} />
            <strong>Every world starts with an idea.</strong>
            <p>Make a little space for yours.</p>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            Workspace guide
            <ArrowRight size={14} />
          </button>
          <div className="user-profile">
            <span className="user-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>World builder</small>
            </span>
            <form action={signOut}>
              <button
                className="icon-button"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <FolderOpen size={16} />
            <Link href="/">Workspace</Link>
            <ChevronRight size={13} />
            <span>{project?.name ?? "All projects"}</span>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <span className="tiny-dot" />
              Your creative space
            </span>
            <button
              className="icon-button"
              aria-label="Open workspace guide"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main className="workspace-main">
          {project ? (
            <>
              <Link className="back-link" href="/">
                <ArrowLeft size={14} />
                All projects
              </Link>
              <section className="project-heading">
                <div>
                  <div className="section-kicker">
                    <span className={`status-badge ${project.status}`}>
                      {statusLabels[project.status]}
                    </span>
                    <span>PROJECT WORKSPACE</span>
                  </div>
                  <h1>{project.name}</h1>
                  <p>
                    {project.description ||
                      "An unwritten world, full of possibility."}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => setEditor({ type: "project", project })}
                  >
                    <Settings2 size={16} />
                    Edit project
                  </button>
                  <button
                    className="icon-button danger-hover"
                    aria-label="Delete project"
                    onClick={() => {
                      setMessage(null);
                      setDeletion({ type: "project", project });
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </section>
              <section className="entity-stats" aria-label="Project categories">
                {entityKinds.map((entryKind) => {
                  const Icon = icons[entryKind];
                  return (
                    <button
                      key={entryKind}
                      className={`entity-stat ${kind === entryKind ? "selected" : ""}`}
                      onClick={() => {
                        setKind(entryKind);
                        setQuery("");
                      }}
                    >
                      <span className={`category-icon ${entryKind}`}>
                        <Icon size={20} />
                      </span>
                      <span>
                        <strong>
                          {
                            allEntries.filter(
                              (entry) => entry.kind === entryKind,
                            ).length
                          }
                        </strong>
                        <small>{entityLabels[entryKind].plural}</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  );
                })}
              </section>
            </>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">THE NEXT CHAPTER IS YOURS</span>
                  <h1>
                    Your worlds, one workspace
                    <span className="accent-text">.</span>
                  </h1>
                  <p>
                    A home for your characters, your lore, and everything in
                    between.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setEditor({ type: "project" })}
                >
                  <Plus size={18} />
                  New project
                </button>
              </section>
              <section className="hero-banner">
                <div className="hero-copy">
                  <span className="hero-label">
                    <span className="tiny-dot" />
                    FROM FIRST SPARK TO LIVING WORLD
                  </span>
                  <h2>
                    Big worlds.
                    <br />
                    Small beginnings.
                  </h2>
                  <p>
                    That character you can’t stop thinking about?
                    <br />
                    The world that’s been waiting to happen?
                    <br />
                    This is where it all comes together.
                  </p>
                  <button
                    className="button hero-button"
                    onClick={() => setEditor({ type: "project" })}
                  >
                    Build your next world
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-coordinate">
                  <Compass size={16} />
                  <span>
                    IMAGINATION, UNLIMITED
                    <br />
                    <small>DISCOVER WHAT’S BEYOND THE HORIZON</small>
                  </span>
                </div>
              </section>
              <section className="workspace-stats">
                <span>
                  <Folder size={16} />
                  <strong>{projects.length}</strong>Projects
                </span>
                <span>
                  <Boxes size={16} />
                  <strong>{totalEntries}</strong>World entries
                </span>
                <span>
                  <Star size={16} />
                  <strong>
                    {projects.filter((entry) => entry.favorite).length}
                  </strong>
                  Favorites
                </span>
                <div>
                  <span className="tiny-dot" />
                  Ready for your next idea
                </div>
              </section>
            </>
          )}
          <section className="library-section">
            <div className="library-header">
              <div className="library-tabs">
                {project ? (
                  <>
                    <button
                      className={kind === "overview" ? "active" : ""}
                      onClick={() => {
                        setKind("overview");
                        setQuery("");
                      }}
                    >
                      All entries <span>{allEntries.length}</span>
                    </button>
                    {kind !== "overview" && (
                      <button className="active">
                        {entityLabels[kind].plural}{" "}
                        <span>
                          {
                            allEntries.filter((entry) => entry.kind === kind)
                              .length
                          }
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className={filter === "all" ? "active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      All projects <span>{projects.length}</span>
                    </button>
                    <button
                      className={filter === "favorites" ? "active" : ""}
                      onClick={() => setFilter("favorites")}
                    >
                      Favorites{" "}
                      <span>
                        {projects.filter((entry) => entry.favorite).length}
                      </span>
                    </button>
                  </>
                )}
              </div>
              {project && (
                <button
                  className="button primary small-button"
                  onClick={() =>
                    newEntity(kind === "overview" ? "character" : kind)
                  }
                >
                  <Plus size={16} />
                  New{" "}
                  {kind === "overview"
                    ? "character"
                    : entityLabels[kind].singular.toLowerCase()}
                </button>
              )}
            </div>
            <div className="library-toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label={project ? "Search entries" : "Search projects"}
                  placeholder={
                    project ? "Search your world…" : "Search projects…"
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <div className="toolbar-actions">
                <label className="sort-control">
                  <ArrowDownWideNarrow size={16} />
                  <select
                    aria-label="Sort by"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="recent">Last edited</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </label>
                <div className="view-toggle">
                  <button
                    className={view === "grid" ? "active" : ""}
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    className={view === "list" ? "active" : ""}
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
            </div>
            {stories.error && (
              <p className="form-error" role="alert">
                {stories.error}
              </p>
            )}
            {project && kind === "storyEvent" && (
              <p className="story-local-note story-library-note">
                Story events are saved to your account. Open an event to edit
                its sections and characters.
              </p>
            )}
            {project ? (
              <>
                {filteredEntities.length ? (
                  <div
                    className={`content-grid ${view === "list" ? "list-view" : ""}`}
                  >
                    {filteredEntities.map((entity) => (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        typeName={
                          types.find(
                            (type) => type.id === entity.characterTypeId,
                          )?.name
                        }
                        onOpen={() =>
                          entity.kind === "storyEvent"
                            ? router.push(
                                `/projects/${entity.projectId}/story-events/${entity.id}`,
                              )
                            : setDetails(entity)
                        }
                        onEdit={() =>
                          entity.kind === "storyEvent"
                            ? router.push(
                                `/projects/${entity.projectId}/story-events/${entity.id}`,
                              )
                            : setEditor({
                                type: "entity",
                                kind: entity.kind,
                                entity,
                              })
                        }
                        onDelete={() => {
                          setMessage(null);
                          setDeletion({ type: "entity", entity });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={kind === "overview" ? BookOpen : icons[kind]}
                    title={
                      query
                        ? "No entries found"
                        : kind === "overview"
                          ? "Your world is a blank canvas"
                          : `Your ${entityLabels[kind].plural.toLowerCase()} start here`
                    }
                    description={
                      query
                        ? "Try another name or a different search term."
                        : kind === "overview"
                          ? "Begin with a character type, then add the cast, places, and objects that make your world unique."
                          : entityLabels[kind].description
                    }
                  >
                    {!query && (
                      <button
                        className="button primary"
                        onClick={() =>
                          newEntity(
                            kind === "overview" ? "characterType" : kind,
                          )
                        }
                      >
                        <Plus size={16} />
                        Create{" "}
                        {kind === "overview"
                          ? "character type"
                          : entityLabels[kind].singular.toLowerCase()}
                      </button>
                    )}
                  </EmptyState>
                )}
              </>
            ) : (
              <>
                {filteredProjects.length ? (
                  <div
                    className={`content-grid project-grid ${view === "list" ? "list-view" : ""}`}
                  >
                    {filteredProjects.map((entry) => (
                      <ProjectCard
                        key={entry.id}
                        project={entry}
                        busy={busy}
                        onFavorite={() =>
                          void run(() => toggleFavorite(entry.id))
                        }
                        onEdit={() =>
                          setEditor({ type: "project", project: entry })
                        }
                        onDelete={() => {
                          setMessage(null);
                          setDeletion({ type: "project", project: entry });
                        }}
                      />
                    ))}
                    {view === "grid" && !query && filter === "all" && (
                      <button
                        className="new-project-tile"
                        onClick={() => setEditor({ type: "project" })}
                      >
                        <span>
                          <Plus size={24} />
                        </span>
                        <strong>A new world awaits</strong>
                        <p>Start with an idea. See where it takes you.</p>
                        <small>
                          Create project <ArrowRight size={14} />
                        </small>
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={filter === "favorites" ? Star : Compass}
                    title={
                      query
                        ? "No projects found"
                        : filter === "favorites"
                          ? "Keep your favorite worlds close"
                          : "Your first world is waiting"
                    }
                    description={
                      query
                        ? "Try a different name or clear your search."
                        : filter === "favorites"
                          ? "Star a project to give it a place here."
                          : "Start from a blank canvas, or explore a sample world to see what’s possible."
                    }
                  >
                    {!query && filter === "all" && (
                      <div className="empty-actions">
                        <button
                          className="button primary"
                          onClick={() => setEditor({ type: "project" })}
                        >
                          <Plus size={16} />
                          Create your first project
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={async () => {
                            const result = await run(createExample);
                            if (result?.id)
                              router.push(`/projects/${result.id}`);
                          }}
                        >
                          <Sparkles size={16} />
                          {busy ? "Creating…" : "Explore a sample world"}
                        </button>
                      </div>
                    )}
                  </EmptyState>
                )}
              </>
            )}
          </section>
          <footer className="workspace-footer">
            <span>
              <Feather size={14} />
              Made for the stories only you can tell.
            </span>
            <span>
              NARRATIVE MAKER <span className="footer-version">v0.1</span>
            </span>
          </footer>
        </main>
      </div>
      {message && !deletion && (
        <div
          className={`toast ${message.error ? "error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.error ? <CircleHelp size={17} /> : <Check size={17} />}
          <span>{message.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editor &&
        (editor.type === "entity" && editor.kind === "storyEvent" ? (
          project && (
            <StoryEventForm
              key={editor.entity?.id ?? "new-story-event"}
              userId={user.id}
              projectId={project.id}
              onClose={() => setEditor(null)}
            />
          )
        ) : (
          <EditorForm
            key={
              editor.type === "project"
                ? (editor.project?.id ?? "new-project")
                : (editor.entity?.id ?? editor.kind)
            }
            project={editor.type === "project" ? editor.project : undefined}
            entity={editor.type === "entity" ? editor.entity : undefined}
            kind={editor.type === "entity" ? editor.kind : undefined}
            projectId={project?.id}
            types={types}
            onClose={() => setEditor(null)}
          />
        ))}
      {deletion && (
        <Modal
          title={`Delete ${deletion.type === "project" ? "project" : entityLabels[deletion.entity.kind].singular.toLowerCase()}?`}
          onClose={() => setDeletion(null)}
          busy={busy}
        >
          <p className="delete-description">
            “
            {deletion.type === "project"
              ? deletion.project.name
              : deletion.entity.name}
            ” will be permanently deleted.
            {deletion.type === "project" &&
              " All characters, regions, items, character types, and story events will also be deleted."}{" "}
            This cannot be undone.
          </p>
          {message?.error && (
            <p role="alert" className="form-error">
              {message.text}
            </p>
          )}
          <footer className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeletion(null)}
            >
              Keep it
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={confirmDelete}
            >
              <Trash2 size={16} />
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </footer>
        </Modal>
      )}
      {details && (
        <Modal
          title={details.name}
          subtitle={entityLabels[details.kind].singular}
          onClose={() => setDetails(null)}
        >
          {details.image && (
            <img
              loading="lazy"
              className="detail-image"
              src={details.image}
              alt={details.name}
            />
          )}
          {details.characterTypeId && (
            <span className="type-tag">
              {types.find((type) => type.id === details.characterTypeId)?.name}
            </span>
          )}
          <p className="detail-description">
            {details.description ||
              "No description yet. Every detail starts with an idea."}
          </p>
          <footer className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                setEditor({
                  type: "entity",
                  kind: details.kind,
                  entity: details,
                });
                setDetails(null);
              }}
            >
              <Pencil size={15} />
              Edit {entityLabels[details.kind].singular.toLowerCase()}
            </button>
          </footer>
        </Modal>
      )}
      {help && (
        <Modal
          title="A place for your next world"
          subtitle="A quick guide to your creative workspace."
          onClose={() => setHelp(false)}
        >
          <div className="guide-content">
            <p>
              <strong>1. Start a project</strong>Each project is a separate game
              or narrative universe. Give it a name, a description, and an
              optional cover.
            </p>
            <p>
              <strong>2. Define your cast</strong>Create character types first —
              human, animal, supernatural — then assign each character to a
              type.
            </p>
            <p>
              <strong>3. Build the world around them</strong>Add regions and
              items. Every entry supports a name, description, and image. Click
              a card to read its full story.
            </p>
            <p>
              <strong>4. Make it your own</strong>Edit freely, star your
              favorite projects, and use search to find your ideas. Changes are
              saved when you submit a form.
            </p>
          </div>
          <footer className="modal-actions">
            <button className="button primary" onClick={() => setHelp(false)}>
              Let’s build something
              <ArrowRight size={16} />
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  busy,
  onFavorite,
  onEdit,
  onDelete,
}: {
  project: Project;
  busy: boolean;
  onFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="project-card">
      <div className="project-cover">
        {project.image ? (
          <img
            loading="lazy"
            src={
              project.image.startsWith("/api/images/")
                ? `${project.image}?thumbnail=1`
                : project.image
            }
            alt=""
          />
        ) : (
          <div className="cover-placeholder">
            <Compass size={64} />
            <span>AN UNWRITTEN WORLD</span>
          </div>
        )}
        <span className={`status-badge ${project.status}`}>
          {statusLabels[project.status]}
        </span>
        <button
          className={`favorite-button ${project.favorite ? "is-favorite" : ""}`}
          aria-label={`${project.favorite ? "Unfavorite" : "Favorite"} ${project.name}`}
          aria-pressed={project.favorite}
          disabled={busy}
          onClick={onFavorite}
        >
          <Star size={17} fill={project.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="project-card-body">
        <div className="card-title-row">
          <h3>
            <Link href={`/projects/${project.id}`}>{project.name}</Link>
          </h3>
          <CardMenu onEdit={onEdit} onDelete={onDelete} name={project.name} />
        </div>
        <p>
          {project.description ||
            "Every great adventure begins with a single idea."}
        </p>
        <div className="card-meta">
          <span>
            <Boxes size={13} />
            {project.entityCount} entries
          </span>
          <span>{formatDate(project.updatedAt)}</span>
        </div>
      </div>
      <Link className="card-open" href={`/projects/${project.id}`}>
        Open project
        <ArrowRight size={15} />
      </Link>
    </article>
  );
}

function EntityCard({
  entity,
  typeName,
  onOpen,
  onEdit,
  onDelete,
}: {
  entity: NarrativeEntity;
  typeName?: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = icons[entity.kind];
  return (
    <article className="entity-card">
      <button
        className={`entity-cover ${entity.kind}`}
        onClick={onOpen}
        aria-label={`View ${entity.name}`}
      >
        {entity.image ? (
          <img
            loading="lazy"
            src={
              entity.image.startsWith("/api/images/")
                ? `${entity.image}?thumbnail=1`
                : entity.image
            }
            alt=""
          />
        ) : (
          <div className="entity-art">
            <Icon size={48} strokeWidth={1} />
            <span>{entityLabels[entity.kind].singular.toUpperCase()}</span>
          </div>
        )}
        <span className="entity-kind-tag">
          <Icon size={12} />
          {entityLabels[entity.kind].singular}
        </span>
      </button>
      <div className="entity-card-body">
        <div className="card-title-row">
          <h3>
            <button onClick={onOpen}>{entity.name}</button>
          </h3>
          <CardMenu name={entity.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
        {typeName && <span className="type-tag">{typeName}</span>}
        <p>{entity.description || "A new story is taking shape."}</p>
        <div className="card-meta">
          <span>{formatDate(entity.updatedAt)}</span>
          <button className="text-button" onClick={onOpen}>
            {entity.kind === "storyEvent" ? "Open editor" : "View details"}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

function CardMenu({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="card-menu">
      <summary
        role="button"
        className="icon-button"
        aria-label={`Actions for ${name}`}
      >
        <MoreHorizontal size={19} />
      </summary>
      <div className="dropdown-menu">
        <button
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onEdit();
          }}
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          className="danger-text"
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onDelete();
          }}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </details>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={30} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
