"use client";

import { Kbd } from "@heroui/react";
import { Command } from "@heroui-pro/react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  ActivityIcon,
  ChartBarIcon,
  ClaudiaIcon,
  GaugeIcon,
  InboxIcon,
  PenIcon,
  SearchIcon,
  SettingsIcon,
  TopicsIcon,
  WorkshopIcon,
} from "@/components/icons";
import { WORKSHOP_LINKS } from "@/lib/workshop/routes";

const PRIMARY = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/reports", label: "Reports", icon: ChartBarIcon },
  { href: "/settings", label: "Brand", icon: SettingsIcon },
] as const;

const WORKSHOP_ICONS = {
  topics: TopicsIcon,
  pen: PenIcon,
  gauge: GaugeIcon,
  workshop: WorkshopIcon,
  chart: ChartBarIcon,
  activity: ActivityIcon,
} as const;

export function AgentCommandMenu({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useProgressRouter();

  function navigate(key: React.Key) {
    onOpenChange(false);
    router.push(String(key));
  }

  return (
    <Command>
      <Command.Backdrop isOpen={isOpen} variant="blur" onOpenChange={onOpenChange}>
        <Command.Container size="lg">
          <Command.Dialog>
            <Command.InputGroup>
              <Command.InputGroup.Prefix><SearchIcon className="size-4" /></Command.InputGroup.Prefix>
              <Command.InputGroup.Input placeholder="Go to a page or Workshop tool…" />
              <Command.InputGroup.ClearButton />
            </Command.InputGroup>
            <Command.List
              onAction={navigate}
              renderEmptyState={() => <p className="p-6 text-center text-sm text-muted">No matching destination.</p>}
            >
              <Command.Group heading="Agent OS">
                {PRIMARY.map((item) => {
                  const Icon = item.icon;
                  return <Command.Item key={item.href} id={item.href} textValue={item.label}><Icon className="size-4" /><span>{item.label}</span></Command.Item>;
                })}
              </Command.Group>
              <Command.Group heading="Workshop">
                {WORKSHOP_LINKS.map((item) => {
                  const Icon = WORKSHOP_ICONS[item.icon];
                  return <Command.Item key={item.href} id={item.href} textValue={`${item.title} ${item.description}`}><Icon className="size-4" /><span>{item.title}</span><span className="ml-auto hidden text-xs text-muted sm:block">{item.description}</span></Command.Item>;
                })}
              </Command.Group>
            </Command.List>
            <Command.Footer className="justify-end">
              <span className="flex items-center gap-2 text-xs text-muted"><Kbd><Kbd.Content>Esc</Kbd.Content></Kbd> Close</span>
            </Command.Footer>
          </Command.Dialog>
        </Command.Container>
      </Command.Backdrop>
    </Command>
  );
}
