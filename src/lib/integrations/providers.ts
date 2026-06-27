export const INTEGRATION_PROVIDERS = [
  {
    id: "markdown_export",
    name: "Markdown export",
    description: "Save publish-ready articles as downloadable Markdown files.",
    configurable: true,
    available: true,
  },
  {
    id: "webhook",
    name: "Generic webhook",
    description: "POST article payloads to your own endpoint.",
    configurable: true,
    available: true,
  },
  {
    id: "devto",
    name: "Dev.to",
    description: "Publish to Dev.to with an API key.",
    configurable: true,
    available: true,
  },
  {
    id: "hashnode",
    name: "Hashnode",
    description: "Publish to a Hashnode publication.",
    configurable: true,
    available: true,
  },
  {
    id: "wordpress",
    name: "WordPress",
    description: "Publish via the WordPress REST API and application passwords.",
    configurable: true,
    available: true,
  },
  {
    id: "ghost",
    name: "Ghost",
    description: "Publish to Ghost via the Admin API.",
    configurable: true,
    available: true,
  },
  {
    id: "medium",
    name: "Medium",
    description: "Requires Medium API access that is not broadly available.",
    configurable: false,
    available: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Requires LinkedIn publishing API access.",
    configurable: false,
    available: false,
  },
] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDERS)[number]["id"];

export type IntegrationConfig = {
  webhookUrl?: string;
  siteUrl?: string;
  username?: string;
  publicationId?: string;
  adminApiUrl?: string;
};

export type IntegrationView = {
  provider: IntegrationProviderId;
  name: string;
  description: string;
  enabled: boolean;
  available: boolean;
  configurable: boolean;
  config: IntegrationConfig;
  hasSecret: boolean;
};
