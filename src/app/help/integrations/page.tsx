import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProviderDefinition,
} from "@/lib/integrations/providers";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Publishing integration setup guide - seogeoaeo.ai",
  description:
    "Step-by-step setup help for Markdown export, webhooks, Dev.to, Hashnode, WordPress, Ghost, and gated social publishing integrations.",
  alternates: { canonical: `${SITE_URL}/help/integrations` },
};

const availableProviders: IntegrationProviderDefinition[] = [];
const gatedProviders: IntegrationProviderDefinition[] = [];

for (const provider of INTEGRATION_PROVIDERS) {
  if (provider.status === "available") {
    availableProviders.push(provider);
  } else {
    gatedProviders.push(provider);
  }
}

function requiredSetup(provider: IntegrationProviderDefinition) {
  const required: string[] = [];

  for (const field of provider.fields) {
    if (field.required) {
      required.push(field.label);
    }
  }

  for (const secret of provider.secrets) {
    if (secret.required) {
      required.push(secret.label);
    }
  }

  return required.length > 0 ? required.join(", ") : "No setup required";
}

function optionalSetup(provider: IntegrationProviderDefinition) {
  const optional: string[] = [];

  for (const field of provider.fields) {
    if (!field.required) {
      optional.push(field.label);
    }
  }

  for (const secret of provider.secrets) {
    if (!secret.required) {
      optional.push(secret.label);
    }
  }

  return optional.length > 0 ? optional.join(", ") : "None";
}

const quickSteps = [
  "Open Settings, then Integrations.",
  "Choose the destination you want to publish to.",
  "Enter only the fields shown for that provider.",
  "Save the connection, then enable it once required setup is complete.",
  "Publish from an approved article or use Markdown export.",
];

const troubleshootingItems = [
  {
    title: "Enable is disabled",
    body: "A required field or required secret is missing. Fill the fields listed below the buttons.",
  },
  {
    title: "Secret looks blank after saving",
    body: "This is expected. Saved secrets are masked and can only be replaced, not viewed.",
  },
  {
    title: "Publish says setup is incomplete",
    body: "Reopen Settings and confirm the integration is enabled and all required fields are still present.",
  },
  {
    title: "Provider returns unauthorized",
    body: "Replace the saved secret and confirm the connected user has publish permissions.",
  },
  {
    title: "Webhook does not receive posts",
    body: "Confirm the URL is HTTPS, publicly reachable, and accepts JSON POST requests.",
  },
];

const supportChecklist = [
  "Destination name.",
  "Whether the integration is enabled.",
  "Any missing required fields shown in Settings.",
  "Approximate publish time and article title.",
  "Provider-side error message if one is visible.",
];

export default function IntegrationsHelpPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-24 sm:pt-32">
        <section className="max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Help</p>
          <h1 className="type-display mt-3 text-4xl text-foreground sm:text-5xl">
            Publishing integration setup guide
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted">
            Use this guide when connecting a publishing destination, replacing a saved
            credential, or troubleshooting a failed publish.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/settings?tab=integrations" className={buttonVariants({ size: "lg" })}>
              Open app settings
            </Link>
            <Link
              href="mailto:hello@seogeoaeo.ai"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Contact support
            </Link>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <Card className="material-panel border-border/50">
            <h2 className="type-title text-xl text-foreground">Quick setup</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
              {quickSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-foreground">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="material-panel border-border/50">
            <h2 className="type-title text-xl text-foreground">Secret safety</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              API keys, application passwords, and tokens are encrypted at rest and are
              never shown again after saving. Settings shows whether a secret is saved,
              and users can enter a new value to replace it.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Clearing an integration disables it, removes non-secret config, and deletes
              its encrypted secret rows.
            </p>
          </Card>
        </section>

        <section className="mt-16">
          <h2 className="type-title text-2xl text-foreground">Available destinations</h2>
          <div className="material-panel mt-6 overflow-hidden rounded-2xl">
            <div className="grid grid-cols-1 divide-y divide-border/50 md:grid-cols-[1fr_1.4fr_1fr] md:divide-x md:divide-y-0">
              <div className="bg-surface-muted/80 px-4 py-3 text-sm font-semibold tracking-tight text-foreground">
                Destination
              </div>
              <div className="bg-surface-muted/80 px-4 py-3 text-sm font-semibold tracking-tight text-foreground">
                Required setup
              </div>
              <div className="bg-surface-muted/80 px-4 py-3 text-sm font-semibold tracking-tight text-foreground">
                Optional setup
              </div>
            </div>
            {availableProviders.map((provider) => (
              <div
                key={provider.id}
                className="grid grid-cols-1 divide-y divide-border/50 border-t border-border/50 md:grid-cols-[1fr_1.4fr_1fr] md:divide-x md:divide-y-0"
              >
                <div className="px-4 py-4">
                  <p className="font-medium tracking-tight text-foreground">{provider.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {provider.description}
                  </p>
                </div>
                <div className="px-4 py-4 text-sm leading-relaxed text-muted">
                  {requiredSetup(provider)}
                </div>
                <div className="px-4 py-4 text-sm leading-relaxed text-muted">
                  {optionalSetup(provider)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="type-title text-2xl text-foreground">Provider notes</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {availableProviders.map((provider) => (
              <Card key={provider.id} className="material-panel border-border/50">
                <h3 className="font-semibold tracking-tight text-foreground">{provider.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {provider.requirements.summary}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {provider.requirements.helpText}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="type-title text-2xl text-foreground">Gated destinations</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            These destinations are listed in Settings so users know what is planned, but
            generic API keys are not collected for them. They require OAuth, approved app
            access, or legacy-token handling that is not implemented yet.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {gatedProviders.map((provider) => (
              <Card key={provider.id} className="material-panel border-border/50">
                <h3 className="font-semibold tracking-tight text-foreground">{provider.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {provider.requirements.summary}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {provider.requirements.helpText}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="type-title text-2xl text-foreground">Troubleshooting</h2>
          <div className="mt-6 divide-y divide-border/40 border-y border-border/40">
            {troubleshootingItems.map((item) => (
              <details key={item.title} className="group py-5">
                <summary className="pressable flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left text-base font-medium tracking-tight text-foreground [&::-webkit-details-marker]:hidden">
                  {item.title}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted transition-transform duration-ui ease-out-strong group-open:rotate-45">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">
                  {item.body}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="material-panel mt-16 rounded-2xl px-5 py-6">
          <h2 className="type-title text-xl text-foreground">When contacting support</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Include these details so support can investigate without asking for secrets:
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">
            {supportChecklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Never send raw API keys, application passwords, OAuth tokens, or Ghost Admin
            API secrets. Replace the saved secret in Settings instead.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
