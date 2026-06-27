import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Meter } from "@heroui/react/meter";
import Link from "next/link";
import type { CreditBalance } from "@/lib/api/queries";

type DashboardKpisProps = {
  credits: CreditBalance;
  monthlyCreditGrant: number;
  totalArticles: number;
  approvedArticles: number;
  pendingTopics: number;
};

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
    </Card>
  );
}

function CreditsTile({
  credits,
  monthlyCreditGrant,
}: {
  credits: CreditBalance;
  monthlyCreditGrant: number;
}) {
  const showMeter = monthlyCreditGrant > 0;
  const pct = showMeter ? (credits.monthly / monthlyCreditGrant) * 100 : 0;
  const color = credits.total <= 0 ? "danger" : showMeter && pct <= 20 ? "warning" : "success";

  return (
    <Card>
      <p className="text-sm font-medium text-muted">Credits</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {credits.total.toLocaleString()}
        </span>
        <span className="text-sm text-muted">available</span>
      </div>
      {showMeter ? (
        <>
          <Meter
            aria-label="Monthly credits remaining"
            className="mt-3"
            color={color}
            size="sm"
            value={credits.monthly}
            maxValue={monthlyCreditGrant}
          >
            <Meter.Track>
              <Meter.Fill />
            </Meter.Track>
          </Meter>
          <p className="mt-2 text-xs text-muted tabular-nums">
            {credits.monthly.toLocaleString()} monthly · {credits.purchased.toLocaleString()} top-up
          </p>
        </>
      ) : (
        <Link
          href="/settings?tab=billing"
          className={`${buttonVariants({ size: "sm" })} mt-3`}
        >
          {credits.total > 0 ? "Get more credits" : "View plans"}
        </Link>
      )}
    </Card>
  );
}

export function DashboardKpis({
  credits,
  monthlyCreditGrant,
  totalArticles,
  approvedArticles,
  pendingTopics,
}: DashboardKpisProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CreditsTile credits={credits} monthlyCreditGrant={monthlyCreditGrant} />
      <StatTile label="Articles" value={totalArticles} />
      <StatTile label="Approved" value={approvedArticles} />
      <StatTile label="Topics queued" value={pendingTopics} />
    </div>
  );
}
