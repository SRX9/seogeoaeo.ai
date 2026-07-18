import { describe, expect, it } from "vitest";
import { classifyObjectiveReplanMarker } from "@/lib/agent/objective-replan";

describe("objective replan marker lifecycle", () => {
  it("surfaces terminal failure, while an explicit replay or durable receipt remains recoverable", () => {
    const deadLetter = {
      status: "dead_letter",
      lastError: "Plan creation failed five times",
      operatorReplayRequested: false,
    } as const;

    expect(classifyObjectiveReplanMarker(deadLetter)).toMatchObject({
      status: "dead_letter",
      error: "Plan creation failed five times",
    });
    expect(
      classifyObjectiveReplanMarker({
        ...deadLetter,
        operatorReplayRequested: true,
      }),
    ).toMatchObject({ status: "pending" });
    expect(classifyObjectiveReplanMarker(deadLetter, true)).toMatchObject({
      status: "completed",
      error: null,
    });
  });
});
