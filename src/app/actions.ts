"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  consumeAuthAttempt,
  createUser,
  endSession,
  requireUser,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import { NarrativeRepository } from "@/lib/repository";
import {
  entitySchema,
  projectSchema,
  readImage,
  registrationSchema,
} from "@/lib/validation";
import { entityKinds, type ActionResult, type EntityKind } from "@/lib/types";

function errorResult(error: unknown): ActionResult {
  if (error instanceof ZodError) return { error: error.issues[0].message };
  if (error instanceof Error && !("code" in error))
    return { error: error.message };
  console.error("Narrative Maker action failed:", error);
  return { error: "Something went wrong. Please try again." };
}

export async function authenticate(
  mode: "login" | "register",
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  let userId: string;
  try {
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") || "");
    if (!email || email.length > 254 || !password || password.length > 128)
      return { error: "Enter a valid email and password." };
    consumeAuthAttempt(email);
    if (mode === "register") {
      const data = registrationSchema.parse({
        name: form.get("name"),
        email,
        password,
      });
      userId = await createUser(data.name, data.email, data.password);
    } else {
      const user = getDatabase()
        .prepare("SELECT id,password_hash FROM users WHERE email=?")
        .get(email) as { id: string; password_hash: string } | undefined;
      // Perform the same expensive hash operation for unknown accounts.
      const valid = await verifyPassword(
        password,
        user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
      );
      if (!user || !valid)
        return { error: "The email or password is incorrect." };
      userId = user.id;
    }
    await startSession(userId);
    getDatabase().prepare("DELETE FROM auth_attempts WHERE email=?").run(email);
  } catch (error) {
    return errorResult(error);
  }
  redirect("/");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

export async function saveProject(form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = projectSchema.parse({
      name: form.get("name"),
      description: form.get("description"),
      status: form.get("status"),
    });
    const id = new NarrativeRepository(getDatabase()).saveProject(
      user.id,
      { ...data, image: await readImage(form) },
      String(form.get("id") || "") || undefined,
    );
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    new NarrativeRepository(getDatabase()).deleteProject(user.id, id);
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function toggleFavorite(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    new NarrativeRepository(getDatabase()).toggleFavorite(user.id, id);
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveEntity(form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = entitySchema.parse({
      name: form.get("name"),
      description: form.get("description"),
      kind: form.get("kind"),
      characterTypeId: form.get("characterTypeId") || null,
    });
    const id = new NarrativeRepository(getDatabase()).saveEntity(
      user.id,
      String(form.get("projectId")),
      { ...data, image: await readImage(form) },
      String(form.get("id") || "") || undefined,
    );
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function deleteEntity(
  projectId: string,
  kind: EntityKind,
  id: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    if (!entityKinds.includes(kind)) return { error: "Unknown entry type." };
    new NarrativeRepository(getDatabase()).deleteEntity(
      user.id,
      projectId,
      kind,
      id,
    );
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function createExample(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const id = new NarrativeRepository(getDatabase()).createExample(user.id);
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    return errorResult(error);
  }
}
