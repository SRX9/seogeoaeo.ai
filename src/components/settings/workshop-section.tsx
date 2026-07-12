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
      <div className="border-y border-separator/70 py-5">
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium tracking-tight">
            Advanced tools for checks you want to run yourself
          </span>{" "}
          <span className="text-muted">
            These are my workshop tools for technical founders. Most brand owners only use
            Claudia, Inbox, and Reports. Engine contracts are unchanged: same audits, same
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
        <div key={group} className="space-y-2">
          <h3 className="text-xs font-medium text-muted">
            {label}
          </h3>
          <div className="divide-y divide-separator/70 border-y border-separator/70">
            {links.map((link) => {
              const Icon = ICONS[link.icon] ?? WorkshopIcon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex min-h-20 items-center gap-3 py-4"
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
          </div>
        </div>
      ))}
    </section>
  );
}
