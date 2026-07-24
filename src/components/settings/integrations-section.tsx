"use client";

import { GoogleTrafficCard } from "@/components/integrations/google-traffic-card";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useGoogleTraffic, useIntegrations } from "@/lib/api/queries";

export function IntegrationsSection() {
  const integrations = useIntegrations();
  const googleTraffic = useGoogleTraffic();

  return (
    <section className="max-w-6xl space-y-9" aria-labelledby="connections-title">
      <div className="space-y-5">
        <header>
          <h2 id="connections-title" className="text-base font-semibold tracking-tight text-foreground">
            Publishing destinations
          </h2>
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-6 text-muted">
            Choose where completed content should go. Select any publisher to manage its access.
          </p>
        </header>
        <Section query={integrations} skeleton={<CardSkeleton lines={7} />} errorLabel="Couldn't load publishing connections.">
          {(data) => <IntegrationsPanel integrations={data.integrations} />}
        </Section>
      </div>

      <div className="space-y-5 border-t border-separator pt-8">
        <header>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Measurement</h2>
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-6 text-muted">
            Connect Google so Claudia can measure search movement.
          </p>
        </header>
        <Section query={googleTraffic} skeleton={<CardSkeleton lines={5} />} errorLabel="Couldn't load measurement connections.">
          {(status) => <GoogleTrafficCard status={status} />}
        </Section>
      </div>
    </section>
  );
}
