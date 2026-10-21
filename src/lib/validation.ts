import { z } from "zod";
import { entityKinds } from "./types";

const name = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(100, "Use 100 characters or fewer for the name.");
const description = z
  .string()
  .trim()
  .max(10000, "Use 10,000 characters or fewer for the description.");
export const projectSchema = z.object({
  name,
  description,
  status: z.enum(["concept", "in-progress", "completed"]),
});
export const entitySchema = z
  .object({
    name,
    description,
    kind: z.enum(entityKinds),
    characterTypeId: z.string().nullable(),
  })
  .refine((value) => value.kind !== "character" || !!value.characterTypeId, {
    message: "Choose a character type before saving.",
    path: ["characterTypeId"],
  });
export const registrationSchema = z.object({
  name,
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  password: z
    .string()
    .min(10, "Use at least 10 characters for your password.")
    .max(128, "Use 128 characters or fewer for your password."),
});

export async function readImage(
  form: FormData,
): Promise<string | null | undefined> {
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Choose an image smaller than 2 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const isPng = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp =
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
    const mime = isPng
      ? "image/png"
      : isJpeg
        ? "image/jpeg"
        : isWebp
          ? "image/webp"
          : null;
    if (!mime) throw new Error("Use a PNG, JPEG, or WebP image.");
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
  return form.get("removeImage") === "true" ? null : undefined;
}
