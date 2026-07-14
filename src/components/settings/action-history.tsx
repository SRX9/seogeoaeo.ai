"use client";

import { Accordion, Card } from "@heroui/react";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { ChevronRightIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { useAgentActions } from "@/lib/api/queries";

function json(value: unknown) {
  return value == null ? "Not recorded" : JSON.stringify(value, null, 2);
}

export function ActionHistory() {
  const actions = useAgentActions();
  return (
    <Section query={actions} skeleton={<CardSkeleton lines={4} />} errorLabel="Couldn't load action history.">
      {(data) => (
        <section className="space-y-4" aria-labelledby="action-history-title">
          <div>
            <h2 id="action-history-title" className="text-xl text-foreground">Action history</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Live connector changes, their before-state, capability, and verification outcome.
            </p>
          </div>
          {data.actions.length ? (
            <div className="space-y-3">
              {data.actions.map((action) => (
                <Card key={action.id}>
                  <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Card.Title className="capitalize">{action.actionType}</Card.Title>
                      <Card.Description className="break-words">{action.resourceRef}</Card.Description>
                    </div>
                    <ToneText
                      tone={action.verificationStatus === "verified" ? "success" : "warning"}
                      className="text-xs capitalize"
                    >
                      {action.verificationStatus}
                    </ToneText>
                  </Card.Header>
                  <Card.Content>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{action.capability}</span>
                    <span>{action.rollbackSupported ? "Rollback available" : "No connector rollback"}</span>
                    <time dateTime={action.createdAt} suppressHydrationWarning>
                      {new Date(action.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <Accordion className="mt-4">
                    <Accordion.Item id={`change-${action.id}`}>
                      <Accordion.Heading>
                        <Accordion.Trigger>
                          Inspect Change
                          <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted">Before</p>
                            <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs">{json(action.beforeState)}</pre>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted">Applied</p>
                            <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs">{json(action.appliedChange)}</pre>
                          </div>
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                  </Card.Content>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">No live connector changes recorded yet.</p>
          )}
        </section>
      )}
    </Section>
  );
}
