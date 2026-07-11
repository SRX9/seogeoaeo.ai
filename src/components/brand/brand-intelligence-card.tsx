"use client";

import { Avatar, Button, Card, Chip, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  type BrandIntelligenceResponse,
} from "@/lib/api/queries";

export function BrandIntelligenceCard({
  brandName,
  intelligence,
}: {
  brandName: string;
  intelligence: BrandIntelligenceResponse;
}) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => apiPost<BrandIntelligenceResponse>("/api/brand/intelligence", {}),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.brandIntelligence, result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success("Brand details are up to date.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not refresh brand details.")),
  });
  const identity = intelligence.identity;
  const data = intelligence.data;
  const location = data?.address
    ? [data.address.city, data.address.stateProvince, data.address.country].filter(Boolean).join(", ")
    : "";
  const facts = [
    data?.email ? `Email · ${data.email}` : null,
    data?.phone ? `Phone · ${data.phone}` : null,
    location ? `Location · ${location}` : null,
    data?.stock?.ticker
      ? `Stock · ${data.stock.ticker}${data.stock.exchange ? ` (${data.stock.exchange})` : ""}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <Card className="material-panel overflow-hidden">
      <Card.Header className="flex-row items-start gap-4">
        <Avatar className="size-14 shrink-0 rounded-2xl border border-border/60 bg-background">
          {identity?.logoUrl ? (
            <Avatar.Image alt={`${brandName} logo`} src={identity.logoUrl} />
          ) : null}
          <Avatar.Fallback>{brandName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Card.Title className="tracking-tight">{identity?.title || brandName}</Card.Title>
          <Card.Description className="mt-1 leading-relaxed">
            {identity?.slogan || "Logo, palette, and public brand facts from your website."}
          </Card.Description>
        </div>
        <Button
          size="sm"
          variant="secondary"
          isPending={refresh.isPending}
          onPress={() => refresh.mutate()}
        >
          Refresh details
        </Button>
      </Card.Header>
      <Card.Content className="space-y-5">
        {identity ? (
          <>
            {identity.description ? (
              <p className="max-w-2xl text-sm leading-7 text-foreground/85">{identity.description}</p>
            ) : null}
            {identity.colors.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Palette</p>
                <div className="flex flex-wrap gap-2">
                  {identity.colors.map((color) => (
                    <Chip key={color.hex} size="sm" variant="soft">
                      <span
                        className="size-3 rounded-full border border-black/10"
                        style={{ backgroundColor: color.hex }}
                      />
                      <Chip.Label>{color.name || color.hex}</Chip.Label>
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            {facts.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Public brand facts">
                {facts.map((fact) => (
                  <Chip key={fact} size="sm" variant="soft">
                    <Chip.Label>{fact}</Chip.Label>
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span>{data?.logos.length ?? 0} logo assets</span>
              <span>{data?.backdrops.length ?? 0} backdrops</span>
              <span>{data?.socials.length ?? 0} social profiles</span>
              <span>{Object.keys(data?.links ?? {}).length} useful links</span>
              <span>
                Updated {new Date(identity.refreshedAt).toLocaleDateString()} · refreshes monthly
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted">
            Add a public website above, then refresh to personalize this workspace with its logo,
            colors, description, and public links.
          </p>
        )}
      </Card.Content>
    </Card>
  );
}
