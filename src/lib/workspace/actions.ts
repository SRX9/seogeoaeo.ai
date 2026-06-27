"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBillingContext } from "@/lib/billing/access";
import { updateWorkspaceAutonomy } from "@/lib/workspace";
import type { AutonomyMode } from "@/lib/workspace/settings";

const autonomySchema = z.enum(["FULL_AUTO", "REVIEW"]);

export async function updateAutonomyAction(formData: FormData): Promise<void> {
  const { workspace } = await getBillingContext();
  const parsed = autonomySchema.safeParse(formData.get("autonomyMode"));

  if (!parsed.success) {
    return;
  }

  await updateWorkspaceAutonomy(workspace.id, parsed.data as AutonomyMode);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
