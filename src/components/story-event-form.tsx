"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { saveStoryEvent } from "@/lib/story-events";
import { Modal } from "./modal";
import { StoryImageField } from "./story-image-field";

export function StoryEventForm({
  userId,
  projectId,
  onClose,
}: {
  userId: string;
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageBusy) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Give your story event a title.");
      return;
    }
    try {
      const id = crypto.randomUUID();
      setImageBusy(true);
      await saveStoryEvent(userId, {
        id,
        projectId,
        title: trimmedTitle,
        image,
        sections: [],
        characterIds: [],
        updatedAt: new Date().toISOString(),
      });
      onClose();
      router.push(`/projects/${projectId}/story-events/${id}`);
    } catch (error) {
      setImageBusy(false);
      setError(
        error instanceof Error ? error.message : "Could not create this event.",
      );
    }
  }

  return (
    <Modal
      title="New story event"
      subtitle="Start with a title. Build the story in your event editor."
      onClose={onClose}
      busy={imageBusy}
    >
      <form className="form-stack" onSubmit={create}>
        <StoryImageField
          image={image}
          onChange={setImage}
          onBusyChange={setImageBusy}
        />
        <label>
          Title <span className="required">*</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. The fall of the citadel"
            required
            maxLength={100}
            autoFocus
          />
        </label>
        <p className="story-local-note">
          Saved to your account. Sections and characters can be added on the
          next page.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={imageBusy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={imageBusy} type="submit">
            Create and edit
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
