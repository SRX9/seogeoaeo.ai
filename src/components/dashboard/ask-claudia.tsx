"use client";

import { Button, Input, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ClaudiaAvatar } from "@/components/dashboard/claudia-avatar";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  askIntentChips,
  isAskUnknown,
  type AskIntentId,
  type AskResult,
} from "@/lib/agent/ask-shared";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { cn } from "@/lib/cn";

/** Single source of truth — same ids/labels as server ASK_INTENTS. */
const INTENTS = askIntentChips();

/**
 * Phase 4 — constrained Ask Claudia. Intent chips + short free text mapped to
 * grounded brand data. Never a blank ChatGPT box as the product.
 */
export function AskClaudia({ className }: { className?: string }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [activeIntent, setActiveIntent] = useState<AskIntentId | null>(null);

  const ask = useMutation({
    mutationFn: (body: { intent?: string; message?: string }) =>
      apiPost<AskResult>("/api/dashboard/ask", body),
    onSuccess: (data, vars) => {
      setResult(data);
      setActiveIntent(
        vars.intent && !isAskUnknown(data)
          ? (vars.intent as AskIntentId)
          : isAskUnknown(data)
            ? null
            : data.intent,
      );
    },
    onError: (error) => toast.danger(getErrorMessage(error, "I couldn't answer that.")),
  });

  function runIntent(id: AskIntentId) {
    setMessage("");
    ask.mutate({ intent: id });
  }

  function runMessage() {
    const text = message.trim();
    if (!text) return;
    ask.mutate({ message: text });
  }

  return (
    <section className={cn("space-y-3.5", className)}>
      <div className="flex items-center gap-3">
        <ClaudiaAvatar className="size-9" />
        <div>
          <h2 className="type-title text-lg text-foreground">Ask me</h2>
          <p className="text-sm leading-relaxed text-muted">
            Grounded in your scores, fixes, topics, and work log — not inventing SEO advice.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {INTENTS.map((intent) => {
          const selected = activeIntent === intent.id && result && !isAskUnknown(result);
          return (
            <button
              key={intent.id}
              type="button"
              disabled={ask.isPending}
              onClick={() => runIntent(intent.id)}
              className={cn(
                "chip",
                selected
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-surface-secondary text-muted hover-fine:bg-default/60 hover-fine:text-foreground",
                ask.isPending && "opacity-60",
              )}
            >
              {intent.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          aria-label="Ask Claudia"
          placeholder="Or type a short question…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runMessage();
            }
          }}
          variant="secondary"
          fullWidth
          className="flex-1"
        />
        <LoadingButton
          size="sm"
          isPending={ask.isPending}
          pendingLabel="Thinking…"
          isDisabled={!message.trim()}
          onPress={runMessage}
        >
          Ask
        </LoadingButton>
      </div>

      {result ? (
        <Card className="material-panel space-y-3 p-4">
          {isAskUnknown(result) ? (
            <>
              <p className="text-sm leading-relaxed text-foreground">{result.suggestion}</p>
              <p className="text-xs tracking-[0.01em] text-muted">Try one of the chips above.</p>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {result.answer}
              </p>
              {result.sources.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                  <span className="w-full text-xs font-medium tracking-[0.01em] text-muted">
                    Sources
                  </span>
                  {result.sources.map((s) => (
                    <Link
                      key={s.href + s.label}
                      href={s.href}
                      className={buttonVariants({ size: "sm", variant: "secondary" })}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onPress={() => setResult(null)}>
              Clear
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
