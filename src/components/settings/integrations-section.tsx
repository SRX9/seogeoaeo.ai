"use client";

import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useIntegrations } from "@/lib/api/queries";

export function IntegrationsSection() {
  const integrations = useIntegrations();

  return (
    <Section
      query={integrations}
      skeleton={<CardSkeleton lines={4} />}
      errorLabel="Couldn't load integrations."
    >
      {(data) => <IntegrationsPanel integrations={data.integrations} />}
    </Section>
  );
}
