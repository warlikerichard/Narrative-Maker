import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { NarrativeRepository } from "@/lib/repository";
import { Workspace } from "@/components/workspace";

export const runtime = "nodejs";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const projects = new NarrativeRepository(getDatabase()).listProjects(user.id);
  const { view } = await searchParams;
  return (
    <Workspace
      user={user}
      projects={projects}
      initialFilter={view === "favorites" ? "favorites" : "all"}
    />
  );
}
