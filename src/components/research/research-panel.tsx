"use client";

import { toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  CircleCheckIcon,
  GlobeIcon,
  SearchIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/icons";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useCredits, useResearch, useSetupInProgress } from "@/lib/api/queries";

const sources = [
  {
    icon: GlobeIcon,
    title: "Web search",
    description: "Fresh SERP signals and the questions people actually ask.",
  },
  {
    icon: UsersIcon,
    title: "Competitor feeds",
    description: "What rivals publish, where they rank, and what they have missed.",
  },
  {
    icon: TrendingUpIcon,
    title: "Emerging queries",
    description: "Rising searches before they get crowded.",
  },
] as const;

export function ResearchPanel() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data } = useResearch();
  const credits = useCredits();
  const settingUp = useSetupInProgress();
  const latest = data?.latest ?? null;
  const cost = credits.data?.costs.research_run;

  const run = useMutation({
    mutationFn: () => apiPost("/api/research"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      toast.success("Research finished. Your topic queue is ready.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/account?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Research failed. Try again."));
    },
  });

  return (
    <section className="border-y border-separator/70 py-7 sm:py-9">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <SearchIcon className="mt-1 size-5 shrink-0 text-foreground" />
        <div className="space-y-2">
          <h3 className="type-title text-lg text-foreground">Topic research</h3>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            Claudia checks search results, competitor sites, and rising queries. She turns the
            evidence into a ranked list of topics worth writing.
          </p>
        </div>
      </div>

      {/* Sources */}
      <div className="mt-8 grid border-y border-separator/70 sm:grid-cols-3 sm:divide-x sm:divide-separator/70">
        {sources.map((source) => {
          const Icon = source.icon;
          return (
            <div key={source.title} className="border-b border-separator/70 py-5 last:border-b-0 sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <Icon className="size-5 text-foreground" />
              <p className="mt-4 text-sm font-medium tracking-tight text-foreground">
                {source.title}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{source.description}</p>
            </div>
          );
        })}
      </div>

      {/* Action */}
      <div className="mt-8 flex flex-col gap-3 border-t border-border/50 pt-7">
        <LoadingButton
          className="w-fit"
          isPending={run.isPending}
          isDisabled={settingUp}
          pendingLabel="Researching…"
          onPress={() => run.mutate()}
        >
          <SearchIcon className="size-4" />
          {cost ? `Run research · ${cost} credits` : "Run research"}
        </LoadingButton>
        <p className="text-xs leading-relaxed text-muted">
          {settingUp
            ? "Claudia is setting up your brand. Topic research is already running."
            : "Runs in the background and drops scored topics into your queue."}
        </p>
      </div>

      {/* Last run */}
      {latest ? (
        <div className="mt-6 flex items-start gap-3.5 border-t border-separator/70 pt-6">
          <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-foreground">
              <span className="font-medium">Last run</span>
              <span className="capitalize text-muted"> · {latest.status}</span>
              {typeof latest.topicsCreated === "number" ? (
                <span className="text-muted tabular-nums"> · +{latest.topicsCreated} topics</span>
              ) : null}
            </p>
            {latest.summary ? (
              <p className="text-sm leading-relaxed text-muted">{latest.summary}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
