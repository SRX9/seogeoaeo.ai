"use client";

import { Button, Card, ProgressBar } from "@heroui/react";
import { CheckIcon } from "@/components/icons";

const ACTIVATION_STEPS = ["Saving Operating Brief", "Confirming Plan", "Establishing Baseline", "Creating First Mission"] as const;

export function ClaudiaActivationScreen({ brandName, autonomyMode, subscribed, isCreating, needsRetry, errorMessage, onRetry, onExit }: { brandName: string; website: string; autonomyMode: "FULL_AUTO" | "REVIEW"; subscribed: boolean; isCreating: boolean; needsRetry: boolean; errorMessage: string; onRetry: () => void; onExit: () => void }) {
  const displayName = brandName.trim() || "Your brand";
  const activeStep = subscribed ? 2 : 1;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <Card className="w-full max-w-xl">
        <Card.Header className="gap-2"><div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium"><span className="text-accent">Activating Claudia</span><span className="text-muted">{autonomyMode === "FULL_AUTO" ? "Autopilot" : "Copilot"}</span></div><Card.Title>{needsRetry ? "Activation Needs Another Try" : `Setting Up ${displayName}`}</Card.Title><Card.Description>Your saved brief and payment state remain safe throughout setup.</Card.Description></Card.Header>
        <Card.Content className="space-y-6">
          <ProgressBar value={(activeStep / ACTIVATION_STEPS.length) * 100} aria-label="Activation progress" size="sm"><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
          <ol className="space-y-2" aria-live="polite">{ACTIVATION_STEPS.map((label,index)=>{const done=index<activeStep; const active=index===activeStep; return <li key={label} aria-current={active ? "step" : undefined} className="flex items-center gap-3 rounded-xl bg-surface-secondary p-4"><span className={`flex size-6 items-center justify-center rounded-full ${done ? "bg-success-soft text-success" : active ? "bg-accent-soft text-accent-soft-foreground" : "bg-default-soft text-muted"}`} aria-hidden>{done ? <CheckIcon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className="text-sm font-medium text-foreground">{label}</span>{active ? <span className="ml-auto text-xs text-muted">In Progress</span> : null}</li>;})}</ol>
          {needsRetry ? <div className="rounded-xl bg-danger-soft p-4" role="alert"><p className="text-sm text-danger-soft-foreground">{errorMessage}</p><Button className="mt-4" isPending={isCreating} onPress={onRetry}>Try Again</Button></div> : null}
        </Card.Content>
        <Card.Footer className="justify-end"><Button variant="secondary" onPress={onExit}>Save and Exit</Button></Card.Footer>
      </Card>
    </div>
  );
}
