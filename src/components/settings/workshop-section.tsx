import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import {
  ActivityIcon,
  ChartBarIcon,
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
      <div className="rounded-xl border border-dashed border-border bg-surface-secondary/40 p-4">
        <p className="text-sm text-foreground">
          <span className="font-medium">Advanced — you don&apos;t need this for me to work.</span>{" "}
          <span className="text-muted">
            These are my workshop tools for technical founders. Most brand owners only use
            Claudia, Inbox, and Reports. Engine contracts are unchanged — same audits, same
            fix payloads, same publish path.
          </span>
        </p>
        <Link
          href="/dashboard"
          className={`${buttonVariants({ size: "sm", variant: "secondary" })} mt-3`}
        >
          Back to Claudia
        </Link>
      </div>

      {groups.map(({ group, label, links }) => (
        <div key={group} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {links.map((link) => {
              const Icon = ICONS[link.icon] ?? WorkshopIcon;
              return (
                <Card key={link.href} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-muted">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{link.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{link.description}</p>
                    </div>
                  </div>
                  <div>
                    <Link
                      href={link.href}
                      className={buttonVariants({ size: "sm", variant: "secondary" })}
                    >
                      Open
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
