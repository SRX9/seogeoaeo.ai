import { z } from "zod";

/**
 * V4.1 / V4.3 — Zod schemas for the LLM JSON outputs. Shapes mirror the
 * `agents/geo-content.md` "Output Format" E-E-A-T table (Steps 2–5) and the
 * Step 7 AI-content red-flag table + 4 assessment labels.
 */

const Dimension = z.object({
  score: z.number().min(0).max(25),
  evidence: z.array(z.string()).max(5),
});

export const EeatSchema = z.object({
  experience: Dimension,
  expertise: Dimension,
  authoritativeness: Dimension,
  trustworthiness: Dimension,
});

export type EeatJson = z.infer<typeof EeatSchema>;

export const AI_CONTENT_LABELS = [
  "Highly Likely Human",
  "Likely Human-Edited AI",
  "Likely AI with Light Editing",
  "Likely Unedited AI",
] as const;

export type AiContentLabel = (typeof AI_CONTENT_LABELS)[number];

export const AiContentSchema = z.object({
  redFlags: z.array(z.object({ indicator: z.string(), evidence: z.string().optional() })),
  label: z.enum(AI_CONTENT_LABELS),
});

export type AiContentJson = z.infer<typeof AiContentSchema>;
