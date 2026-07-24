"use client";

import { Skeleton, Tabs } from "@heroui/react";
import dynamic from "next/dynamic";
import { redirect, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ClaudiaIcon, GlobeIcon, PlugIcon } from "@/components/icons";
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
const tabs = [
  {
    id: "brand",
    label: "Brand",
    icon: GlobeIcon,
    description: "Shape the context Claudia uses to represent your business.",
  },
  {
    id: "claudia",
    label: "Claudia",
    icon: ClaudiaIcon,
    description: "Choose how Claudia works, publishes, and keeps you updated.",
  },
  {
    id: "integrations",
    label: "Connections",
    icon: PlugIcon,
    description: "Connect publishing destinations and measurement services.",
  },
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
    <div className="space-y-5" aria-label="Loading settings section">
      <Skeleton className="h-36 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
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
  return <IntegrationsSection />;
}

function SettingsContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const selected = selectedTab(requestedTab);
  const selectedTabCopy = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  const legacyAccountTab = requestedTab === "billing" || requestedTab === "account";

  if (legacyAccountTab) {
    const target = new URLSearchParams(searchParams.toString());
    if (requestedTab === "account") target.delete("tab");
    redirect(`/account${target.size ? `?${target.toString()}` : ""}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <PageHeader
        title={`${selectedTabCopy.label} settings`}
        description={selectedTabCopy.description}
        className="pt-1"
      />

      <Tabs
        className="w-full"
        selectedKey={selected}
        onSelectionChange={(key) => {
          const next = String(key) as TabId;
          router.replace(next === "brand" ? "/settings" : `/settings?tab=${next}`, {
            scroll: false,
          });
        }}
      >
        <Tabs.ListContainer className="w-fit max-w-full">
          <Tabs.List
            aria-label="Settings sections"
            className="w-fit gap-0 rounded-xl bg-surface-secondary p-1 *:h-10 *:w-fit *:min-w-0 *:gap-2 *:px-3 *:text-sm *:font-medium *:transition-colors *:duration-200 *:data-[selected=true]:text-foreground sm:*:px-4"
          >
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Tabs.Tab key={tab.id} id={tab.id}>
                  <TabIcon className="size-4" aria-hidden />
                  {tab.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs.ListContainer>

        {tabs.map((tab) => (
          <Tabs.Panel key={tab.id} className="pt-6 outline-none" id={tab.id}>
            {selected === tab.id ? panelFor(tab.id) : null}
          </Tabs.Panel>
        ))}
      </Tabs>
    </main>
  );
}

function SettingsFallback() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8" aria-label="Loading settings">
      <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
      <Skeleton className="h-12 w-72 max-w-full rounded-xl" />
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
