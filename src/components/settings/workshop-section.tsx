import { Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import {
  ActivityIcon,
  ChartBarIcon,
  ChevronRightIcon,
  GaugeIcon,
  PenIcon,
  TopicsIcon,
  WorkshopIcon,
} from "@/components/icons";
import {
  WORKSHOP_LINKS,
  type WorkshopIconId,
  type WorkshopLink,
} from "@/lib/workshop/routes";

const GROUP_LABELS: Record<WorkshopLink["group"], string> = {
  content: "Content",
  visibility: "Visibility",
  ops: "Ops",
};

const ICONS: Record<WorkshopIconId, typeof TopicsIcon> = {
  topics: TopicsIcon,
  pen: PenIcon,
  gauge: GaugeIcon,
  workshop: WorkshopIcon,
  chart: ChartBarIcon,
  activity: ActivityIcon,
};

/**
 * Agent OS "Workshop" index under Brand settings.
 * Default owners never need these for Claudia to work.
 */
export function WorkshopSection() {
  const groups = (["content", "visibility", "ops"] as const).map((group) => ({
    group,
    label: GROUP_LABELS[group],
    links: WORKSHOP_LINKS.filter((l) => l.group === group),
  }));

  return (
    <section className="space-y-6">
      <Card variant="secondary">
        <Card.Header className="gap-3">
          <span className="text-sm font-medium text-accent">Advanced</span>
          <Card.Title>Manual Tools</Card.Title>
          <Card.Description className="max-w-3xl leading-6">
            Run focused checks yourself when you need a closer look. Claudia, Inbox, and Reports
            remain the fastest path for everyday work.
          </Card.Description>
        </Card.Header>
        <Card.Footer>
          <Link
            href="/dashboard"
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Back to Claudia
          </Link>
        </Card.Footer>
      </Card>

      {groups.map(({ group, label, links }) => (
        <Card key={group} className="overflow-hidden p-0">
          <Card.Header className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
            <Card.Title>{label}</Card.Title>
          </Card.Header>
          <Card.Content className="divide-y divide-separator p-0">
            {links.map((link) => {
              const Icon = ICONS[link.icon] ?? WorkshopIcon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex min-h-20 items-center gap-3 px-5 py-4 no-underline outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus sm:px-6"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-muted">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium tracking-tight text-foreground">{link.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">
                        {link.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted/70 group-hover-fine:text-foreground" />
                </Link>
              );
            })}
          </Card.Content>
        </Card>
      ))}
    </section>
  );
}
