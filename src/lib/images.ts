import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeImage } from "./image-processing";
export const BUCKET = "narrative-images";
export async function uploadImage(
  db: SupabaseClient,
  userId: string,
  bytes: Buffer,
) {
  const output = await optimizeImage(bytes);
  const path = `${userId}/${randomUUID()}.webp`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, output, { contentType: "image/webp", cacheControl: "3600" });
  if (error) throw error;
  return `/api/images/${path}`;
}
// Queue rows are created transactionally by database triggers. Failed cleanup is retried on the next mutation.
export async function cleanupImages(db: SupabaseClient) {
  try {
    const { data } = await db.from("image_cleanup").select("path").limit(100);
    for (const row of data ?? []) {
      const reference = `/api/images/${row.path}`;
      const checks = await Promise.all(
        ["projects", "entities", "character_types", "story_events"].map(
          (table) =>
            db.from(table).select("id").eq("image", reference).limit(1),
        ),
      );
      if (checks.some((result) => result.error || result.data?.length))
        continue;
      const { error } = await db.storage.from(BUCKET).remove([row.path]);
      if (!error) await db.from("image_cleanup").delete().eq("path", row.path);
    }
  } catch (error) {
    console.error("Image cleanup will retry on a later mutation", error);
  }
}
