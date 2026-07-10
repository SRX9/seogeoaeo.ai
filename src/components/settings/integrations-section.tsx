"use client";

import { GoogleTrafficCard } from "@/components/integrations/google-traffic-card";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useGoogleTraffic, useIntegrations } from "@/lib/api/queries";

const integrationsSkeleton = <CardSkeleton lines={4} />;

export function IntegrationsSection() {
  const integrations = useIntegrations();
  const googleTraffic = useGoogleTraffic();

  return (
    <div className="space-y-5">
      <Section
        query={googleTraffic}
        skeleton={<CardSkeleton lines={3} />}
        errorLabel="Couldn't load the traffic connection."
      >
        {(status) => <GoogleTrafficCard status={status} />}
      </Section>

      <Section
        query={integrations}
        skeleton={integrationsSkeleton}
        errorLabel="Couldn't load integrations."
      >
        {(data) => <IntegrationsPanel integrations={data.integrations} />}
      </Section>
    </div>
  );
}
