"use client";
import { useEffect, useState } from "react";
import type { StoryEvent } from "./types";
const changed = "narrative:stories-changed";
async function request(method: string, body?: unknown) {
  const response = await fetch("/api/story-events", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not save the event. Try again.");
  return result;
}
export async function saveStoryEvent(
  _userId: string,
  event: StoryEvent,
  expectedUpdatedAt?: string,
): Promise<StoryEvent> {
  const saved = await request("POST", { event, expectedUpdatedAt });
  window.dispatchEvent(new Event(changed));
  return saved;
}
export async function deleteStoryEvent(
  _userId: string,
  projectId: string,
  eventId: string,
) {
  await request("DELETE", { projectId, eventId });
  window.dispatchEvent(new Event(changed));
}
export function useStoryEvents(userId: string) {
  const [state, setState] = useState<{
    events: StoryEvent[];
    error: string | null;
    ready: boolean;
  }>({ events: [], error: null, ready: false });
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const events = await request("GET");
        if (active && current === sequence)
          setState({ events, error: null, ready: true });
      } catch (error) {
        if (active && current === sequence)
          setState((s) => ({
            ...s,
            error:
              error instanceof Error ? error.message : "Could not load events.",
            ready: true,
          }));
      }
    };
    void refresh();
    window.addEventListener(changed, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(changed, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [userId]);
  return state;
}
