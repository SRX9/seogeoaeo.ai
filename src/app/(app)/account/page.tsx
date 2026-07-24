"use client";

import { Skeleton, Tabs } from "@heroui/react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { PageHeader } from "@/components/layout/page-header";

const AccountSection = dynamic(
  () => import("@/components/settings/account-section").then((module) => module.AccountSection),
  { loading: () => <AccountPanelSkeleton /> },
);
const BillingSection = dynamic(
  () => import("@/components/settings/billing-section").then((module) => module.BillingSection),
  { loading: () => <AccountPanelSkeleton /> },
);

const tabs = [
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function AccountPanelSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading account section">
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-3xl" />
        <Skeleton className="h-52 rounded-3xl" />
      </div>
    </div>
  );
}

function selectedTab(requested: string | null): TabId {
  return requested === "billing" ? "billing" : "account";
}

function panelFor(tab: TabId) {
  return tab === "billing" ? <BillingSection /> : <AccountSection />;
}

function AccountContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const selected = selectedTab(searchParams.get("tab"));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Account"
        description="Manage your account, plan, and billing."
      />

      <Tabs
        selectedKey={selected}
        onSelectionChange={(key) => {
          const next = String(key) as TabId;
          router.replace(next === "account" ? "/account" : "/account?tab=billing", {
            scroll: false,
          });
        }}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Account sections">
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

function AccountFallback() {
  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4"
      aria-label="Loading account"
    >
      <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <AccountPanelSkeleton />
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountFallback />}>
      <AccountContent />
    </Suspense>
  );
}
