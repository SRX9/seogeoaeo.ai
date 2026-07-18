"use client";

import { Button, TextArea, toast } from "@heroui/react";
import { Sheet } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";
import type { SteeringResult } from "@/lib/agent/types";

const EXAMPLES = [
  "Focus on enterprise buyers this month.",
  "Never publish pricing comparison pages.",
  "Why is this the next task?",
] as const;

type SteerClaudiaProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "tertiary" | "outline" | "ghost";
  className?: string;
  icon?: ReactNode;
};

export function SteerClaudia({
  label = "Steer Claudia",
  size = "md",
  variant = "secondary",
  className,
  icon,
}: SteerClaudiaProps = {}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SteeringResult | null>(null);

  const steer = useMutation({
    mutationFn: (instruction: string) =>
      apiPost<SteeringResult>("/api/agent/steer", { message: instruction }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.topics });
    },
    onError: (error) =>
      toast.danger(getErrorMessage(error, "I couldn't apply that direction.")),
  });

  function submit() {
    const instruction = message.trim();
    if (!instruction || steer.isPending) return;
    steer.mutate(instruction);
  }

  return (
    <Sheet
      isDetached
      onOpenChange={(open) => {
        if (!open) {
          setMessage("");
          setResult(null);
        }
      }}
    >
      <Sheet.Trigger>
        <Button className={className} size={size} variant={variant}>
          {icon}
          {label}
        </Button>
      </Sheet.Trigger>
      <Sheet.Backdrop variant="blur">
        <Sheet.Content className="mx-auto max-h-[92vh] max-w-xl">
          <Sheet.Dialog>
            <Sheet.Handle />
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading>Steer Claudia</Sheet.Heading>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">
                Tell Claudia what to prioritize, avoid, pause, or do next.
              </p>
            </Sheet.Header>
            <Sheet.Body className="space-y-4">
              <TextArea
                autoFocus
                fullWidth
                rows={4}
                maxLength={1_000}
                value={message}
                variant="secondary"
                aria-label="Instruction for Claudia"
                placeholder="Focus on enterprise buyers this month…"
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <Button
                    key={example}
                    size="sm"
                    variant="ghost"
                    onPress={() => setMessage(example)}
                  >
                    {example}
                  </Button>
                ))}
              </div>

              {result ? (
                <div className="rounded-2xl bg-surface-secondary p-4" aria-live="polite">
                  <p className="font-medium text-foreground">{result.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{result.summary}</p>
                  {result.planDiff ? (
                    <p className="mt-3 text-xs text-muted">
                      {result.planDiff.movedTaskCount > 0
                        ? `Claudia updated ${result.planDiff.movedTaskCount} future work item${result.planDiff.movedTaskCount === 1 ? "" : "s"}.`
                        : "Claudia updated what she will do next. Completed work is unchanged."}
                    </p>
                  ) : null}
                  {result.sources?.length ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {result.sources.map((source) => (
                        <Link
                          key={source.href + source.label}
                          href={source.href}
                          className="text-sm font-medium text-foreground underline-offset-4 hover-fine:underline"
                        >
                          {source.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Sheet.Body>
            <Sheet.Footer>
              <Sheet.Close>
                <Button variant="ghost">Cancel</Button>
              </Sheet.Close>
              <Button isPending={steer.isPending} isDisabled={!message.trim()} onPress={submit}>
                {steer.isPending ? "Applying…" : "Apply direction"}
              </Button>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
