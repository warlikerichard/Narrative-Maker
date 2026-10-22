"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import type { StoryEvent } from "./types";

// Temporary browser persistence. Replace this module with database-backed actions later.
// User/project scoping is for organization, not a security boundary for localStorage.
const changeEvent = "narrative-maker:story-events-changed";
const unavailable = "__storage_unavailable__";
const subsectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
});
const storyEventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().max(100),
  image: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .nullable()
    .default(null),
  sections: z.array(
    subsectionSchema.extend({ subsections: z.array(subsectionSchema) }),
  ),
  characterIds: z.array(z.string()),
  updatedAt: z.iso.datetime(),
});
const storeSchema = z.object({
  version: z.literal(1),
  events: z.array(storyEventSchema),
});
const storageKey = (userId: string) =>
  `narrative-maker:story-events:v1:${userId}`;

function readRaw(userId: string): string {
  try {
    return window.localStorage.getItem(storageKey(userId)) ?? "";
  } catch {
    return unavailable;
  }
}

function parseStore(raw: string): {
  events: StoryEvent[];
  error: string | null;
} {
  if (raw === unavailable)
    return {
      events: [],
      error:
        "Browser storage is unavailable. Allow local storage to keep your story events.",
    };
  if (!raw) return { events: [], error: null };
  try {
    return { events: storeSchema.parse(JSON.parse(raw)).events, error: null };
  } catch {
    return {
      events: [],
      error:
        "The saved story events could not be read. Your browser data has not been overwritten.",
    };
  }
}

function readEvents(userId: string) {
  const result = parseStore(readRaw(userId));
  if (result.error) throw new Error(result.error);
  return result.events;
}

function writeEvents(userId: string, events: StoryEvent[]) {
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ version: 1, events }),
    );
  } catch {
    throw new Error(
      "Could not save in this browser. Storage may be full or blocked. Try removing a cover image, then retry.",
    );
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function saveLocalStoryEvent(
  userId: string,
  event: StoryEvent,
  expectedUpdatedAt?: string,
) {
  const validated = storyEventSchema.parse(event);
  const events = readEvents(userId);
  const previous = events.find(
    (entry) => entry.id === event.id && entry.projectId === event.projectId,
  );
  if (expectedUpdatedAt && previous?.updatedAt !== expectedUpdatedAt) {
    throw new Error(
      "This event was changed or deleted in another tab. Reload the saved version before editing again.",
    );
  }
  writeEvents(userId, [
    ...events.filter((entry) => entry.id !== event.id),
    validated,
  ]);
}

export function deleteLocalStoryEvent(
  userId: string,
  projectId: string,
  eventId: string,
) {
  writeEvents(
    userId,
    readEvents(userId).filter(
      (entry) => !(entry.projectId === projectId && entry.id === eventId),
    ),
  );
}

export function clearLocalProjectEvents(userId: string, projectId: string) {
  writeEvents(
    userId,
    readEvents(userId).filter((entry) => entry.projectId !== projectId),
  );
}

export function useLocalStoryEvents(userId: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      function onStorage(event: StorageEvent) {
        if (event.key === null || event.key === storageKey(userId)) notify();
      }
      window.addEventListener("storage", onStorage);
      window.addEventListener(changeEvent, notify);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(changeEvent, notify);
      };
    },
    [userId],
  );
  const getSnapshot = useCallback(() => readRaw(userId), [userId]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return useMemo(
    () => ({ ...parseStore(raw ?? ""), ready: raw !== null }),
    [raw],
  );
}
