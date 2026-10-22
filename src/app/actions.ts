"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { endSession, requireUser } from "@/lib/auth";
import { uploadImage, BUCKET } from "@/lib/images";
import { getDatabase } from "@/lib/database";
import { NarrativeRepository } from "@/lib/repository";
import {
  entitySchema,
  projectSchema,
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
  try {
    const db = await getDatabase();
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") || "");
    if (!email || email.length > 254 || !password || password.length > 128)
      return { error: "Enter a valid email and password." };
    if (mode === "register") {
      const input = registrationSchema.parse({
        name: form.get("name"),
        email,
        password,
      });
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { name: input.name } },
      });
      if (error) return { error: error.message };
      if (!data.session)
        return {
          success: true,
          message: "Check your email to confirm your account, then sign in.",
        };
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
    }
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
  let uploaded: string | null | undefined;
  try {
    const data = projectSchema.parse({
      name: form.get("name"),
      description: form.get("description"),
      status: form.get("status"),
    });
    uploaded = await readImage(form, user.id);
    const id = await new NarrativeRepository(await getDatabase()).saveProject(
      user.id,
      { ...data, image: uploaded },
      String(form.get("id") || "") || undefined,
    );
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    if (uploaded?.startsWith("/api/images/"))
      await (
        await getDatabase()
      ).storage
        .from(BUCKET)
        .remove([uploaded.slice(12)]);
    return errorResult(error);
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await new NarrativeRepository(await getDatabase()).deleteProject(
      user.id,
      id,
    );
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function toggleFavorite(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await new NarrativeRepository(await getDatabase()).toggleFavorite(
      user.id,
      id,
    );
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveEntity(form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let uploaded: string | null | undefined;
  try {
    const data = entitySchema.parse({
      name: form.get("name"),
      description: form.get("description"),
      kind: form.get("kind"),
      characterTypeId: form.get("characterTypeId") || null,
    });
    uploaded = await readImage(form, user.id);
    const id = await new NarrativeRepository(await getDatabase()).saveEntity(
      user.id,
      String(form.get("projectId")),
      { ...data, image: uploaded },
      String(form.get("id") || "") || undefined,
    );
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    if (uploaded?.startsWith("/api/images/"))
      await (
        await getDatabase()
      ).storage
        .from(BUCKET)
        .remove([uploaded.slice(12)]);
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
    await new NarrativeRepository(await getDatabase()).deleteEntity(
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
    const id = await new NarrativeRepository(await getDatabase()).createExample(
      user.id,
    );
    revalidatePath("/", "layout");
    return { success: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

async function readImage(form: FormData, userId: string) {
  const file = form.get("image");
  if (file instanceof File && file.size)
    return uploadImage(
      await getDatabase(),
      userId,
      Buffer.from(await file.arrayBuffer()),
    );
  return form.get("removeImage") === "true" ? null : undefined;
}

export async function compressImage(
  form: FormData,
): Promise<{ image?: string; error?: string }> {
  await requireUser();
  try {
    const file = form.get("image");
    if (!(file instanceof File)) return { error: "Choose an image." };
    const { optimizeImage } = await import("@/lib/image-processing");
    const bytes = await optimizeImage(Buffer.from(await file.arrayBuffer()));
    return { image: `data:image/webp;base64,${bytes.toString("base64")}` };
  } catch {
    return {
      error:
        "Could not compress this image. Use a static PNG, JPEG, or WebP up to 10 MB.",
    };
  }
}
