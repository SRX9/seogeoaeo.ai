"use client";

import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useReport } from "@/lib/api/queries";
import { weekLabel } from "@/lib/visibility/display";

const reportSkeleton = <CardSkeleton lines={8} />;

/** AP5 — one archived weekly report, rendered from its stored data. */
export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const report = useReport(params.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          All reports
        </Link>
      </div>
      <Section query={report} skeleton={reportSkeleton} errorLabel="Couldn't load this report.">
        {(data) => (
          <div className="space-y-6">
            <PageHeader
              title={data.report.subject}
              description={weekLabel(data.report.weekStart)}
            />
            <Card>
              <ul className="space-y-3">
                {data.lines.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
            {data.ask ? (
              <Card>
                <p className="text-sm font-medium text-foreground">One thing from you</p>
                <p className="mt-1 text-sm text-muted">{data.ask.what}</p>
                <div className="mt-3">
                  <Link href={data.ask.href} className={buttonVariants({ size: "sm" })}>
                    Take care of it
                  </Link>
                </div>
              </Card>
            ) : (
              <p className="text-sm text-muted">
                Nothing needed from you this week — she&apos;s got it.
              </p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
