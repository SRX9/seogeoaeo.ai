"use client";

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Label,
  ListBox,
  Switch,
  Tooltip,
  toast,
  type Selection,
} from "@heroui/react";
import Link from "next/link";
import { useState, type ChangeEventHandler, type FormEvent } from "react";
import { ShieldIcon, XIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
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

type IntegrationsPanelProps = { integrations: IntegrationView[] };

export function IntegrationsPanel({ integrations }: IntegrationsPanelProps) {
  const initialProvider =
    integrations.find((item) => item.provider === "wordpress" && item.enabled)?.provider ??
    integrations.find((item) => item.enabled)?.provider ??
    integrations.find((item) => item.provider === "wordpress")?.provider ??
    integrations.find((item) => item.status === "available")?.provider ??
    null;
  const [selectedProvider, setSelectedProvider] = useState<string | null>(initialProvider);
  const selected = integrations.find((item) => item.provider === selectedProvider) ?? null;
  const available = integrations.filter((item) => item.status === "available");

  function changeSelection(keys: Selection) {
    if (keys === "all") return;
    const next = Array.from(keys)[0];
    setSelectedProvider(next == null ? null : String(next));
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <div className="min-w-0 space-y-6">
        <Card className="overflow-hidden p-0">
          <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
            <Card.Title>Publishing Destinations</Card.Title>
            <Card.Description>Select a destination to review or update its connection.</Card.Description>
          </Card.Header>
          <Card.Content className="p-2">
            <ListBox
              aria-label="Publishing destinations"
              selectionMode="single"
              selectedKeys={selectedProvider ? new Set([selectedProvider]) : new Set()}
              onSelectionChange={changeSelection}
            >
              {available.map((integration) => (
                <ListBox.Item key={integration.provider} id={integration.provider} textValue={integration.name}>
                  <ProviderMark provider={integration.provider} name={integration.name} />
                  <div className="min-w-0 flex-1">
                    <Label className="truncate">{integration.name}</Label>
                    <p className="mt-0.5 truncate text-xs text-muted">{capabilityLabel(integration)}</p>
                  </div>
                  <ToneText
                    tone={integration.enabled ? "success" : integration.requirementsMet ? "accent" : "warning"}
                    className="text-xs"
                  >
                    {integration.enabled ? "Connected" : integration.requirementsMet ? "Ready" : "Setup"}
                  </ToneText>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Card.Content>
        </Card>

        <Alert>
          <Alert.Indicator><ShieldIcon className="size-4" /></Alert.Indicator>
          <Alert.Content>
            <Alert.Title>Credentials Stay Protected</Alert.Title>
            <Alert.Description>
              Credentials are encrypted, and Claudia never publishes outside your authority settings.
            </Alert.Description>
          </Alert.Content>
          <Link href="/help/integrations" className="text-sm font-medium text-link no-underline">Learn more</Link>
        </Alert>
      </div>

      {selected ? (
        <Card className="sticky top-6" aria-label={`${selected.name} connection settings`}>
          <Card.Header className="flex-row items-start gap-3">
            <ProviderMark provider={selected.provider} name={selected.name} large />
            <div className="min-w-0 flex-1">
              <Card.Title>{selected.name}</Card.Title>
              <ToneText tone={selected.enabled ? "success" : "warning"} className="text-xs">
                {selected.enabled ? "Connected" : "Setup Required"}
              </ToneText>
            </div>
            <Tooltip delay={250}>
              <Button isIconOnly variant="ghost" aria-label="Close connection details" onPress={() => setSelectedProvider(null)}>
                <XIcon />
              </Button>
              <Tooltip.Content>Close details</Tooltip.Content>
            </Tooltip>
          </Card.Header>
          <Card.Content>
            <p className="text-sm leading-6 text-muted">{selected.description}</p>
            <IntegrationForm integration={selected} />
          </Card.Content>
        </Card>
      ) : (
        <Card variant="secondary" className="sticky top-6">
          <Card.Content className="py-10 text-center text-sm text-muted">
            Select a destination to view its setup.
          </Card.Content>
        </Card>
      )}
    </div>
  );
}

function capabilityLabel(integration: IntegrationView) {
  if (integration.publishMode === "webhook") return "Send content via POST";
  if (integration.publishMode === "export") return "Export .md files";
  if (integration.publishMode === "social_post") return "Publish social posts";
  return integration.provider === "wordpress" ? "Publish posts and pages" : "Publish articles";
}

function ProviderMark({ provider, name, large = false }: { provider: string; name: string; large?: boolean }) {
  const short = provider === "wordpress" ? "W" : provider === "markdown_export" ? "MD" : name.slice(0, 2);
  return (
    <span className={`${large ? "size-11 text-sm" : "size-9 text-xs"} grid shrink-0 place-items-center rounded-xl bg-surface-secondary font-semibold text-foreground`} aria-hidden>
      {short.toUpperCase()}
    </span>
  );
}

function EnableSwitch({ name, enabled, disabled, onToggle }: { name: string; enabled: boolean; disabled: boolean; onToggle: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-secondary px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{enabled ? "Enabled" : "Disabled"}</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {enabled ? `Claudia publishes to ${name}.` : `Turn on to let Claudia publish to ${name}.`}
        </p>
      </div>
      <Switch aria-label={`Enable ${name}`} isSelected={enabled} isDisabled={disabled} onChange={onToggle}>
        <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
      </Switch>
    </div>
  );
}

type DraftState = { config: Record<string, string>; secrets: Record<string, string> };

function initialDraft(integration: IntegrationView): DraftState {
  return {
    config: Object.fromEntries(integration.fields.map((field) => [field.key, integration.config[field.key] ?? ""])),
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
    if (value) secrets[secret.key] = value;
  }
  return secrets;
}

function draftSecretStates(integration: IntegrationView, draft: DraftState): IntegrationSecretStates {
  const enteredSecretStates: IntegrationSecretStates = {};
  for (const secret of integration.secrets) {
    if (draft.secrets[secret.key]?.trim()) enteredSecretStates[secret.key] = true;
  }
  return { ...integration.secretStates, ...enteredSecretStates };
}

function IntegrationForm({ integration }: { integration: IntegrationView }) {
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(integration));
  const setConfig =
    (key: IntegrationConfigKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setDraft((prev) => ({ ...prev, config: { ...prev.config, [key]: event.target.value } }));
  const setSecret =
    (key: IntegrationSecretKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setDraft((prev) => ({ ...prev, secrets: { ...prev.secrets, [key]: event.target.value } }));

  const toggle = useOptimisticMutation<unknown, boolean, IntegrationsCache>({
    mutationFn: (enabled) => apiPatch("/api/integrations", { provider: integration.provider, enabled }),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current, enabled) => patchIntegration(current, integration.provider, (item) => ({ ...item, enabled })),
    invalidateKeys: [queryKeys.onboarding],
    onSuccess: (_data, enabled) => toast.success(enabled ? `${integration.name} enabled` : `${integration.name} disabled`),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update integration")),
  });

  const save = useOptimisticMutation<
    unknown,
    { config: IntegrationConfig; secrets: Partial<Record<IntegrationSecretKey, string>> },
    IntegrationsCache
  >({
    mutationFn: (payload) => apiPut("/api/integrations", { provider: integration.provider, ...payload }),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current, payload) => patchIntegration(current, integration.provider, (item) => {
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
    mutationFn: () => apiDelete(`/api/integrations?provider=${encodeURIComponent(integration.provider)}`),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current) => patchIntegration(current, integration.provider, (item) => ({
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
      <div className="mt-5">
        <EnableSwitch name={integration.name} enabled={integration.enabled} disabled={busy} onToggle={(next) => toggle.mutate(next)} />
      </div>
    );
  }

  return (
    <Form aria-label={`${integration.name} connection`} onSubmit={handleSave} className="mt-5 space-y-4">
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
      <EnableSwitch name={integration.name} enabled={integration.enabled} disabled={busy || !canToggle} onToggle={(next) => toggle.mutate(next)} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <LoadingButton type="submit" isPending={save.isPending} pendingLabel="Saving..." isDisabled={busy}>Save connection</LoadingButton>
        <LoadingButton variant="secondary" isPending={clear.isPending} pendingLabel="Clearing..." isDisabled={busy} onPress={() => clear.mutate()}>Clear connection</LoadingButton>
      </div>
      {!canToggle ? <p className="text-sm text-muted">Add {requirements.missing.join(", ")} before enabling this integration.</p> : null}
    </Form>
  );
}

function Field({ id, label, name, value, onChange, placeholder, type = "text", required, helpText }: {
  id: string; label: string; name: string; value: string; onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string; type?: string; required?: boolean; helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{required ? `${label} *` : label}</Label>
      <Input id={id} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} variant="secondary" fullWidth />
      {helpText ? <p className="text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}

function SecretField({ id, label, hasSecret, value, onChange, placeholder, required, helpText }: {
  id: string; label: string; hasSecret: boolean; value: string; onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string; required?: boolean; helpText?: string;
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
