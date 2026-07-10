"use client";

import { useState } from "react";
import { ActivityPanel } from "@/components/activity/activity-panel";
import { WorkStream } from "@/components/dashboard/work-stream";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { toActivityFeedItems } from "@/lib/activity/items";
import { useActivity, useAgentIsLive } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

const activitySkeleton = <TableSkeleton rows={6} />;

/**
 * Full work log (Workshop). Narrative stream is primary; job table is optional detail.
 */
export default function ActivityPage() {
  const activity = useActivity();
  const live = useAgentIsLive();
  const [showJobs, setShowJobs] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-9">
      <PageHeader
        title="Work log"
        description={
          live
            ? "I'm working right now — this feed updates every few seconds."
            : "Everything I've done for this brand, in plain language."
        }
      />
      <Section
        query={activity}
        skeleton={activitySkeleton}
        errorLabel="Couldn't load activity."
      >
        {(data) => {
          const items = toActivityFeedItems(data);
          return (
            <div className="space-y-9">
              <WorkStream items={items} filterable />

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowJobs((v) => !v)}
                  className={cn(
                    "pressable rounded-md text-sm font-medium",
                    showJobs ? "text-foreground" : "text-muted hover-fine:text-foreground",
                  )}
                >
                  {showJobs ? "Hide job detail" : "Show job detail & retries"}
                </button>
                {showJobs ? (
                  <>
                    <p className="text-sm leading-relaxed text-muted">
                      Credits, status chips, and one-click retries for failed runs.
                    </p>
                    <ActivityPanel items={items} />
                  </>
                ) : null}
              </div>
            </div>
          );
        }}
      </Section>
    </div>
  );
}
