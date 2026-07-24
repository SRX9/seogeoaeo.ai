"use client";

import {
  Card,
  Form,
  Input,
  Label,
  ListBox,
  Switch,
  toast,
} from "@heroui/react";
import { Sheet } from "@heroui-pro/react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ChangeEventHandler, type FormEvent } from "react";
import { ArticlesIcon, LinkIcon, ShieldIcon } from "@/components/icons";
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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const selected = integrations.find((item) => item.provider === selectedProvider) ?? null;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-2xl p-0">
        <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
          <Card.Title>All destinations</Card.Title>
          <Card.Description>
            Connected, available, and upcoming publishers are shown together.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-2">
          <ListBox
            aria-label="Publishing destinations"
            selectionMode="none"
            onAction={(key) => setSelectedProvider(String(key))}
          >
            {integrations.map((integration) => {
              const state = connectionState(integration);
              return (
                <ListBox.Item
                  key={integration.provider}
                  id={integration.provider}
                  textValue={integration.name}
                  className="min-h-16 py-3"
                >
                  <ProviderLogo provider={integration.provider} name={integration.name} />
                  <div className="min-w-0 flex-1">
                    <Label className="truncate">{integration.name}</Label>
                    <p className="mt-0.5 text-pretty text-xs leading-5 text-muted">
                      {capabilityLabel(integration)}
                    </p>
                  </div>
                  <ToneText tone={state.tone} className="shrink-0 text-xs">
                    {state.label}
                  </ToneText>
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Card.Content>
      </Card>

      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-start" role="note">
        <ShieldIcon className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Credentials stay protected</p>
          <p className="mt-1 text-pretty text-sm leading-6 text-muted">
            Credentials are encrypted, and Claudia never publishes outside your authority settings.
          </p>
        </div>
        <Link href="/help/integrations" className="text-sm font-medium text-link no-underline">
          Learn more
        </Link>
      </div>

      <Sheet
        isOpen={selected !== null}
        placement="right"
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedProvider(null);
        }}
      >
        <Sheet.Backdrop variant="blur">
          <Sheet.Content className="w-full sm:w-[min(30rem,100vw)]">
            <Sheet.Dialog className="h-full">
              <Sheet.CloseTrigger />
              {selected ? (
                <>
                  <Sheet.Header className="flex-row items-center gap-3 pe-12">
                    <ProviderLogo provider={selected.provider} name={selected.name} large />
                    <div className="min-w-0">
                      <Sheet.Heading>{selected.name}</Sheet.Heading>
                      <ToneText tone={connectionState(selected).tone} className="mt-1 text-xs">
                        {connectionState(selected).label}
                      </ToneText>
                    </div>
                  </Sheet.Header>
                  <Sheet.Body className="overflow-y-auto">
                    <p className="text-pretty text-sm leading-6 text-muted">
                      {selected.description}
                    </p>
                    {selected.status === "available" ? (
                      <IntegrationForm key={selected.provider} integration={selected} />
                    ) : (
                      <div className="mt-6 space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          This connection is not available yet.
                        </p>
                        <p className="text-pretty text-sm leading-6 text-muted">
                          {selected.requirements.helpText}
                        </p>
                      </div>
                    )}
                  </Sheet.Body>
                </>
              ) : null}
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </div>
  );
}

function capabilityLabel(integration: IntegrationView) {
  if (integration.status !== "available") return integration.requirements.summary;
  if (integration.publishMode === "webhook") return "Send content via POST";
  if (integration.publishMode === "export") return "Export .md files";
  if (integration.publishMode === "social_post") return "Publish social posts";
  return integration.provider === "wordpress" ? "Publish posts and pages" : "Publish articles";
}

function connectionState(integration: IntegrationView): {
  label: string;
  tone: "success" | "accent" | "warning" | "default";
} {
  if (integration.enabled) return { label: "Connected", tone: "success" };
  if (integration.status !== "available") return { label: "Coming later", tone: "default" };
  if (integration.requirementsMet) return { label: "Ready", tone: "accent" };
  return { label: "Setup needed", tone: "warning" };
}

const PROVIDER_DOMAINS: Partial<Record<IntegrationView["provider"], string>> = {
  devto: "dev.to",
  ghost: "ghost.org",
  hashnode: "hashnode.com",
  linkedin_article: "linkedin.com",
  linkedin_post: "linkedin.com",
  medium: "medium.com",
  reddit: "reddit.com",
  wordpress: "wordpress.org",
  x_article: "x.com",
  x_post: "x.com",
};

function ProviderLogo({
  provider,
  large = false,
}: {
  provider: IntegrationView["provider"];
  name: string;
  large?: boolean;
}) {
  const size = large ? 44 : 36;
  const domain = PROVIDER_DOMAINS[provider];

  if (domain) {
    return (
      <Image
        alt=""
        aria-hidden
        className="shrink-0 object-contain"
        height={size}
        sizes={`${size}px`}
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        width={size}
      />
    );
  }

  const Icon = provider === "markdown_export" ? ArticlesIcon : LinkIcon;
  return <Icon className={`${large ? "size-7" : "size-5"} shrink-0 text-muted`} aria-hidden />;
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
