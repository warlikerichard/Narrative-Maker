export const entityKinds = [
  "characterType",
  "character",
  "region",
  "item",
] as const;
export type EntityKind = (typeof entityKinds)[number];
export type ProjectStatus = "concept" | "in-progress" | "completed";

export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  image: string | null;
  status: ProjectStatus;
  favorite: boolean;
  updatedAt: string;
  entityCount: number;
}
export interface NarrativeEntity {
  id: string;
  projectId: string;
  kind: EntityKind;
  name: string;
  description: string;
  image: string | null;
  characterTypeId: string | null;
  updatedAt: string;
}
export type ActionResult = { error?: string; id?: string; success?: boolean };

export const entityLabels: Record<
  EntityKind,
  { singular: string; plural: string; description: string }
> = {
  character: {
    singular: "Character",
    plural: "Characters",
    description: "The people and creatures that bring your story to life.",
  },
  region: {
    singular: "Region",
    plural: "Regions",
    description: "Build the places your players will remember.",
  },
  item: {
    singular: "Item",
    plural: "Items",
    description: "Every object has a story. Give yours a place in the world.",
  },
  characterType: {
    singular: "Character type",
    plural: "Character types",
    description: "Define the species, origins, and archetypes of your cast.",
  },
};
