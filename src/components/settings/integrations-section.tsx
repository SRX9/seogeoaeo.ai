"use client";

import { Card } from "@heroui/react";
import { GoogleTrafficCard } from "@/components/integrations/google-traffic-card";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useGoogleTraffic, useIntegrations } from "@/lib/api/queries";

export function IntegrationsSection() {
  const integrations = useIntegrations();
  const googleTraffic = useGoogleTraffic();

  return (
    <section className="space-y-6" aria-labelledby="connections-title">
      <Card className="rounded-3xl p-0">
        <Card.Content className="p-5 sm:p-6">
          <h2 id="connections-title" className="text-lg font-semibold text-foreground">Connections</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Connect the places Claudia may publish and the services she uses to measure results.
          </p>
        </Card.Content>
      </Card>

      <div>
        <h2 className="text-base font-semibold text-foreground">Publishing</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Choose where completed content should go.</p>
        <Section query={integrations} skeleton={<CardSkeleton lines={7} />} errorLabel="Couldn't load publishing connections.">
          {(data) => <IntegrationsPanel integrations={data.integrations} />}
        </Section>
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground">Measurement</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Connect Google so Claudia can measure search movement.</p>
        <Section query={googleTraffic} skeleton={<CardSkeleton lines={5} />} errorLabel="Couldn't load measurement connections.">
          {(status) => <GoogleTrafficCard status={status} />}
        </Section>
      </div>
    </section>
  );
}
