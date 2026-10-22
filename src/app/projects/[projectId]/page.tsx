import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { NarrativeRepository } from "@/lib/repository";
import { Workspace } from "@/components/workspace";

export const runtime = "nodejs";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const repository = new NarrativeRepository(await getDatabase());
  const projects = await repository.listProjects(user.id);
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) notFound();
  return (
    <Workspace
      key={project.id}
      user={user}
      projects={projects}
      project={project}
      entities={await repository.listEntities(user.id, projectId)}
    />
  );
}
