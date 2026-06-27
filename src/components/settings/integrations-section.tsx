"use client";

import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useIntegrations } from "@/lib/api/queries";

export function IntegrationsSection() {
  const { data, isLoading, error, refetch } = useIntegrations();

  if (isLoading) {
    return <PageLoader label="Loading integrations…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  return <IntegrationsPanel integrations={data.integrations} />;
}
