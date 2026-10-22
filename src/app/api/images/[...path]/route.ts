import { getDatabase } from "@/lib/database";
import { BUCKET } from "@/lib/images";
import sharp from "sharp";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const db = await getDatabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { path } = await params;
  if (
    !user ||
    path.length !== 2 ||
    path[0] !== user.id ||
    !/^[a-f0-9-]+\.webp$/.test(path[1])
  )
    return new Response(null, { status: 404 });
  const { data, error } = await db.storage
    .from(BUCKET)
    .download(path.join("/"));
  if (error || !data) return new Response(null, { status: 404 });
  let bytes: Uint8Array = new Uint8Array(await data.arrayBuffer());
  if (new URL(request.url).searchParams.get("thumbnail") === "1")
    bytes = new Uint8Array(
      await sharp(bytes)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer(),
    );
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
