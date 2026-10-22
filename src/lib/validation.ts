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
