"use client";

import { Segment } from "@heroui-pro/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react-aria-components";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BrandSection } from "@/components/settings/brand-section";
import { AutomationSection } from "@/components/settings/automation-section";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { WorkshopSection } from "@/components/settings/workshop-section";

const tabs = [
  { id: "brand", label: "Brand" },
  { id: "automation", label: "How I work" },
  { id: "integrations", label: "Connections" },
  { id: "workshop", label: "Workshop" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function SettingsContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const selected: TabId = tabs.some((tab) => tab.id === requested)
    ? (requested as TabId)
    : "brand";

  function selectTab(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Brand"
        description="How Claudia works for this brand — profile, autonomy, connections, and her workshop."
      />

      <Segment
        aria-label="Brand settings sections"
        selectedKey={selected}
        onSelectionChange={(key: Key) => selectTab(String(key))}
      >
        {tabs.map((tab) => (
          <Segment.Item key={tab.id} id={tab.id}>
            <Segment.Separator />
            {tab.label}
          </Segment.Item>
        ))}
      </Segment>

      {selected === "brand" ? <BrandSection /> : null}
      {selected === "automation" ? <AutomationSection /> : null}
      {selected === "integrations" ? <IntegrationsSection /> : null}
      {selected === "workshop" ? <WorkshopSection /> : null}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
