"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveEntity, saveProject } from "@/app/actions";
import {
  entityLabels,
  type EntityKind,
  type NarrativeEntity,
  type Project,
} from "@/lib/types";
import { Modal } from "./modal";

export function EditorForm({
  project,
  entity,
  kind,
  projectId,
  types = [],
  onClose,
}: {
  project?: Project;
  entity?: NarrativeEntity;
  kind?: EntityKind;
  projectId?: string;
  types?: NarrativeEntity[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [preview, setPreview] = useState<string | null>(
    entity?.image ?? project?.image ?? null,
  );
  const [removeImage, setRemoveImage] = useState(false);
  const existing = entity ?? project;
  const label = kind ? entityLabels[kind].singular.toLowerCase() : "project";
  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    const url = preview;

    return () => URL.revokeObjectURL(url);
  }, [preview]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const result = await (kind ? saveEntity(form) : saveProject(form));
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      if (!kind && !project && result.id) router.push(`/projects/${result.id}`);
      router.refresh();
    } catch {
      setError(
        "Could not save your changes. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${existing ? "Edit" : "New"} ${label}`}
      subtitle={`Give your ${label} a name and a place in your story.`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="form-stack">
        <fieldset disabled={busy}>
          <input type="hidden" name="id" value={existing?.id ?? ""} />
          <input type="hidden" name="projectId" value={projectId ?? ""} />
          <input type="hidden" name="kind" value={kind ?? ""} />
          <input type="hidden" name="removeImage" value={String(removeImage)} />
          <div className="image-field">
            {preview ? (
              <img src={preview} alt="Selected cover preview" />
            ) : (
              <ImagePlus size={30} />
            )}
            <div>
              <label className="button secondary file-picker">
                {preview ? "Change image" : "Upload image"}
                <input
                  aria-label="Upload image"
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    if (selected.size > 10 * 1024 * 1024) {
                      setError("Choose an image up to 10 MB.");
                      event.target.value = "";
                      return;
                    }
                    setError("");
                    setRemoveImage(false);
                    setPreview(URL.createObjectURL(selected));
                  }}
                />
              </label>
              <small>
                PNG, JPG or WebP · up to 10 MB · automatically compressed to 200
                KB
              </small>
              {preview && (
                <button
                  type="button"
                  className="text-button muted"
                  onClick={(event) => {
                    setPreview(null);
                    setRemoveImage(true);
                    const input = event.currentTarget
                      .closest("form")
                      ?.querySelector<HTMLInputElement>('input[type="file"]');
                    if (input) input.value = "";
                  }}
                >
                  <Trash2 size={12} /> Remove image
                </button>
              )}
            </div>
          </div>
          <label>
            Name <span className="required">*</span>
            <input
              name="name"
              defaultValue={existing?.name}
              placeholder={
                kind === "character"
                  ? "e.g. Lyra Ashwind"
                  : kind === "region"
                    ? "e.g. The Verdant Reach"
                    : kind === "item"
                      ? "e.g. The Wayfinder"
                      : kind === "characterType"
                        ? "e.g. Human, animal, spirit…"
                        : "Give your next adventure a name"
              }
              required
              maxLength={100}
              autoFocus
            />
          </label>
          {!kind && (
            <label>
              Status
              <select name="status" defaultValue={project?.status ?? "concept"}>
                <option value="concept">Concept</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          )}
          {kind === "character" && (
            <label>
              Character type <span className="required">*</span>
              <select
                name="characterTypeId"
                defaultValue={entity?.characterTypeId ?? ""}
                required
              >
                <option value="" disabled>
                  Select a character type
                </option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <small>Every character belongs to a type in this project.</small>
            </label>
          )}
          <label>
            Description
            <textarea
              name="description"
              defaultValue={existing?.description}
              placeholder="A backstory, a spark of inspiration, or the details that make it yours…"
              rows={5}
              maxLength={10000}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button primary" type="submit">
              <Save size={16} />
              {busy ? "Saving…" : existing ? "Save changes" : `Create ${label}`}
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}
