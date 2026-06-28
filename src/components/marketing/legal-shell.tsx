import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export type LegalSection = {
  heading: string;
  body: string[];
};

type LegalShellProps = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

/** Shared layout + typography for the Privacy and Terms pages. */
export function LegalShell({ title, lastUpdated, intro, sections }: LegalShellProps) {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-24 sm:pt-32">
        <p className="text-sm font-medium uppercase tracking-wider text-muted">Legal</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted">Last updated: {lastUpdated}</p>
        <p className="mt-6 text-pretty leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {index + 1}. {section.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-pretty leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-border/60 pt-6 text-sm text-muted">
          Questions about this policy? Email{" "}
          <a
            href="mailto:hello@seogeoaeo.ai"
            className="text-foreground/80 hover:text-foreground"
          >
            hello@seogeoaeo.ai
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
