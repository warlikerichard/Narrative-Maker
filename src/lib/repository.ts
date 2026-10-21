import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  EntityKind,
  NarrativeEntity,
  Project,
  ProjectStatus,
} from "./types";

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
const projectColumns = `p.id, p.name, p.description, p.image, p.status, p.favorite, p.updated_at AS updatedAt,
  ((SELECT count(*) FROM entities e WHERE e.project_id=p.id) + (SELECT count(*) FROM character_types t WHERE t.project_id=p.id)) AS entityCount`;

export class NarrativeRepository {
  constructor(private db: Database.Database) {}

  listProjects(userId: string): Project[] {
    const rows = this.db
      .prepare(
        `SELECT ${projectColumns} FROM projects p WHERE p.user_id=? ORDER BY p.updated_at DESC`,
      )
      .all(userId) as Project[];
    return rows.map((row) => ({ ...row, favorite: Boolean(row.favorite) }));
  }

  requireProject(userId: string, projectId: string): Project {
    const project = this.db
      .prepare(
        `SELECT ${projectColumns} FROM projects p WHERE p.id=? AND p.user_id=?`,
      )
      .get(projectId, userId) as Project | undefined;
    if (!project) throw new Error("Project not found.");
    return { ...project, favorite: Boolean(project.favorite) };
  }

  saveProject(userId: string, input: ProjectInput, id?: string) {
    if (id) {
      const previous = this.requireProject(userId, id);
      this.db
        .prepare(
          `UPDATE projects SET name=?, description=?, status=?, image=?, updated_at=? WHERE id=? AND user_id=?`,
        )
        .run(
          input.name,
          input.description,
          input.status,
          input.image === undefined ? previous.image : input.image,
          new Date().toISOString(),
          id,
          userId,
        );
    } else {
      id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO projects(id,user_id,name,description,status,image) VALUES(?,?,?,?,?,?)`,
        )
        .run(
          id,
          userId,
          input.name,
          input.description,
          input.status,
          input.image ?? null,
        );
    }
    return id;
  }

  toggleFavorite(userId: string, projectId: string) {
    this.requireProject(userId, projectId);
    this.db
      .prepare(
        "UPDATE projects SET favorite=1-favorite WHERE id=? AND user_id=?",
      )
      .run(projectId, userId);
  }

  deleteProject(userId: string, projectId: string) {
    this.requireProject(userId, projectId);
    this.db.transaction(() => {
      // Delete dependent characters first so RESTRICT still protects types during normal editing.
      this.db.prepare("DELETE FROM entities WHERE project_id=?").run(projectId);
      this.db
        .prepare("DELETE FROM projects WHERE id=? AND user_id=?")
        .run(projectId, userId);
    })();
  }

  listEntities(userId: string, projectId: string): NarrativeEntity[] {
    this.requireProject(userId, projectId);
    return this.db
      .prepare(
        `
      SELECT id, project_id AS projectId, kind, name, description, image, character_type_id AS characterTypeId, updated_at AS updatedAt FROM entities WHERE project_id=?
      UNION ALL
      SELECT id, project_id AS projectId, 'characterType' AS kind, name, description, image, NULL AS characterTypeId, updated_at AS updatedAt FROM character_types WHERE project_id=?
      ORDER BY updatedAt DESC
    `,
      )
      .all(projectId, projectId) as NarrativeEntity[];
  }

  saveEntity(
    userId: string,
    projectId: string,
    input: EntityInput,
    id?: string,
  ) {
    this.requireProject(userId, projectId);
    return this.db.transaction(() => {
      if (input.kind === "character") {
        const type = this.db
          .prepare("SELECT id FROM character_types WHERE id=? AND project_id=?")
          .get(input.characterTypeId, projectId);
        if (!type)
          throw new Error("Choose a character type from this project.");
      }
      const table =
        input.kind === "characterType" ? "character_types" : "entities";
      const previous = id
        ? (this.db
            .prepare(
              `SELECT image${table === "entities" ? ", kind" : ""} FROM ${table} WHERE id=? AND project_id=?`,
            )
            .get(id, projectId) as
            { image: string | null; kind?: EntityKind } | undefined)
        : undefined;
      if (id && (!previous || (previous.kind && previous.kind !== input.kind)))
        throw new Error("Entry not found.");
      const image =
        input.image === undefined ? (previous?.image ?? null) : input.image;
      const timestamp = new Date().toISOString();
      const typeId = input.kind === "character" ? input.characterTypeId : null;
      if (id) {
        if (table === "character_types")
          this.db
            .prepare(
              "UPDATE character_types SET name=?, description=?, image=?, updated_at=? WHERE id=? AND project_id=?",
            )
            .run(
              input.name,
              input.description,
              image,
              timestamp,
              id,
              projectId,
            );
        else
          this.db
            .prepare(
              "UPDATE entities SET name=?, description=?, image=?, character_type_id=?, updated_at=? WHERE id=? AND project_id=?",
            )
            .run(
              input.name,
              input.description,
              image,
              typeId,
              timestamp,
              id,
              projectId,
            );
      } else {
        id = randomUUID();
        if (table === "character_types")
          this.db
            .prepare(
              "INSERT INTO character_types(id,project_id,name,description,image) VALUES(?,?,?,?,?)",
            )
            .run(id, projectId, input.name, input.description, image);
        else
          this.db
            .prepare(
              "INSERT INTO entities(id,project_id,kind,name,description,image,character_type_id) VALUES(?,?,?,?,?,?,?)",
            )
            .run(
              id,
              projectId,
              input.kind,
              input.name,
              input.description,
              image,
              typeId,
            );
      }
      this.db
        .prepare("UPDATE projects SET updated_at=? WHERE id=?")
        .run(timestamp, projectId);
      return id;
    })();
  }

  deleteEntity(
    userId: string,
    projectId: string,
    kind: EntityKind,
    id: string,
  ) {
    this.requireProject(userId, projectId);
    this.db.transaction(() => {
      if (
        kind === "characterType" &&
        this.db
          .prepare(
            "SELECT id FROM entities WHERE character_type_id=? AND project_id=? LIMIT 1",
          )
          .get(id, projectId)
      ) {
        throw new Error(
          "This type is used by a character. Reassign or delete those characters first.",
        );
      }
      const result =
        kind === "characterType"
          ? this.db
              .prepare(
                "DELETE FROM character_types WHERE id=? AND project_id=?",
              )
              .run(id, projectId)
          : this.db
              .prepare(
                "DELETE FROM entities WHERE id=? AND project_id=? AND kind=?",
              )
              .run(id, projectId, kind);
      if (!result.changes) throw new Error("Entry not found.");
      this.db
        .prepare("UPDATE projects SET updated_at=? WHERE id=?")
        .run(new Date().toISOString(), projectId);
    })();
  }

  createExample(userId: string) {
    return this.db.transaction(() => {
      const projectId = this.saveProject(userId, {
        name: "Echoes of Aether",
        description:
          "Above an endless sea of clouds, the last floating islands are losing their light. Follow a young cartographer on a journey to discover what holds this fractured world together.",
        status: "in-progress",
        image: "/art/aether.svg",
      });
      const humanId = this.saveEntity(userId, projectId, {
        kind: "characterType",
        name: "Human",
        description:
          "Resourceful inhabitants of the floating archipelago. Their curiosity is both their greatest gift and their greatest danger.",
        characterTypeId: null,
      });
      this.saveEntity(userId, projectId, {
        kind: "characterType",
        name: "Spirit",
        description: "Echoes of the old world, bound to places and memories.",
        characterTypeId: null,
      });
      this.saveEntity(userId, projectId, {
        kind: "character",
        name: "Lyra Ashwind",
        description:
          "A restless cartographer with a broken compass and a gift for finding paths that should not exist. She is searching for the island that vanished with her father.",
        characterTypeId: humanId,
      });
      this.saveEntity(userId, projectId, {
        kind: "character",
        name: "Orin Vale",
        description:
          "A former skyship captain who now repairs clocks. He remembers the day the stars went silent, but refuses to say why.",
        characterTypeId: humanId,
      });
      this.saveEntity(userId, projectId, {
        kind: "region",
        name: "The Verdant Reach",
        description:
          "Ancient forests reclaim the ruins of an observatory. At dusk, the roots glow with the same light as the stars.",
        image: "/art/forest.svg",
        characterTypeId: null,
      });
      this.saveEntity(userId, projectId, {
        kind: "region",
        name: "Hollow Peaks",
        description:
          "A chain of suspended mountains connected by forgotten bridges. The wind carries voices from the valleys below.",
        image: "/art/aether.svg",
        characterTypeId: null,
      });
      this.saveEntity(userId, projectId, {
        kind: "item",
        name: "The Wayfinder",
        description:
          "A brass compass that points toward what its holder has lost. Its needle has not moved in twenty years.",
        characterTypeId: null,
      });
      return projectId;
    })();
  }
}
