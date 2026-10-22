import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EntityKind,
  NarrativeEntity,
  Project,
  ProjectStatus,
} from "./types";
import { cleanupImages } from "./images";
type ProjectInput = {
  name: string;
  description: string;
  status: ProjectStatus;
  image?: string | null;
};
type EntityInput = {
  kind: EntityKind;
  name: string;
  description: string;
  characterTypeId: string | null;
  image?: string | null;
};
const projectColumns =
  "id,name,description,image,status,favorite,updatedAt:updated_at,entities(count),character_types(count)";
export class NarrativeRepository {
  constructor(private db: SupabaseClient) {}
  async listProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.db
      .from("projects")
      .select(projectColumns)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(({ entities, character_types, ...row }) => ({
      ...row,
      entityCount: entities[0].count + character_types[0].count,
    })) as Project[];
  }
  async requireProject(userId: string, id: string) {
    const project = (await this.listProjects(userId)).find((p) => p.id === id);
    if (!project) throw new Error("Project not found.");
    return project;
  }
  async saveProject(userId: string, input: ProjectInput, id?: string) {
    if (id) await this.requireProject(userId, id);
    const query = id
      ? this.db
          .from("projects")
          .update(input)
          .eq("id", id)
          .eq("user_id", userId)
      : this.db.from("projects").insert({ ...input, user_id: userId });
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    await cleanupImages(this.db);
    return data.id as string;
  }
  async toggleFavorite(userId: string, id: string) {
    const p = await this.requireProject(userId, id);
    const { error } = await this.db
      .from("projects")
      .update({ favorite: !p.favorite })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }
  async deleteProject(userId: string, id: string) {
    await this.requireProject(userId, id);
    const { error } = await this.db
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    await cleanupImages(this.db);
  }
  async listEntities(
    userId: string,
    projectId: string,
  ): Promise<NarrativeEntity[]> {
    await this.requireProject(userId, projectId);
    const columns =
      "id,projectId:project_id,name,description,image,updatedAt:updated_at";
    const [entities, types] = await Promise.all([
      this.db
        .from("entities")
        .select(`${columns},kind,characterTypeId:character_type_id`)
        .eq("project_id", projectId),
      this.db
        .from("character_types")
        .select(columns)
        .eq("project_id", projectId),
    ]);
    if (entities.error) throw entities.error;
    if (types.error) throw types.error;
    return [
      ...entities.data,
      ...types.data.map((row) => ({
        ...row,
        kind: "characterType",
        characterTypeId: null,
      })),
    ].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ) as NarrativeEntity[];
  }
  async saveEntity(
    userId: string,
    projectId: string,
    input: EntityInput,
    id?: string,
  ) {
    const entries = await this.listEntities(userId, projectId);
    if (input.kind === "storyEvent")
      throw new Error("Use the story event editor.");
    if (id && !entries.some((e) => e.id === id && e.kind === input.kind))
      throw new Error("Entry not found.");
    if (
      input.kind === "character" &&
      !entries.some(
        (e) => e.id === input.characterTypeId && e.kind === "characterType",
      )
    )
      throw new Error("Choose a character type from this project.");
    const table =
      input.kind === "characterType" ? "character_types" : "entities";
    const row = {
      name: input.name,
      description: input.description,
      image: input.image,
      ...(table === "entities"
        ? {
            kind: input.kind,
            character_type_id:
              input.kind === "character" ? input.characterTypeId : null,
          }
        : {}),
    };
    const query = id
      ? this.db.from(table).update(row).eq("id", id).eq("project_id", projectId)
      : this.db.from(table).insert({ ...row, project_id: projectId });
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    await cleanupImages(this.db);
    return data.id as string;
  }
  async deleteEntity(
    userId: string,
    projectId: string,
    kind: EntityKind,
    id: string,
  ) {
    const entries = await this.listEntities(userId, projectId);
    if (!entries.some((e) => e.id === id && e.kind === kind))
      throw new Error("Entry not found.");
    if (
      kind === "characterType" &&
      entries.some((e) => e.characterTypeId === id)
    )
      throw new Error(
        "This type is used by a character. Reassign or delete those characters first.",
      );
    const { error } = await this.db
      .from(kind === "characterType" ? "character_types" : "entities")
      .delete()
      .eq("id", id)
      .eq("project_id", projectId);
    if (error) throw error;
    await cleanupImages(this.db);
  }
  async createExample(userId: string) {
    const projectId = await this.saveProject(userId, {
      name: "Echoes of Aether",
      description:
        "Above an endless sea of clouds, the last floating islands are losing their light. Follow a young cartographer on a journey to discover what holds this fractured world together.",
      status: "in-progress",
      image: "/art/aether.svg",
    });
    const humanId = await this.saveEntity(userId, projectId, {
      kind: "characterType",
      name: "Human",
      description:
        "Resourceful inhabitants of the floating archipelago. Their curiosity is both their greatest gift and their greatest danger.",
      characterTypeId: null,
    });
    await this.saveEntity(userId, projectId, {
      kind: "characterType",
      name: "Spirit",
      description: "Echoes of the old world, bound to places and memories.",
      characterTypeId: null,
    });
    await this.saveEntity(userId, projectId, {
      kind: "character",
      name: "Lyra Ashwind",
      description:
        "A restless cartographer with a broken compass and a gift for finding paths that should not exist. She is searching for the island that vanished with her father.",
      characterTypeId: humanId,
    });
    await this.saveEntity(userId, projectId, {
      kind: "character",
      name: "Orin Vale",
      description:
        "A former skyship captain who now repairs clocks. He remembers the day the stars went silent, but refuses to say why.",
      characterTypeId: humanId,
    });
    await this.saveEntity(userId, projectId, {
      kind: "region",
      name: "The Verdant Reach",
      description:
        "Ancient forests reclaim the ruins of an observatory. At dusk, the roots glow with the same light as the stars.",
      image: "/art/forest.svg",
      characterTypeId: null,
    });
    await this.saveEntity(userId, projectId, {
      kind: "region",
      name: "Hollow Peaks",
      description:
        "A chain of suspended mountains connected by forgotten bridges. The wind carries voices from the valleys below.",
      image: "/art/aether.svg",
      characterTypeId: null,
    });
    await this.saveEntity(userId, projectId, {
      kind: "item",
      name: "The Wayfinder",
      description:
        "A brass compass that points toward what its holder has lost. Its needle has not moved in twenty years.",
      characterTypeId: null,
    });
    return projectId;
  }
}
