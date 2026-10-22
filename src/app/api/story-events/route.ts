import { getDatabase } from "@/lib/database";
import { storySchema } from "@/lib/story-schema";
import { BUCKET, cleanupImages, uploadImage } from "@/lib/images";
const columns =
  "id,projectId:project_id,title,image,sections,characterIds:character_ids,updatedAt:updated_at";
export async function GET() {
  const db = await getDatabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  const { data, error } = await db
    .from("story_events")
    .select(columns)
    .order("updated_at", { ascending: false });
  if (error)
    return Response.json(
      { error: "Could not load story events." },
      { status: 500 },
    );
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  const db = await getDatabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  let uploaded: string | undefined;
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new Error("This event is too large.");
    const { event, expectedUpdatedAt } = JSON.parse(raw);
    const input = storySchema.parse(event);
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .single();
    if (!project) throw new Error("Project not found.");
    let image = input.image;
    if (image?.startsWith("data:image/webp;base64,")) {
      uploaded = await uploadImage(
        db,
        user.id,
        Buffer.from(image.split(",")[1], "base64"),
      );
      image = uploaded;
    } else if (image) {
      const { data: previous } = await db
        .from("story_events")
        .select("image")
        .eq("id", input.id)
        .eq("project_id", input.projectId)
        .single();
      if (image !== previous?.image)
        throw new Error("Choose an image using the image picker.");
    }
    const row = {
      title: input.title,
      image,
      sections: input.sections,
      character_ids: input.characterIds,
    };
    // Compare-and-swap prevents silently overwriting changes made on another device.
    const query = expectedUpdatedAt
      ? db
          .from("story_events")
          .update(row)
          .eq("id", input.id)
          .eq("project_id", input.projectId)
          .eq("updated_at", expectedUpdatedAt)
      : db
          .from("story_events")
          .insert({ ...row, id: input.id, project_id: input.projectId });
    const { data, error } = await query.select(columns).single();
    if (error || !data)
      throw new Error(
        expectedUpdatedAt
          ? "This event changed or was deleted. Reload the saved version before editing again."
          : "Could not create the event. Check its characters and try again.",
      );
    await cleanupImages(db);
    return Response.json(data);
  } catch (error) {
    if (uploaded) await db.storage.from(BUCKET).remove([uploaded.slice(12)]);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not save event.",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  const db = await getDatabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { projectId, eventId } = await request.json();
    const { error, data } = await db
      .from("story_events")
      .delete()
      .eq("id", eventId)
      .eq("project_id", projectId)
      .select("id")
      .single();
    if (error || !data)
      return Response.json({ error: "Event not found." }, { status: 404 });
    await cleanupImages(db);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Could not delete event." }, { status: 400 });
  }
}
