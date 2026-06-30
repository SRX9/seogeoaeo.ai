"use client";

import { Card, Input, Label, toast } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { CompetitorDiscovery } from "@/components/brand/competitor-discovery";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiDelete, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, type Competitor } from "@/lib/api/queries";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";

type CompetitorsCache = { competitors: Competitor[] };

type CompetitorsPanelProps = {
  competitors: Competitor[];
};

const EMPTY_COMPETITOR = { name: "", url: "", rssUrl: "", sitemapUrl: "" };

export function CompetitorsPanel({ competitors }: CompetitorsPanelProps) {
  // Controlled state — HeroUI inputs don't reliably submit via native FormData.
  const [fields, setFields] = useState(EMPTY_COMPETITOR);

  const atLimit = competitors.length >= MAX_COMPETITORS;

  const set =
    (key: keyof typeof EMPTY_COMPETITOR) =>
    (event: { target: { value: string } }) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const add = useOptimisticMutation<
    unknown,
    { name: string; url: string; rssUrl: string; sitemapUrl: string },
    CompetitorsCache
  >({
    mutationFn: (input) => apiPost("/api/brand/competitors", input),
    queryKey: queryKeys.competitors,
    optimisticUpdate: (current, input) => ({
      competitors: [
        ...(current?.competitors ?? []),
        // Temp id is swapped for the real one when the settle-invalidate lands.
        {
          id: `temp-${Date.now()}`,
          name: input.name,
          url: input.url,
          rssUrl: input.rssUrl || null,
          sitemapUrl: input.sitemapUrl || null,
        },
      ],
    }),
    onSuccess: () => toast.success("Competitor added"),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add competitor")),
  });

  const remove = useOptimisticMutation<unknown, string, CompetitorsCache>({
    mutationFn: (id) => apiDelete(`/api/brand/competitors/${id}`),
    queryKey: queryKeys.competitors,
    optimisticUpdate: (current, id) => ({
      competitors: (current?.competitors ?? []).filter((item) => item.id !== id),
    }),
    onSuccess: () => toast.success("Competitor removed"),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not remove competitor")),
  });

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate(
      {
        name: fields.name.trim(),
        url: fields.url.trim(),
        rssUrl: fields.rssUrl.trim(),
        sitemapUrl: fields.sitemapUrl.trim(),
      },
      { onSuccess: () => setFields(EMPTY_COMPETITOR) },
    );
  }

  return (
    <div className="space-y-4">
      <CompetitorDiscovery />

      <Card>
        <Card.Header>
          <Card.Title>Competitors</Card.Title>
          <Card.Description>
            URLs, RSS feeds, and sitemaps used for research. Up to {MAX_COMPETITORS} per brand.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {atLimit ? (
            <p className="text-sm text-muted">
              You&apos;ve reached the limit of {MAX_COMPETITORS} competitors. Remove one to add
              another.
            </p>
          ) : (
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" value={fields.name} onChange={set("name")} required placeholder="Competitor name" variant="secondary" fullWidth />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Website URL</Label>
                  <Input id="url" name="url" type="url" value={fields.url} onChange={set("url")} required placeholder="https://..." variant="secondary" fullWidth />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rssUrl">RSS URL</Label>
                  <Input id="rssUrl" name="rssUrl" type="url" value={fields.rssUrl} onChange={set("rssUrl")} placeholder="https://.../feed.xml" variant="secondary" fullWidth />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sitemapUrl">Sitemap URL</Label>
                  <Input id="sitemapUrl" name="sitemapUrl" type="url" value={fields.sitemapUrl} onChange={set("sitemapUrl")} placeholder="https://.../sitemap.xml" variant="secondary" fullWidth />
                </div>
              </div>
              <LoadingButton type="submit" isPending={add.isPending} pendingLabel="Saving…">
                Add competitor
              </LoadingButton>
            </form>
          )}
        </Card.Content>
      </Card>

      {competitors.length === 0 ? (
        <p className="text-sm text-muted">No competitors added yet.</p>
      ) : (
        <ul className="space-y-3">
          {competitors.map((competitor) => (
            <li
              key={competitor.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium text-foreground">{competitor.name}</p>
                <a
                  href={competitor.url}
                  className="text-sm text-muted hover:text-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  {competitor.url}
                </a>
                <div className="mt-2 space-y-1 text-xs text-muted">
                  {competitor.rssUrl ? <p>RSS: {competitor.rssUrl}</p> : null}
                  {competitor.sitemapUrl ? <p>Sitemap: {competitor.sitemapUrl}</p> : null}
                </div>
              </div>
              <LoadingButton
                variant="ghost"
                size="sm"
                isPending={remove.isPending && remove.variables === competitor.id}
                isDisabled={remove.isPending}
                pendingLabel="Removing…"
                onPress={() => remove.mutate(competitor.id)}
              >
                Remove
              </LoadingButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
