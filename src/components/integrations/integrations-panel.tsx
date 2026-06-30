"use client";

import { Card, Chip, Input, Label, toast } from "@heroui/react";
import { useState, type ChangeEventHandler, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPatch, apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, type IntegrationView } from "@/lib/api/queries";

type IntegrationsCache = { integrations: IntegrationView[] };

/** Update one provider's entry in the cached integrations list in place. */
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
      {integrations.map((integration) => (
        <Card key={integration.provider}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Card.Title>{integration.name}</Card.Title>
              <Card.Description>{integration.description}</Card.Description>
            </div>
            <div className="flex items-center gap-2">
              {!integration.available ? (
                <Chip color="warning" variant="soft">
                  Coming soon
                </Chip>
              ) : null}
              {integration.enabled ? (
                <Chip color="success" variant="soft">
                  Enabled
                </Chip>
              ) : null}
            </div>
          </div>

          {integration.configurable && integration.available ? (
            <IntegrationForm integration={integration} />
          ) : null}
        </Card>
      ))}
    </div>
  );
}

type IntegrationFields = {
  webhookUrl: string;
  publicationId: string;
  siteUrl: string;
  username: string;
  adminApiUrl: string;
  apiKey: string;
};

type IntegrationConfigKey = keyof IntegrationView["config"];

/**
 * The fields publishing actually needs before a provider can run, mirroring the
 * guards in each publishing adapter. Used to gate the Enable button so a brand
 * can't switch on an integration that would fail on the first publish.
 */
const REQUIRED_FIELDS: Record<string, { config: IntegrationConfigKey[]; secret: boolean }> = {
  webhook: { config: ["webhookUrl"], secret: false },
  devto: { config: [], secret: true },
  hashnode: { config: ["publicationId"], secret: true },
  wordpress: { config: ["siteUrl", "username"], secret: true },
  ghost: { config: ["adminApiUrl"], secret: true },
};

function buildConfig(provider: string, fields: IntegrationFields): Record<string, string> {
  switch (provider) {
    case "webhook":
      return { webhookUrl: fields.webhookUrl.trim() };
    case "hashnode":
      return { publicationId: fields.publicationId.trim() };
    case "wordpress":
      return {
        siteUrl: fields.siteUrl.trim(),
        username: fields.username.trim(),
      };
    case "ghost":
      return { adminApiUrl: fields.adminApiUrl.trim() };
    default:
      return {};
  }
}

function IntegrationForm({ integration }: { integration: IntegrationView }) {
  // Controlled state — HeroUI inputs don't reliably submit via native FormData.
  // Secrets are never sent back to the client, so apiKey starts empty.
  const [fields, setFields] = useState<IntegrationFields>({
    webhookUrl: integration.config.webhookUrl ?? "",
    publicationId: integration.config.publicationId ?? "",
    siteUrl: integration.config.siteUrl ?? "",
    username: integration.config.username ?? "",
    adminApiUrl: integration.config.adminApiUrl ?? "",
    apiKey: "",
  });

  const set =
    (key: keyof IntegrationFields): ChangeEventHandler<HTMLInputElement> =>
    (event) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

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
    { apiKey?: string; config?: Record<string, string> },
    IntegrationsCache
  >({
    mutationFn: (payload) =>
      apiPut("/api/integrations", { provider: integration.provider, ...payload }),
    queryKey: queryKeys.integrations,
    optimisticUpdate: (current, payload) =>
      patchIntegration(current, integration.provider, (item) => ({
        ...item,
        config: { ...item.config, ...payload.config },
        hasSecret: payload.apiKey ? true : item.hasSecret,
      })),
    invalidateKeys: [queryKeys.onboarding],
    onSuccess: () => toast.success(`${integration.name} connection saved`),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not save connection")),
  });

  const busy = toggle.isPending || save.isPending;

  // A required field counts as satisfied if it's freshly typed or already saved.
  // Secrets never round-trip to the client, so a saved one shows via hasSecret.
  const requirements = REQUIRED_FIELDS[integration.provider];
  const requirementsMet =
    !requirements ||
    (requirements.config.every((key) => Boolean(fields[key].trim() || integration.config[key])) &&
      (!requirements.secret || Boolean(fields.apiKey.trim() || integration.hasSecret)));
  // Only block enabling — disabling an already-enabled provider stays allowed.
  const canToggle = integration.enabled || requirementsMet;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = fields.apiKey.trim();
    save.mutate({ apiKey: apiKey || undefined, config: buildConfig(integration.provider, fields) });
  }

  if (integration.provider === "markdown_export") {
    return (
      <div className="mt-4">
        <LoadingButton
          variant={integration.enabled ? "secondary" : "primary"}
          isPending={toggle.isPending}
          pendingLabel="Saving…"
          onPress={() => toggle.mutate(!integration.enabled)}
        >
          {integration.enabled ? "Disable Markdown export" : "Enable Markdown export"}
        </LoadingButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-4 space-y-3">
      {integration.provider === "webhook" ? (
        <>
          <Field id="webhookUrl" label="Webhook URL" name="webhookUrl" type="url" value={fields.webhookUrl} onChange={set("webhookUrl")} placeholder="https://example.com/hooks/articles" />
          <SecretField hasSecret={integration.hasSecret} value={fields.apiKey} onChange={set("apiKey")} />
        </>
      ) : null}

      {integration.provider === "devto" ? <SecretField id="apiKey" label="Dev.to API key" hasSecret={integration.hasSecret} value={fields.apiKey} onChange={set("apiKey")} /> : null}

      {integration.provider === "hashnode" ? (
        <>
          <Field id="publicationId" label="Publication ID" name="publicationId" value={fields.publicationId} onChange={set("publicationId")} placeholder="64abc..." />
          <SecretField hasSecret={integration.hasSecret} label="Personal access token" value={fields.apiKey} onChange={set("apiKey")} />
        </>
      ) : null}

      {integration.provider === "wordpress" ? (
        <>
          <Field id="siteUrl" label="Site URL" name="siteUrl" type="url" value={fields.siteUrl} onChange={set("siteUrl")} placeholder="https://blog.example.com" />
          <Field id="username" label="WordPress username" name="username" value={fields.username} onChange={set("username")} placeholder="editor" />
          <SecretField hasSecret={integration.hasSecret} label="Application password" value={fields.apiKey} onChange={set("apiKey")} />
        </>
      ) : null}

      {integration.provider === "ghost" ? (
        <>
          <Field id="adminApiUrl" label="Admin API URL" name="adminApiUrl" type="url" value={fields.adminApiUrl} onChange={set("adminApiUrl")} placeholder="https://blog.example.com" />
          <SecretField hasSecret={integration.hasSecret} label="Admin API key (id:secret)" value={fields.apiKey} onChange={set("apiKey")} />
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <LoadingButton type="submit" isPending={save.isPending} pendingLabel="Saving…" isDisabled={busy}>
          Save connection
        </LoadingButton>
        <LoadingButton
          variant="secondary"
          isPending={toggle.isPending}
          pendingLabel="Saving…"
          isDisabled={busy || !canToggle}
          onPress={() => toggle.mutate(!integration.enabled)}
        >
          {integration.enabled ? "Disable" : "Enable"}
        </LoadingButton>
      </div>

      {!canToggle ? (
        <p className="text-sm text-muted">
          Enter the required details above to enable this integration.
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
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} variant="secondary" fullWidth />
    </div>
  );
}

function SecretField({
  id = "apiKey",
  label = "Signing secret",
  hasSecret,
  value,
  onChange,
}: {
  id?: string;
  label?: string;
  hasSecret: boolean;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        value={value}
        onChange={onChange}
        placeholder={hasSecret ? "Saved — enter to replace" : "Required"}
        autoComplete="new-password"
        variant="secondary"
        fullWidth
      />
    </div>
  );
}
