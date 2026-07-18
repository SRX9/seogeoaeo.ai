"use client";

import { Button, TextArea, toast } from "@heroui/react";
import { Sheet } from "@heroui-pro/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ClaudiaIcon } from "@/components/icons";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  isAskProposal,
  isAskRouted,
  isAskUnknown,
  type AskIntentId,
  type AskResult,
} from "@/lib/agent/ask-shared";

type AskClaudiaProps = {
  className?: string;
};

const SUGGESTED_INTENTS = [
  { id: "status", label: "What are you working on today?" },
  { id: "current_plan", label: "Why did you choose this work?" },
  { id: "week_summary", label: "What improved this week?" },
  { id: "fixes_ready", label: "What needs my attention?" },
  { id: "writing_next", label: "What will you create next?" },
  { id: "ai_answers", label: "Where does my brand appear in AI answers?" },
] satisfies Array<{ id: AskIntentId; label: string }>;

export function AskClaudia({ className }: AskClaudiaProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const ask = useMutation({
    mutationFn: (input: { intent?: AskIntentId; message?: string }) =>
      apiPost<AskResult>("/api/dashboard/ask", input),
    onSuccess: setResult,
    onError: (error) =>
      toast.danger(getErrorMessage(error, "I couldn't answer from the available records.")),
  });

  function submit() {
    const value = message.trim();
    if (!value || ask.isPending) return;
    ask.mutate({ message: value });
  }

  return (
    <Sheet
      isDetached
      onOpenChange={(open) => {
        if (!open) {
          setMessage("");
          setResult(null);
          ask.reset();
        }
      }}
    >
      <Sheet.Trigger>
        <Button className={className} size="sm" variant="outline">
          <ClaudiaIcon className="size-4" />
          Ask Claudia
        </Button>
      </Sheet.Trigger>
      <Sheet.Backdrop variant="blur">
        <Sheet.Content className="mx-auto max-h-[92vh] max-w-xl">
          <Sheet.Dialog>
            <Sheet.Handle />
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading>Ask Claudia</Sheet.Heading>
              <p className="mt-1 max-w-lg text-sm leading-6 text-muted">
                Get a simple answer about Claudia&apos;s work, your content, or what is changing.
              </p>
            </Sheet.Header>
            <Sheet.Body className="space-y-5">
              <div className="space-y-1" aria-label="Suggested questions">
                {SUGGESTED_INTENTS.map((intent) => (
                  <Button
                    key={intent.id}
                    className="min-h-11 w-full justify-start px-2 text-left transition-transform active:scale-[0.96]"
                    size="sm"
                    variant="ghost"
                    onPress={() => ask.mutate({ intent: intent.id })}
                  >
                    {intent.label}
                  </Button>
                ))}
              </div>

              <TextArea
                fullWidth
                aria-label="Question for Claudia"
                maxLength={500}
                placeholder="Ask what Claudia is doing, what improved, or what needs you…"
                rows={3}
                value={message}
                variant="secondary"
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />

              {result ? (
                <section className="rounded-2xl bg-surface-secondary p-4" aria-live="polite">
                  {isAskUnknown(result) ? (
                    <p className="text-sm leading-6 text-muted">{result.suggestion}</p>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {result.answer}
                      </p>
                      {isAskProposal(result) || isAskRouted(result) ? (
                        <Link
                          href={result.route.href}
                          className="mt-4 inline-flex min-h-10 items-center font-medium text-accent underline-offset-4 hover-fine:underline"
                        >
                          {result.route.label}
                        </Link>
                      ) : null}
                      {result.sources.length > 0 || result.recordRefs.length > 0 ? (
                        <details className="mt-5 border-t border-separator pt-3">
                          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-muted outline-none hover-fine:text-foreground focus-visible:ring-2 focus-visible:ring-focus">
                            How Claudia knows this
                          </summary>
                          <div className="mt-2 space-y-2 pb-1">
                            {result.sources.map((source) => (
                              <Link
                                key={`${source.href}:${source.label}`}
                                href={source.href}
                                className="block text-sm font-medium text-accent underline-offset-4 hover-fine:underline"
                              >
                                {source.label}
                              </Link>
                            ))}
                            {result.recordRefs.slice(0, 8).map((record) =>
                              record.href ? (
                                <Link
                                  key={`${record.kind}:${record.id}`}
                                  href={record.href}
                                  className="block text-sm text-foreground underline-offset-4 hover-fine:underline"
                                >
                                  {record.label}
                                </Link>
                              ) : (
                                <p key={`${record.kind}:${record.id}`} className="text-sm text-muted">
                                  {record.label}
                                </p>
                              ),
                            )}
                          </div>
                        </details>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}
            </Sheet.Body>
            <Sheet.Footer>
              <Sheet.Close>
                <Button variant="ghost">Close</Button>
              </Sheet.Close>
              <Button isDisabled={!message.trim()} isPending={ask.isPending} onPress={submit}>
                {ask.isPending ? "Checking…" : "Ask"}
              </Button>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
