import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/lib/database";
import { NarrativeRepository } from "../src/lib/repository";
import { entitySchema, readImage } from "../src/lib/validation";

function fixture() {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users(id,name,email,password_hash) VALUES('alice','Alice','alice@example.com','hash'),('bob','Bob','bob@example.com','hash')",
  ).run();
  const repository = new NarrativeRepository(db);
  const projectId = repository.saveProject("alice", {
    name: "First world",
    description: "A test world",
    status: "concept",
  });
  return { db, repository, projectId };
}

test("project CRUD is isolated by user and persists entity counts", () => {
  const { db, repository, projectId } = fixture();
  try {
    assert.equal(repository.listProjects("alice").length, 1);
    assert.equal(repository.listProjects("bob").length, 0);
    assert.throws(
      () => repository.requireProject("bob", projectId),
      /not found/,
    );
    assert.throws(
      () =>
        repository.saveProject(
          "bob",
          { name: "Stolen", description: "", status: "concept" },
          projectId,
        ),
      /not found/,
    );
    assert.throws(
      () => repository.deleteProject("bob", projectId),
      /not found/,
    );
    assert.throws(() => repository.listEntities("bob", projectId), /not found/);
    repository.toggleFavorite("alice", projectId);
    assert.equal(repository.requireProject("alice", projectId).favorite, true);
    repository.saveProject(
      "alice",
      {
        name: "Updated",
        description: "New description",
        status: "in-progress",
      },
      projectId,
    );
    assert.equal(repository.requireProject("alice", projectId).name, "Updated");
    repository.deleteProject("alice", projectId);
    assert.equal(repository.listProjects("alice").length, 0);
  } finally {
    db.close();
  }
});

test("characters require a type from their own project; referenced types cannot be deleted", () => {
  const { db, repository, projectId } = fixture();
  try {
    const otherId = repository.saveProject("alice", {
      name: "Second world",
      description: "",
      status: "concept",
    });
    const typeId = repository.saveEntity("alice", projectId, {
      kind: "characterType",
      name: "Human",
      description: "",
      characterTypeId: null,
    });
    const character = {
      kind: "character" as const,
      name: "Lyra",
      description: "",
      characterTypeId: typeId,
    };
    assert.equal(
      entitySchema.safeParse({ ...character, characterTypeId: null }).success,
      false,
    );
    assert.throws(
      () => repository.saveEntity("alice", otherId, character),
      /from this project/,
    );
    assert.throws(
      () => repository.saveEntity("bob", projectId, character),
      /not found/,
    );
    const characterId = repository.saveEntity("alice", projectId, character);
    assert.equal(repository.requireProject("alice", projectId).entityCount, 2);
    assert.throws(
      () =>
        repository.deleteEntity("alice", projectId, "characterType", typeId),
      /used by a character/,
    );
    // The database also enforces the relation even when bypassing the repository.
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO entities(id,project_id,kind,name,character_type_id) VALUES('invalid',?,'character','Invalid',?)",
          )
          .run(otherId, typeId),
      /FOREIGN KEY/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO entities(id,project_id,kind,name) VALUES('invalid',?,'character','Invalid')",
          )
          .run(projectId),
      /CHECK/,
    );
    repository.deleteEntity("alice", projectId, "character", characterId);
    repository.deleteEntity("alice", projectId, "characterType", typeId);
    assert.equal(repository.listEntities("alice", projectId).length, 0);
  } finally {
    db.close();
  }
});

test("entity updates preserve images and cannot cross projects or change kinds", () => {
  const { db, repository, projectId } = fixture();
  try {
    const input = {
      kind: "region" as const,
      name: "Forest",
      description: "Misty",
      characterTypeId: null,
    };
    const id = repository.saveEntity("alice", projectId, {
      ...input,
      image: "data:image/png;base64,test",
    });
    repository.saveEntity(
      "alice",
      projectId,
      { ...input, name: "Ancient forest" },
      id,
    );
    assert.equal(
      repository.listEntities("alice", projectId)[0].image,
      "data:image/png;base64,test",
    );
    assert.throws(
      () =>
        repository.saveEntity(
          "alice",
          projectId,
          { ...input, kind: "item" },
          id,
        ),
      /not found/,
    );
    repository.saveEntity("alice", projectId, { ...input, image: null }, id);
    assert.equal(repository.listEntities("alice", projectId)[0].image, null);
    const otherId = repository.saveProject("alice", {
      name: "Other",
      description: "",
      status: "concept",
    });
    assert.throws(
      () => repository.saveEntity("alice", otherId, input, id),
      /not found/,
    );
    assert.throws(
      () => repository.deleteEntity("bob", projectId, "region", id),
      /not found/,
    );
  } finally {
    db.close();
  }
});

test("deleting a sample project cascades all dependent content", () => {
  const { db, repository } = fixture();
  try {
    const id = repository.createExample("alice");
    assert.equal(repository.listEntities("alice", id).length, 7);
    repository.deleteProject("alice", id);
    assert.equal(
      (
        db
          .prepare("SELECT count(*) AS count FROM entities WHERE project_id=?")
          .get(id) as { count: number }
      ).count,
      0,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT count(*) AS count FROM character_types WHERE project_id=?",
          )
          .get(id) as { count: number }
      ).count,
      0,
    );
  } finally {
    db.close();
  }
});

test("image uploads reject oversized files and disguised executable markup", async () => {
  const form = new FormData();
  form.set(
    "image",
    new File(["<svg onload='alert(1)'/>"], "photo.png", { type: "image/png" }),
  );
  await assert.rejects(readImage(form), /PNG, JPEG, or WebP/);
  form.set(
    "image",
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    }),
  );
  await assert.rejects(readImage(form), /smaller than 2 MB/);
  form.delete("image");
  assert.equal(await readImage(form), undefined);
  form.set("removeImage", "true");
  assert.equal(await readImage(form), null);
});
