import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { NarrativeRepository } from "@/lib/repository";
import { StoryEventEditor } from "@/components/story-event-editor";

export const runtime = "nodejs";

export default async function StoryEventPage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const user = await requireUser();
  const { projectId, eventId } = await params;
  const repository = new NarrativeRepository(getDatabase());
  const project = repository
    .listProjects(user.id)
    .find((entry) => entry.id === projectId);
  if (!project) notFound();
  // Only existing project/character data is read from SQLite. Events remain in the browser.
  const characters = repository
    .listEntities(user.id, projectId)
    .filter((entry) => entry.kind === "character");
  return (
    <StoryEventEditor
      key={`${user.id}:${projectId}:${eventId}`}
      userId={user.id}
      project={project}
      eventId={eventId}
      characters={characters}
    />
  );
}
