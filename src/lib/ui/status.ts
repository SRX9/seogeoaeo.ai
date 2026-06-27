import type { ComponentProps } from "react";
import type { Chip } from "@heroui/react";

type ChipColor = NonNullable<ComponentProps<typeof Chip>["color"]>;

/**
 * Maps a domain status string to a HeroUI Chip color. Lunar Grey is
 * monochromatic, so neutral states render as the grey `default` chip and the
 * semantic colors (success / warning / danger) are reserved for real meaning:
 * a finished run, a failure, an action that needs attention.
 */
export function statusColor(status: string): ChipColor {
  switch (status) {
    case "completed":
    case "published":
    case "approved":
    case "active":
      return "success";
    case "failed":
    case "error":
      return "danger";
    case "running":
    case "pending":
    case "queued":
    case "in_progress":
      return "warning";
    default:
      return "default";
  }
}
