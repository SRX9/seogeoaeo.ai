"use client";

import { Skeleton, Tabs } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { PageHeader } from "@/components/layout/page-header";
import { AutomationSection } from "@/components/settings/automation-section";
import { BrandSection } from "@/components/settings/brand-section";
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
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const selected: TabId = tabs.some((tab) => tab.id === requested)
    ? (requested as TabId)
    : "brand";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Settings"
        description="Shape your brand context, Claudia's guardrails, and the tools connected to your workspace."
      />

      <Tabs
        selectedKey={selected}
        onSelectionChange={(key) => {
          const next = String(key) as TabId;
          router.replace(next === "brand" ? "/settings" : `/settings?tab=${next}`, {
            scroll: false,
          });
        }}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Settings sections">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} id={tab.id}>
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel className="pt-4" id="brand">
          <BrandSection />
        </Tabs.Panel>
        <Tabs.Panel className="pt-4" id="automation">
          <AutomationSection />
        </Tabs.Panel>
        <Tabs.Panel className="pt-4" id="integrations">
          <IntegrationsSection />
        </Tabs.Panel>
        <Tabs.Panel className="pt-4" id="workshop">
          <WorkshopSection />
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}

function SettingsFallback() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-label="Loading settings">
      <div className="space-y-3">
        <Skeleton className="h-10 w-44 rounded-xl" />
        <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </Suspense>
  );
}
