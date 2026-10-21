import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openDatabase(
  filename = process.env.DATABASE_PATH || "./data/narrative-maker.db",
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(/* turbopackIgnore: true */ filename)), {
      recursive: true,
    });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  // Add versioned migrations here as the domain grows. Never drop user data on startup.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_attempts (
      email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT,
      status TEXT NOT NULL DEFAULT 'concept' CHECK(status IN ('concept','in-progress','completed')),
      favorite INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS character_types (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(id, project_id)
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('character','region','item')),
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT, character_type_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      CHECK((kind = 'character' AND character_type_id IS NOT NULL) OR (kind != 'character' AND character_type_id IS NULL)),
      FOREIGN KEY(character_type_id, project_id) REFERENCES character_types(id, project_id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS entities_project ON entities(project_id);
    CREATE INDEX IF NOT EXISTS types_project ON character_types(project_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  return db;
}

const globalDatabase = globalThis as unknown as {
  narrativeDatabase?: Database.Database;
};
export function getDatabase() {
  return (globalDatabase.narrativeDatabase ??= openDatabase());
}
