"use client";

import { Card, Chip, Input, Label, toast } from "@heroui/react";
import Link from "next/link";
import { useState, type ChangeEventHandler, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiDelete, apiPatch, apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, type IntegrationView } from "@/lib/api/queries";
import {
  emptySecretStates,
  integrationRequirements,
  type IntegrationConfig,
  type IntegrationConfigKey,
  type IntegrationSecretKey,
  type IntegrationSecretStates,
} from "@/lib/integrations/providers";

type IntegrationsCache = { integrations: IntegrationView[] };

function patchIntegration(
  current: IntegrationsCache | undefined,
  provider: string,
  patch: (integration: IntegrationView) => IntegrationView,
): IntegrationsCache | undefined {
  if (!current) return current;
  return {
    integrations: current.integrations.map((item) =>
      item.provider === provider ? patch(item) : item,
    ),
  };
}

type IntegrationsPanelProps = {
  integrations: IntegrationView[];
};

export function IntegrationsPanel({ integrations }: IntegrationsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Need setup help?</p>
          <p className="mt-1 text-sm text-muted">
            Follow the integration guide for required fields, saved secrets, and
            troubleshooting.
          </p>
        </div>
        <Link
          href="/help/integrations"
          className="text-sm font-medium text-foreground/80 hover:text-foreground"
        >
          View guide
        </Link>
      </div>

      {integrations.map((integration) => (
        <Card key={integration.provider}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Card.Title>{integration.name}</Card.Title>
              <Card.Description>{integration.description}</Card.Description>
            </div>
            <div className="flex items-center gap-2">
              <StatusChip integration={integration} />
              {integration.enabled ? (
                <Chip color="success" variant="soft">
                  Enabled
                </Chip>
              ) : null}
            </div>
          </div>

          <p className="mt-3 text-sm text-muted">{integration.requirements.summary}</p>
          <p className="mt-1 text-xs text-muted">{integration.requirements.helpText}</p>

          {integration.status === "available" ? (
            <IntegrationForm integration={integration} />
          ) : (
            <div className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
              This destination is not configurable yet. No credentials are needed here.
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function StatusChip({ integration }: { integration: IntegrationView }) {
  if (integration.status === "available") {
    return (
      <Chip color="success" variant="soft">
        Available
      </Chip>
    );
  }
  if (integration.status === "gated") {
    return (
      <Chip color="warning" variant="soft">
        Gated
      </Chip>
    );
  }
  return (
    <Chip color="danger" variant="soft">
      Unavailable
    </Chip>
  );
}

type DraftState = {
  config: Record<string, string>;
  secrets: Record<string, string>;
};

function initialDraft(integration: IntegrationView): DraftState {
  return {
    config: Object.fromEntries(
      integration.fields.map((field) => [field.key, integration.config[field.key] ?? ""]),
    ),
    secrets: Object.fromEntries(integration.secrets.map((secret) => [secret.key, ""])),
  };
}

function draftConfig(integration: IntegrationView, draft: DraftState): IntegrationConfig {
  return Object.fromEntries(
    integration.fields.map((field) => [field.key, draft.config[field.key]?.trim() ?? ""]),
  ) as IntegrationConfig;
}

function draftSecrets(integration: IntegrationView, draft: DraftState) {
  const secrets: Partial<Record<IntegrationSecretKey, string>> = {};
  for (const secret of integration.secrets) {
    const value = draft.secrets[secret.key]?.trim();
    if (value) {
      secrets[secret.key] = value;
    }
  }
  return secrets;
}

function draftSecretStates(
  integration: IntegrationView,
  draft: DraftState,
): IntegrationSecretStates {
  const enteredSecretStates: IntegrationSecretStates = {};
  for (const secret of integration.secrets) {
    if (draft.secrets[secret.key]?.trim()) {
      enteredSecretStates[secret.key] = true;
    }
  }

  return {
    ...integration.secretStates,
    ...enteredSecretStates,
  };
}

function IntegrationForm({ integration }: { integration: IntegrationView }) {
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(integration));

  const setConfig =
    (key: IntegrationConfigKey): ChangeEventHandler<HTMLInputElement> =>
    (event) =>
      setDraft((prev) => ({
        ...prev,
        config: { ...prev.config, [key]: event.target.value },
      }));

  const setSecret =
    (key: IntegrationSecretKey): ChangeEventHandler<HTMLInputElement> =>
    (event) =>
      setDraft((prev) => ({
        ...prev,
        secrets: { ...prev.secrets, [key]: event.target.value },
      }));

  const toggle = useOptimisticMutation<unknown, boolean, IntegrationsCache>({
    mutationFn: (enabled) =>
      apiPatch("/api/integrations", { provider: integration.provider, enabled }),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current, enabled) =>
      patchIntegration(current, integration.provider, (item) => ({ ...item, enabled })),
    invalidateKeys: [queryKeys.onboarding],
    onSuccess: (_data, enabled) =>
      toast.success(enabled ? `${integration.name} enabled` : `${integration.name} disabled`),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update integration")),
  });

  const save = useOptimisticMutation<
    unknown,
    { config: IntegrationConfig; secrets: Partial<Record<IntegrationSecretKey, string>> },
    IntegrationsCache
  >({
    mutationFn: (payload) =>
      apiPut("/api/integrations", { provider: integration.provider, ...payload }),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current, payload) =>
      patchIntegration(current, integration.provider, (item) => {
        const secretStates = {
          ...item.secretStates,
          ...Object.fromEntries(Object.keys(payload.secrets).map((key) => [key, true])),
        };
        return {
          ...item,
          config: { ...item.config, ...payload.config },
          secretStates,
          requirementsMet: integrationRequirements(item, payload.config, secretStates).met,
        };
      }),
    invalidateKeys: [queryKeys.onboarding],
    onSuccess: () => toast.success(`${integration.name} connection saved`),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not save connection")),
  });

  const clear = useOptimisticMutation<unknown, void, IntegrationsCache>({
    mutationFn: () =>
      apiDelete(`/api/integrations?provider=${encodeURIComponent(integration.provider)}`),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current) =>
      patchIntegration(current, integration.provider, (item) => ({
        ...item,
        enabled: false,
        config: {},
        secretStates: emptySecretStates(item),
        requirementsMet: integrationRequirements(item, {}, emptySecretStates(item)).met,
      })),
    invalidateKeys: [queryKeys.onboarding],
    onSuccess: () => {
      setDraft(initialDraft({ ...integration, config: {}, secretStates: emptySecretStates(integration) }));
      toast.success(`${integration.name} connection cleared`);
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not clear connection")),
  });

  const config = draftConfig(integration, draft);
  const secretStates = draftSecretStates(integration, draft);
  const requirements = integrationRequirements(integration, config, secretStates);
  const busy = toggle.isPending || save.isPending || clear.isPending;
  const canToggle = integration.enabled || requirements.met;
  const hasSetupFields = integration.fields.length > 0 || integration.secrets.length > 0;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({ config, secrets: draftSecrets(integration, draft) });
  }

  if (!hasSetupFields) {
    return (
      <div className="mt-4">
        <LoadingButton
          variant={integration.enabled ? "secondary" : "primary"}
          isPending={toggle.isPending}
          pendingLabel="Saving..."
          isDisabled={busy}
          onPress={() => toggle.mutate(!integration.enabled)}
        >
          {integration.enabled ? `Disable ${integration.name}` : `Enable ${integration.name}`}
        </LoadingButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-3">
      {integration.fields.map((field) => (
        <Field
          key={field.key}
          id={`${integration.provider}-${field.key}`}
          label={field.label}
          name={field.key}
          type={field.validation === "url" ? "url" : "text"}
          value={draft.config[field.key] ?? ""}
          onChange={setConfig(field.key)}
          placeholder={field.placeholder}
          required={field.required}
          helpText={field.helpText}
        />
      ))}

      {integration.secrets.map((secret) => (
        <SecretField
          key={secret.key}
          id={`${integration.provider}-${secret.key}`}
          label={secret.label}
          hasSecret={Boolean(integration.secretStates[secret.key])}
          value={draft.secrets[secret.key] ?? ""}
          onChange={setSecret(secret.key)}
          placeholder={secret.placeholder}
          required={secret.required}
          helpText={secret.helpText}
        />
      ))}

      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="submit"
          isPending={save.isPending}
          pendingLabel="Saving..."
          isDisabled={busy}
        >
          Save connection
        </LoadingButton>
        <LoadingButton
          variant="secondary"
          isPending={toggle.isPending}
          pendingLabel="Saving..."
          isDisabled={busy || !canToggle}
          onPress={() => toggle.mutate(!integration.enabled)}
        >
          {integration.enabled ? "Disable" : "Enable"}
        </LoadingButton>
        <LoadingButton
          variant="ghost"
          isPending={clear.isPending}
          pendingLabel="Clearing..."
          isDisabled={busy}
          onPress={() => clear.mutate()}
        >
          Clear
        </LoadingButton>
      </div>

      {!canToggle ? (
        <p className="text-sm text-muted">
          Add {requirements.missing.join(", ")} before enabling this integration.
        </p>
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  helpText,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{required ? `${label} *` : label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        variant="secondary"
        fullWidth
      />
      {helpText ? <p className="text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}

function SecretField({
  id,
  label,
  hasSecret,
  value,
  onChange,
  placeholder,
  required,
  helpText,
}: {
  id: string;
  label: string;
  hasSecret: boolean;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{required ? `${label} *` : label}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        value={value}
        onChange={onChange}
        placeholder={hasSecret ? "Saved, enter to replace" : (placeholder ?? "Required")}
        autoComplete="new-password"
        variant="secondary"
        fullWidth
      />
      {helpText ? <p className="text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}
