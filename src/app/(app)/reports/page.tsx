"use client";

import { EmptyState } from "@heroui-pro/react/empty-state";
import Link from "next/link";
import { ChartBarIcon, ChevronRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useReports } from "@/lib/api/queries";
import { weekLabel } from "@/lib/visibility/display";

const reportsSkeleton = <CardSkeleton lines={5} />;

/** AP5: the weekly report archive: every report Claudia has sent, newest first. */
export default function ReportsPage() {
  const reports = useReports();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12">
      <PageHeader
        title="Reports"
        description="Every Monday, Claudia records what changed, what she finished, and what comes next."
      />
      <Section query={reports} skeleton={reportsSkeleton} errorLabel="Couldn't load your reports.">
        {(data) =>
          data.reports.length === 0 ? (
            <EmptyState className="material-panel rounded-2xl border-dashed">
              <EmptyState.Header>
                <EmptyState.Media variant="icon">
                  <ChartBarIcon />
                </EmptyState.Media>
                <EmptyState.Title>No reports yet</EmptyState.Title>
                <EmptyState.Description>
                  Claudia sends her first weekly report on Monday, once she has a week of work to
                  show. It lands here and in your inbox.
                </EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <div className="divide-y divide-separator/70 border-y border-separator/70">
              {data.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="group flex min-h-20 items-center justify-between gap-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium tracking-[-0.01em] text-foreground">
                      {weekLabel(report.weekStart)}
                    </p>
                    <p className="mt-1 truncate text-sm leading-relaxed text-muted">
                      {report.subject}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted/70 group-hover-fine:text-foreground" />
                </Link>
              ))}
            </div>
          )
        }
      </Section>
    </div>
  );
}
