import { z } from "zod";

export const CONTACT_CATEGORIES = [
  "account_billing",
  "product_support",
  "privacy_data",
  "partnerships_press",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  account_billing: "Account & billing",
  product_support: "Product support",
  privacy_data: "Privacy & data",
  partnerships_press: "Partnerships & press",
  other: "Other",
};

/** Validated server-side as authenticated user input; the hidden website field is a bot trap. */
export const contactRequestSchema = z.object({
  category: z.enum(CONTACT_CATEGORIES),
  message: z.string().trim().min(2, "Tell us how we can help.").max(5_000, "Message is too long."),
  website: z.string().max(200).optional().default(""),
});

export type ContactRequest = z.infer<typeof contactRequestSchema>;
