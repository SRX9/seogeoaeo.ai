"use client";

import { Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { MemoryConflictResolver } from "@/components/activity/memory-conflict-resolver";
import { ObjectiveEditor } from "@/components/activity/objective-editor";
import { StrategyReview } from "@/components/activity/strategy-review";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { ArrowRightIcon, ShieldIcon, WorkshopIcon } from "@/components/icons";
import { ActionHistory } from "@/components/settings/action-history";
import { AutonomyCategories } from "@/components/settings/autonomy-categories";
import { PolicySimulator } from "@/components/settings/policy-simulator";
import { useMe } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

export function AdvancedSettingsSection() {
  const me = useMe();

  return (
    <Section
      query={me}
      skeleton={<CardSkeleton lines={8} className="min-h-[560px] rounded-3xl" />}
      errorLabel="Couldn't load advanced administration."
    >
      {(data) => {
        const activeBrand = data.brands.find((brand) => brand.id === data.activeBrandId) ?? data.brands[0];
        if (!activeBrand) return <Card><Card.Content>No brand selected.</Card.Content></Card>;

        return (
          <div className="space-y-6">
            <Card className="rounded-3xl p-0">
              <Card.Content className="flex items-start gap-4 p-5 sm:p-6">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-warning" aria-hidden>
                  <ShieldIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Technical administration</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                    These controls expose Claudia’s permission rules, internal objective configuration, memory corrections, and action records. Ordinary use does not require them.
                  </p>
                </div>
              </Card.Content>
            </Card>

            <section className="space-y-4" aria-labelledby="advanced-permissions-title">
              <div>
                <h2 id="advanced-permissions-title" className="text-base font-semibold text-foreground">Permissions and policies</h2>
                <p className="mt-1 text-sm text-muted">Fine-grained ceilings and rule simulation for technical administrators.</p>
              </div>
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <AutonomyCategories brandId={activeBrand.id} />
                <PolicySimulator />
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="advanced-planning-title">
              <div>
                <h2 id="advanced-planning-title" className="text-base font-semibold text-foreground">Internal planning and memory</h2>
                <p className="mt-1 text-sm text-muted">Detailed objective, strategy, and memory tools used for support and controlled administration.</p>
              </div>
              <MemoryConflictResolver />
              <ObjectiveEditor />
              <StrategyReview />
            </section>

            <section className="space-y-4" aria-labelledby="advanced-records-title">
              <div>
                <h2 id="advanced-records-title" className="text-base font-semibold text-foreground">Action records and diagnostics</h2>
                <p className="mt-1 text-sm text-muted">Inspect verified external actions or open the diagnostic tool library.</p>
              </div>
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <ActionHistory />
                <Card className="rounded-3xl p-0">
                  <Card.Content className="p-5 sm:p-6">
                    <span className="grid size-10 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
                      <WorkshopIcon className="size-4" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-foreground">Advanced diagnostics</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Run manual inspection tools only when support or a technical administrator needs them.
                    </p>
                    <Link
                      href="/tools"
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "mt-5 min-h-11 gap-2 transition-transform active:scale-[0.96]",
                      )}
                    >
                      Open diagnostics
                      <ArrowRightIcon className="size-4" aria-hidden />
                    </Link>
                  </Card.Content>
                </Card>
              </div>
            </section>
          </div>
        );
      }}
    </Section>
  );
}
