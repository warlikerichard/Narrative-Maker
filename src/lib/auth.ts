import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "./database";
import type { User } from "./types";

const scrypt = promisify(scryptCallback);
const cookieName = "narrative-session";
const sessionDuration = 60 * 60 * 24 * 7;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export function consumeAuthAttempt(email: string) {
  const db = getDatabase();
  const now = Date.now();
  db.prepare("DELETE FROM auth_attempts WHERE resets_at < ?").run(now);
  const attempt = db
    .prepare("SELECT attempts FROM auth_attempts WHERE email=?")
    .get(email) as { attempts: number } | undefined;
  if (attempt && attempt.attempts >= 10)
    throw new Error("Too many attempts. Please try again in 15 minutes.");
  db.prepare(
    "INSERT INTO auth_attempts(email, attempts, resets_at) VALUES(?, 1, ?) ON CONFLICT(email) DO UPDATE SET attempts=attempts+1",
  ).run(email, now + 15 * 60 * 1000);
}

export async function startSession(userId: string) {
  const db = getDatabase();
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  if (previous)
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(previous));
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(digest(token), userId, Date.now() + sessionDuration * 1000);
  jar.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionDuration,
  });
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  return (
    (getDatabase()
      .prepare(
        "SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(digest(token), Date.now()) as User | undefined) ?? null
  );
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    getDatabase()
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(digest(token));
  jar.delete(cookieName);
}

export async function createUser(
  name: string,
  email: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  try {
    getDatabase()
      .prepare("INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)")
      .run(id, name, email, passwordHash);
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE")
      throw new Error(
        "Unable to create an account with this email. Try signing in.",
      );
    throw error;
  }
  return id;
}
