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
  const repository = new NarrativeRepository(await getDatabase());
  const project = (await repository.listProjects(user.id)).find(
    (entry) => entry.id === projectId,
  );
  if (!project) notFound();
  const characters = (await repository.listEntities(user.id, projectId)).filter(
    (entry) => entry.kind === "character",
  );
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
