import { z } from "zod";
const part = z.object({
  id: z.string().uuid(),
  title: z.string().max(100),
  description: z.string().max(10000),
});
export const storySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  image: z.string().max(280000).nullable(),
  sections: z
    .array(part.extend({ subsections: z.array(part).max(100) }))
    .max(100),
  characterIds: z.array(z.string().uuid()).max(1000),
  updatedAt: z.string().datetime({ offset: true }),
});
