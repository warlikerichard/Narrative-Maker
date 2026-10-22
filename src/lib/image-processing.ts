import sharp from "sharp";
export const MAX_IMAGE_BYTES = 200_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function optimizeImage(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("Choose an image up to 10 MB.");
  const source = sharp(bytes, {
    limitInputPixels: 40_000_000,
    failOn: "error",
  });
  const meta = await source.metadata();
  if (
    !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
    (meta.pages ?? 1) > 1
  )
    throw new Error("Use a static PNG, JPEG, or WebP image.");
  for (let size = 1600; size >= 64; size = Math.floor(size * 0.75)) {
    for (const quality of [85, 75, 65, 50]) {
      const output = await source
        .clone()
        .rotate()
        .resize(size, size, { fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer();
      if (output.length <= MAX_IMAGE_BYTES) return output;
    }
  }
  throw new Error(
    "Could not compress this image to 200 KB. Please choose another image.",
  );
}
