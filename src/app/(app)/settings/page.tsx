"use client";

import { Skeleton, Tabs } from "@heroui/react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { PageHeader } from "@/components/layout/page-header";
import { GoalsSection } from "@/components/settings/goals-section";
import { PublishingSection } from "@/components/settings/publishing-section";
import { WorkPreferencesSection } from "@/components/settings/work-preferences-section";

const BrandSection = dynamic(
  () => import("@/components/settings/brand-section").then((module) => module.BrandSection),
  { loading: () => <SettingsPanelSkeleton /> },
);
const IntegrationsSection = dynamic(
  () => import("@/components/settings/integrations-section").then((module) => module.IntegrationsSection),
  { loading: () => <SettingsPanelSkeleton /> },
);
const BillingSection = dynamic(
  () => import("@/components/settings/billing-section").then((module) => module.BillingSection),
  { loading: () => <SettingsPanelSkeleton /> },
);
const AdvancedSettingsSection = dynamic(
  () => import("@/components/settings/automation-section").then((module) => module.AdvancedSettingsSection),
  { loading: () => <SettingsPanelSkeleton /> },
);

const tabs = [
  { id: "brand", label: "Brand" },
  { id: "goals", label: "Goals" },
  { id: "publishing", label: "Publishing" },
  { id: "preferences", label: "Work preferences" },
  { id: "integrations", label: "Connections" },
  { id: "billing", label: "Billing" },
  { id: "advanced", label: "Advanced" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const TAB_ALIASES: Record<string, TabId> = {
  automation: "publishing",
  connections: "integrations",
  account: "billing",
};

function SettingsPanelSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading settings section">
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-3xl" />
        <Skeleton className="h-52 rounded-3xl" />
      </div>
    </div>
  );
}

function selectedTab(requested: string | null): TabId {
  if (requested && tabs.some((tab) => tab.id === requested)) return requested as TabId;
  return requested ? (TAB_ALIASES[requested] ?? "brand") : "brand";
}

function panelFor(tab: TabId) {
  if (tab === "brand") return <BrandSection />;
  if (tab === "goals") return <GoalsSection />;
  if (tab === "publishing") return <PublishingSection />;
  if (tab === "preferences") return <WorkPreferencesSection />;
  if (tab === "integrations") return <IntegrationsSection />;
  if (tab === "billing") return <BillingSection />;
  return <AdvancedSettingsSection />;
}

function SettingsContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const selected = selectedTab(searchParams.get("tab"));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Settings"
        description="Manage what Claudia knows, what she should prioritize, where she may publish, and how she works."
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

        {tabs.map((tab) => (
          <Tabs.Panel key={tab.id} className="pt-4" id={tab.id}>
            {selected === tab.id ? panelFor(tab.id) : null}
          </Tabs.Panel>
        ))}
      </Tabs>
    </main>
  );
}

function SettingsFallback() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-label="Loading settings">
      <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <SettingsPanelSkeleton />
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
