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
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Legal</p>
        <h1 className="type-display mt-3 text-4xl text-foreground sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm tracking-[0.01em] text-muted">Last updated: {lastUpdated}</p>
        <p className="mt-6 text-pretty text-base leading-relaxed text-muted">{intro}</p>

        <div className="mt-12 space-y-10">
          {sections.map((section, index) => (
            <section key={section.heading}>
              <h2 className="type-title text-xl text-foreground">
                {index + 1}. {section.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-pretty leading-relaxed text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-14 border-t border-border/40 pt-6 text-sm leading-relaxed text-muted">
          Questions about this policy? Email{" "}
          <a
            href="mailto:hello@seogeoaeo.ai"
            className="pressable rounded-sm text-foreground/80 hover-fine:text-foreground"
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
