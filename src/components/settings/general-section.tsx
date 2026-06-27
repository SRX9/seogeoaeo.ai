"use client";

import { AutonomyPanel } from "@/components/settings/autonomy-panel";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useMe } from "@/lib/api/queries";

export function GeneralSection() {
  const { data, isLoading, error, refetch } = useMe();

  if (isLoading) {
    return <PageLoader label="Loading settings…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  return <AutonomyPanel currentMode={data.workspace.autonomyMode} />;
}
