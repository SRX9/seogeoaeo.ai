"use client";

import { Card } from "@heroui/react/card";
import { EmptyState } from "@heroui-pro/react/empty-state";
import Link from "next/link";
import { ChartBarIcon, ChevronRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useReports } from "@/lib/api/queries";
import { weekLabel } from "@/lib/visibility/display";

const reportsSkeleton = <CardSkeleton lines={5} />;

/** AP5 — the weekly report archive: every report Claudia has sent, newest first. */
export default function ReportsPage() {
  const reports = useReports();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-9">
      <PageHeader
        title="Weekly reports"
        description="Claudia's Monday report — what moved, what she did, and what's next."
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
            <div className="space-y-2.5">
              {data.reports.map((report) => (
                <Link key={report.id} href={`/reports/${report.id}`} className="block">
                  <Card className="material-panel surface-interactive group cursor-pointer border-border/50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium tracking-tight text-foreground transition-colors group-hover-fine:text-accent">
                          {weekLabel(report.weekStart)}
                        </p>
                        <p className="mt-0.5 truncate text-sm leading-relaxed text-muted">
                          {report.subject}
                        </p>
                      </div>
                      <ChevronRightIcon className="size-4 shrink-0 text-muted/60 transition-[transform,color] duration-snappy ease-out-strong group-hover-fine:translate-x-0.5 group-hover-fine:text-accent" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )
        }
      </Section>
    </div>
  );
}
