"use client";

import { Card } from "@heroui/react";
import { BrandOnboardingForm } from "@/components/brand/brand-onboarding-form";
import { PageLoader } from "@/components/feedback/states";
import { useMe } from "@/lib/api/queries";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

const providerOptions = INTEGRATION_PROVIDERS.flatMap((provider) =>
  provider.available && provider.configurable
    ? [
        {
          id: provider.id,
          name: provider.name,
          description: provider.description,
        },
      ]
    : [],
);

export default function OnboardingPage() {
  const { data, isLoading } = useMe();

  if (isLoading) {
    return <PageLoader label="Loading…" />;
  }

  const isFirst = (data?.brands.length ?? 0) === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {isFirst ? "Set up your first brand" : "Add a new brand"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Register a brand so the agent can research topics and write in its voice. You can switch
          between brands anytime from the sidebar.
        </p>
      </div>

      <Card>
        <Card.Content className="py-6">
          <BrandOnboardingForm providers={providerOptions} />
        </Card.Content>
      </Card>
    </div>
  );
}
