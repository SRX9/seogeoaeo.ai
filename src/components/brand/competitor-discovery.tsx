"use client";

import { Card, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  CompetitorRadar,
  CompetitorSuggestionCard,
} from "@/components/brand/competitor-visuals";
import { LoadingButton } from "@/components/ui/loading-button";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import {
  queryKeys,
  useCompetitors,
  useCredits,
  useSetupInProgress,
  type Competitor,
} from "@/lib/api/queries";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";

type Suggestion = { name: string; url: string; reason?: string };
type CompetitorsCache = { competitors: Competitor[] };

/**
 * AI competitor discovery. Costs credits (charged server-side on a successful
 * run); if the workspace is out of credits the API returns 402 and we surface a
 * top-up prompt. Self-contained (reads its own cost + competitor count) so it
 * can drop into onboarding or settings.
 */
export function CompetitorDiscovery() {
  const queryClient = useQueryClient();
  const { data } = useCompetitors();
  const credits = useCredits();
  const settingUp = useSetupInProgress();
  const competitors = data?.competitors ?? [];
  const cost = credits.data?.costs.competitor_discovery;

  const remaining = MAX_COMPETITORS - competitors.length;
  const atLimit = remaining <= 0;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showUpgrade, setShowUpgrade] = useState(false);

  const discover = useMutation({
    mutationFn: () => apiPost<{ suggestions: Suggestion[] }>("/api/brand/competitors/discover"),
    onSuccess: ({ suggestions: found }) => {
      setShowUpgrade(false);
      setSuggestions(found);
      setSelected(new Set(found.map((s) => s.url)));
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      if (found.length === 0) {
        toast.info("No new competitors found. Try refining your brand profile.");
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        setShowUpgrade(true);
        return;
      }
      toast.danger(getErrorMessage(error, "Could not discover competitors"));
    },
  });

  const addSelected = useOptimisticMutation<unknown, Suggestion[], CompetitorsCache>({
    mutationFn: (picked) =>
      apiPost("/api/brand/competitors/bulk", {
        competitors: picked.map((s) => ({ name: s.name, url: s.url, rssUrl: "", sitemapUrl: "" })),
      }),
    queryKey: queryKeys.competitors,
    optimisticUpdate: (current, picked) => ({
      competitors: [
        ...(current?.competitors ?? []),
        ...picked.map((s, index) => ({
          id: `temp-${Date.now()}-${index}`,
          name: s.name,
          url: s.url,
          rssUrl: null,
          sitemapUrl: null,
        })),
      ],
    }),
    onSuccess: (_data, picked) => {
      setSuggestions([]);
      setSelected(new Set());
      toast.success(`Added ${picked.length} competitor${picked.length === 1 ? "" : "s"}`);
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add competitors")),
  });

  function handleDiscover() {
    setShowUpgrade(false);
    discover.mutate();
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else if (next.size < remaining) {
        next.add(url);
      } else {
        toast.info(`You can add ${remaining} more competitor${remaining === 1 ? "" : "s"}.`);
      }
      return next;
    });
  }

  const picked = suggestions.filter((s) => selected.has(s.url));

  return (
    <Card>
      <Card.Header>
        <Card.Title className="tracking-tight">Find competitors with AI</Card.Title>
        <Card.Description className="leading-relaxed">
          Let the agent search the web and suggest competitors for you to review.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        {atLimit ? (
          <p className="text-sm leading-relaxed text-muted">
            You&apos;ve reached the limit of {MAX_COMPETITORS} competitors.
          </p>
        ) : (
          <>
            <LoadingButton
              type="button"
              isPending={discover.isPending}
              isDisabled={settingUp}
              pendingLabel="Searching…"
              onPress={handleDiscover}
            >
              {suggestions.length > 0
                ? "Search again"
                : cost
                  ? `Find competitors · ${cost} credits`
                  : "Find competitors"}
            </LoadingButton>

            {settingUp ? (
              <p className="text-sm leading-relaxed text-muted">
                Claudia is setting up your brand: competitor discovery runs as part of it.
              </p>
            ) : null}

            {showUpgrade ? (
              <p className="rounded-2xl border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm leading-relaxed text-accent-soft-foreground">
                You&apos;re out of credits.{" "}
                <Link href="/account?tab=billing" className="font-medium underline">
                  Get more credits
                </Link>{" "}
                to let AI find competitors for you.
              </p>
            ) : null}

            {discover.isPending ? (
              <CompetitorRadar
                scanning
                title="Scanning the market"
                subtitle="Checking search results, comparison pages, and recent AI answers."
              />
            ) : null}

            {suggestions.length > 0 ? (
              <div className="space-y-3">
                <CompetitorRadar
                  competitors={suggestions}
                  title={`${suggestions.length} likely rival${suggestions.length === 1 ? "" : "s"} found`}
                  subtitle="Company homepages are weighted above articles, aggregators, and own-domain pages."
                />
                <ul className="space-y-2">
                  {suggestions.map((suggestion) => {
                    const checked = selected.has(suggestion.url);
                    return (
                      <li key={suggestion.url}>
                        <CompetitorSuggestionCard
                          suggestion={suggestion}
                          checked={checked}
                          onToggle={() => toggle(suggestion.url)}
                        />
                      </li>
                    );
                  })}
                </ul>
                <LoadingButton
                  type="button"
                  isPending={addSelected.isPending}
                  isDisabled={picked.length === 0}
                  pendingLabel="Adding…"
                  onPress={() => addSelected.mutate(picked)}
                >
                  Add selected ({picked.length})
                </LoadingButton>
              </div>
            ) : null}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
