"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/app/actions";
import { ImagePlus, Trash2 } from "lucide-react";

export function StoryImageField({
  image,
  onChange,
  onBusyChange,
}: {
  image: string | null;
  onChange: (image: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latestChange = useRef(onChange);
  useEffect(() => {
    latestChange.current = onChange;
  }, [onChange]);

  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError(
        "Choose a PNG, JPEG, or WebP image up to 10 MB; compressed to 200 KB.",
      );
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const form = new FormData();
      form.set("image", file);
      const result = await compressImage(form);
      if (!result.image) throw new Error(result.error);
      latestChange.current(result.image);
    } catch {
      setError("Could not open this image. Please choose a different file.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div>
      <div className="image-field">
        {image ? (
          <img src={image} alt="Story event cover preview" />
        ) : (
          <ImagePlus size={30} />
        )}
        <div>
          <label className="button secondary file-picker">
            {busy
              ? "Compressing image…"
              : image
                ? "Change cover"
                : "Upload cover"}
            <input
              type="file"
              aria-label="Story event image"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={selectFile}
            />
          </label>
          <small>
            Optional · PNG, JPG or WebP · up to 10 MB; compressed to 200 KB
          </small>
          {image && (
            <button
              type="button"
              className="text-button muted"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              <Trash2 size={12} />
              Remove cover
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error story-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
