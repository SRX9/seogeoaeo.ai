export const INTEGRATION_PROVIDER_IDS = [
  "markdown_export",
  "webhook",
  "devto",
  "hashnode",
  "wordpress",
  "ghost",
  "medium",
  "reddit",
  "x_post",
  "x_article",
  "linkedin_post",
  "linkedin_article",
] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDER_IDS)[number];

export type IntegrationProviderStatus = "available" | "gated" | "unavailable";
export type IntegrationPublishMode = "article" | "social_post" | "webhook" | "export";
export type IntegrationFieldValidation = "text" | "url";

export type IntegrationConfig = {
  webhookUrl?: string;
  siteUrl?: string;
  username?: string;
  publicationId?: string;
  adminApiUrl?: string;
  subreddit?: string;
  postType?: string;
  accountId?: string;
  pageId?: string;
};

export type IntegrationConfigKey = keyof IntegrationConfig;

export type IntegrationSecretKey =
  | "webhook_bearer_token"
  | "webhook_signing_secret"
  | "devto_api_key"
  | "hashnode_token"
  | "wordpress_application_password"
  | "ghost_admin_api_key";

export type IntegrationFieldDefinition = {
  key: IntegrationConfigKey;
  label: string;
  placeholder?: string;
  required: boolean;
  validation: IntegrationFieldValidation;
  helpText?: string;
};

export type IntegrationSecretDefinition = {
  key: IntegrationSecretKey;
  label: string;
  placeholder?: string;
  required: boolean;
  helpText?: string;
  legacyKeys?: string[];
};

export type IntegrationRequirements = {
  summary: string;
  helpText: string;
  docsLabel?: string;
};

export type IntegrationProviderDefinition = {
  id: IntegrationProviderId;
  name: string;
  description: string;
  publishMode: IntegrationPublishMode;
  status: IntegrationProviderStatus;
  fields: IntegrationFieldDefinition[];
  secrets: IntegrationSecretDefinition[];
  requirements: IntegrationRequirements;
};

export type IntegrationSecretStates = Partial<Record<IntegrationSecretKey, boolean>>;

export type IntegrationView = IntegrationProviderDefinition & {
  provider: IntegrationProviderId;
  enabled: boolean;
  config: IntegrationConfig;
  secretStates: IntegrationSecretStates;
  requirementsMet: boolean;
  /**
   * Backward-compatible flags for older consumers. New UI should use `status`.
   */
  available: boolean;
  configurable: boolean;
};

export class IntegrationValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "IntegrationValidationError";
  }
}

const legacyApiKey = ["api_key"];

const PROVIDER_DEFINITIONS: Record<IntegrationProviderId, IntegrationProviderDefinition> = {
  markdown_export: {
    id: "markdown_export",
    name: "Markdown export",
    description: "Save publish-ready articles as downloadable Markdown files.",
    publishMode: "export",
    status: "available",
    fields: [],
    secrets: [],
    requirements: {
      summary: "No setup required.",
      helpText: "Enable this destination to make approved articles available as Markdown exports.",
    },
  },
  webhook: {
    id: "webhook",
    name: "Generic webhook",
    description: "POST article payloads to your own endpoint.",
    publishMode: "webhook",
    status: "available",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://example.com/hooks/articles",
        required: true,
        validation: "url",
      },
    ],
    secrets: [
      {
        key: "webhook_bearer_token",
        label: "Bearer token",
        placeholder: "Optional",
        required: false,
        helpText: "Sent as an Authorization: Bearer header.",
        legacyKeys: legacyApiKey,
      },
      {
        key: "webhook_signing_secret",
        label: "Signing secret",
        placeholder: "Optional",
        required: false,
        helpText: "Used to add an x-seo-ai-signature HMAC header.",
      },
    ],
    requirements: {
      summary: "Requires an HTTPS endpoint that accepts article JSON payloads.",
      helpText: "Optional bearer and signing secrets can protect the endpoint.",
    },
  },
  devto: {
    id: "devto",
    name: "Dev.to",
    description: "Publish articles to Dev.to using a Dev.to API key.",
    publishMode: "article",
    status: "available",
    fields: [],
    secrets: [
      {
        key: "devto_api_key",
        label: "Dev.to API key",
        placeholder: "Required",
        required: true,
        legacyKeys: legacyApiKey,
      },
    ],
    requirements: {
      summary: "Requires a Dev.to API key with article publishing access.",
      helpText: "The key is sent with Dev.to's api-key header and is stored encrypted.",
      docsLabel: "Dev.to API keys",
    },
  },
  hashnode: {
    id: "hashnode",
    name: "Hashnode",
    description: "Publish articles to a Hashnode publication.",
    publishMode: "article",
    status: "available",
    fields: [
      {
        key: "publicationId",
        label: "Publication ID",
        placeholder: "64abc...",
        required: true,
        validation: "text",
      },
    ],
    secrets: [
      {
        key: "hashnode_token",
        label: "Personal access token",
        placeholder: "Required",
        required: true,
        legacyKeys: legacyApiKey,
      },
    ],
    requirements: {
      summary: "Requires a Hashnode publication ID and personal access token.",
      helpText: "The token is used for Hashnode's authenticated publishPost GraphQL mutation.",
      docsLabel: "Hashnode GraphQL API",
    },
  },
  wordpress: {
    id: "wordpress",
    name: "WordPress",
    description: "Publish via the WordPress REST API and application passwords.",
    publishMode: "article",
    status: "available",
    fields: [
      {
        key: "siteUrl",
        label: "Site URL",
        placeholder: "https://blog.example.com",
        required: true,
        validation: "url",
      },
      {
        key: "username",
        label: "WordPress username",
        placeholder: "editor",
        required: true,
        validation: "text",
      },
    ],
    secrets: [
      {
        key: "wordpress_application_password",
        label: "Application password",
        placeholder: "Required",
        required: true,
        legacyKeys: legacyApiKey,
      },
    ],
    requirements: {
      summary: "Requires a WordPress site URL, username, and application password.",
      helpText: "The adapter creates posts through /wp-json/wp/v2/posts with authenticated access.",
      docsLabel: "WordPress application passwords",
    },
  },
  ghost: {
    id: "ghost",
    name: "Ghost",
    description: "Publish articles to Ghost via the Admin API.",
    publishMode: "article",
    status: "available",
    fields: [
      {
        key: "adminApiUrl",
        label: "Admin API URL",
        placeholder: "https://blog.example.com",
        required: true,
        validation: "url",
      },
    ],
    secrets: [
      {
        key: "ghost_admin_api_key",
        label: "Admin API key (id:secret)",
        placeholder: "Required",
        required: true,
        legacyKeys: legacyApiKey,
      },
    ],
    requirements: {
      summary: "Requires a Ghost Admin API URL and Admin API key.",
      helpText: "Ghost Admin API keys must be entered in id:secret format.",
      docsLabel: "Ghost Admin API",
    },
  },
  medium: {
    id: "medium",
    name: "Medium",
    description: "Medium publishing is limited to legacy API token access.",
    publishMode: "article",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Medium no longer works as a normal new-user API-key destination.",
      helpText:
        "Existing legacy integration tokens need custom handling, so this connector is gated until legacy-token support is added.",
    },
  },
  reddit: {
    id: "reddit",
    name: "Reddit",
    description: "Share generated content to Reddit after OAuth support is added.",
    publishMode: "social_post",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Requires a registered Reddit app and OAuth authorization.",
      helpText:
        "Posting needs user-authorized OAuth credentials and submit permissions. OAuth setup is not implemented yet.",
    },
  },
  x_post: {
    id: "x_post",
    name: "X post",
    description: "Create short-form posts on X after OAuth support is added.",
    publishMode: "social_post",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Requires X API access and authenticated post creation scopes.",
      helpText:
        "Posting needs app access plus user-context OAuth. This product does not collect those credentials until OAuth support is implemented.",
    },
  },
  x_article: {
    id: "x_article",
    name: "X article",
    description: "Publish long-form X content after API access support is added.",
    publishMode: "article",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Requires X API access for authenticated content publishing.",
      helpText:
        "Long-form publishing needs approved API access and OAuth. This connector is gated until that flow exists.",
    },
  },
  linkedin_post: {
    id: "linkedin_post",
    name: "LinkedIn post",
    description: "Publish social updates to LinkedIn after API access support is added.",
    publishMode: "social_post",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Requires LinkedIn API access and member or organization posting scopes.",
      helpText:
        "LinkedIn posting needs an approved app and OAuth. This product does not collect those credentials yet.",
    },
  },
  linkedin_article: {
    id: "linkedin_article",
    name: "LinkedIn article",
    description: "Publish LinkedIn articles after API access support is added.",
    publishMode: "article",
    status: "gated",
    fields: [],
    secrets: [],
    requirements: {
      summary: "Requires LinkedIn API access and publishing scopes.",
      helpText:
        "Article publishing needs an approved app and OAuth. This connector is gated until that flow exists.",
    },
  },
};

export const INTEGRATION_PROVIDERS = INTEGRATION_PROVIDER_IDS.map(
  (id) => PROVIDER_DEFINITIONS[id],
);

export function getIntegrationProvider(
  provider: string,
): IntegrationProviderDefinition | null {
  return (PROVIDER_DEFINITIONS as Record<string, IntegrationProviderDefinition | undefined>)[
    provider
  ] ?? null;
}

export function isIntegrationProviderId(provider: string): provider is IntegrationProviderId {
  return provider in PROVIDER_DEFINITIONS;
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldValueSatisfies(field: IntegrationFieldDefinition, value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return false;
  }
  return field.validation !== "url" || isUrl(trimmed);
}

function allowedFieldKeys(provider: IntegrationProviderDefinition) {
  return new Set(provider.fields.map((field) => field.key));
}

function allowedSecretKeys(provider: IntegrationProviderDefinition) {
  return new Set(provider.secrets.map((secret) => secret.key));
}

export function validateIntegrationConfigInput(
  providerId: IntegrationProviderId,
  input: unknown,
): IntegrationConfig {
  const provider = PROVIDER_DEFINITIONS[providerId];
  if (input === undefined || input === null) {
    return {};
  }
  if (!isPlainObject(input)) {
    throw new IntegrationValidationError("Integration config must be an object.");
  }

  const fieldsByKey = new Map(provider.fields.map((field) => [field.key, field]));
  const allowed = allowedFieldKeys(provider);
  const config: IntegrationConfig = {};

  for (const key of Object.keys(input)) {
    if (!allowed.has(key as IntegrationConfigKey)) {
      throw new IntegrationValidationError(`Unsupported config field: ${key}`);
    }
  }

  for (const [key, field] of fieldsByKey) {
    const raw = input[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw !== "string") {
      throw new IntegrationValidationError(`${field.label} must be text.`);
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (value.length > 500) {
      throw new IntegrationValidationError(`${field.label} is too long.`);
    }
    if (field.validation === "url" && !isUrl(value)) {
      throw new IntegrationValidationError(`${field.label} must be a valid URL.`);
    }
    config[key] = value;
  }

  return config;
}

export function validateIntegrationSecretsInput(
  providerId: IntegrationProviderId,
  input: unknown,
): Partial<Record<IntegrationSecretKey, string>> {
  const provider = PROVIDER_DEFINITIONS[providerId];
  if (input === undefined || input === null) {
    return {};
  }
  if (!isPlainObject(input)) {
    throw new IntegrationValidationError("Integration secrets must be an object.");
  }

  const secretsByKey = new Map(provider.secrets.map((secret) => [secret.key, secret]));
  const allowed = allowedSecretKeys(provider);
  const secrets: Partial<Record<IntegrationSecretKey, string>> = {};

  for (const key of Object.keys(input)) {
    if (!allowed.has(key as IntegrationSecretKey)) {
      throw new IntegrationValidationError(`Unsupported secret field: ${key}`);
    }
  }

  for (const [key, secret] of secretsByKey) {
    const raw = input[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw !== "string") {
      throw new IntegrationValidationError(`${secret.label} must be text.`);
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (value.length > 1000) {
      throw new IntegrationValidationError(`${secret.label} is too long.`);
    }
    secrets[key] = value;
  }

  return secrets;
}

export function integrationRequirements(
  provider: IntegrationProviderDefinition,
  config: IntegrationConfig,
  secretStates: IntegrationSecretStates,
) {
  if (provider.status !== "available") {
    return {
      met: false,
      missing: [provider.requirements.summary],
    };
  }

  const missingFields = provider.fields
    .filter((field) => field.required && !fieldValueSatisfies(field, config[field.key]))
    .map((field) => field.label);
  const missingSecrets = provider.secrets
    .filter((secret) => secret.required && !secretStates[secret.key])
    .map((secret) => secret.label);
  const missing = [...missingFields, ...missingSecrets];

  return {
    met: missing.length === 0,
    missing,
  };
}

export function integrationRequirementsMet(
  provider: IntegrationProviderDefinition,
  config: IntegrationConfig,
  secretStates: IntegrationSecretStates,
) {
  return integrationRequirements(provider, config, secretStates).met;
}

export function emptySecretStates(
  provider: IntegrationProviderDefinition,
): IntegrationSecretStates {
  return Object.fromEntries(provider.secrets.map((secret) => [secret.key, false]));
}
