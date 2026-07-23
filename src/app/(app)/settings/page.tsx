"use client";

import { Skeleton, Tabs } from "@heroui/react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { PageHeader } from "@/components/layout/page-header";

const BrandSection = dynamic(
  () => import("@/components/settings/brand-section").then((module) => module.BrandSection),
  { loading: () => <SettingsPanelSkeleton /> },
);
const ClaudiaSection = dynamic(
  () => import("@/components/settings/claudia-section").then((module) => module.ClaudiaSection),
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
const AccountSection = dynamic(
  () => import("@/components/settings/account-section").then((module) => module.AccountSection),
  { loading: () => <SettingsPanelSkeleton /> },
);

const tabs = [
  { id: "brand", label: "Brand" },
  { id: "claudia", label: "Claudia" },
  { id: "integrations", label: "Connections" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const TAB_ALIASES: Record<string, TabId> = {
  automation: "claudia",
  connections: "integrations",
  goals: "claudia",
  publishing: "claudia",
  preferences: "claudia",
  advanced: "claudia",
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
  if (tab === "claudia") return <ClaudiaSection />;
  if (tab === "integrations") return <IntegrationsSection />;
  if (tab === "billing") return <BillingSection />;
  return <AccountSection />;
}

function SettingsContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const selected = selectedTab(searchParams.get("tab"));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Settings"
        description="Manage your brand, Claudia, connections, plan, and account."
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
