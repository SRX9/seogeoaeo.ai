"use client";

import { Card, Tabs } from "@heroui/react";
import { useState } from "react";
import { GoogleTrafficCard } from "@/components/integrations/google-traffic-card";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useGoogleTraffic, useIntegrations } from "@/lib/api/queries";

const tabs = ["Publishing", "Analytics", "Indexing", "Social", "Automation", "Webhooks"] as const;
type ConnectionTab = (typeof tabs)[number];
const integrationsSkeleton = <CardSkeleton lines={7} />;

export function IntegrationsSection() {
  const [activeTab, setActiveTab] = useState<ConnectionTab>("Publishing");
  const integrations = useIntegrations();
  const googleTraffic = useGoogleTraffic();

  return (
    <section className="space-y-6" aria-labelledby="connections-title">
      <Card variant="secondary">
        <Card.Header>
          <Card.Title id="connections-title">Connections</Card.Title>
          <Card.Description>
            Connect the tools Claudia uses to publish, measure, and grow your visibility.
          </Card.Description>
        </Card.Header>
      </Card>

      <Tabs
        variant="secondary"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key) as ConnectionTab)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Connection categories">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab} id={tab}>
                {tab}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {activeTab === "Publishing" ? (
        <Section query={integrations} skeleton={integrationsSkeleton} errorLabel="Couldn't load integrations.">
          {(data) => <IntegrationsPanel integrations={data.integrations} />}
        </Section>
      ) : activeTab === "Analytics" ? (
        <Section query={googleTraffic} skeleton={<CardSkeleton lines={5} />} errorLabel="Couldn't load the traffic connection.">
          {(status) => <GoogleTrafficCard status={status} />}
        </Section>
      ) : (
        <Card className="text-center">
          <Card.Content className="items-center py-12">
            <span className="text-sm font-medium text-accent">{activeTab}</span>
            <h2 className="mt-4 text-xl font-semibold text-foreground">More Connections Are Coming</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              New destinations will appear here when their actions are ready.
            </p>
          </Card.Content>
        </Card>
      )}
    </section>
  );
}
