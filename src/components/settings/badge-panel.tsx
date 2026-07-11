"use client";

import { Button, Card, Switch, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandProfile } from "@/lib/api/queries";
import { SITE_URL } from "@/lib/site";

type BadgePanelProps = {
  brandId: string;
  initialEnabled: boolean;
};

/** Hostname of the brand's website (scheme optional), or null. */
function hostOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * V8.6: the public score badge opt-in. Off by default: until the owner flips
 * this on, /api/public/badge 404s for their domain, so their score is never
 * publicly readable. Enabling reveals the embed snippet to copy.
 */
export function BadgePanel({ brandId, initialEnabled }: BadgePanelProps) {
  const [enabled, setEnabled] = useState(() => initialEnabled);
  const queryClient = useQueryClient();
  const domain = hostOf(useBrandProfile().data?.profile.website);

  const update = useMutation({
    mutationFn: (badgePublic: boolean) => apiPatch("/api/brand/settings", { brandId, badgePublic }),
    onSuccess: (_data, badgePublic) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(
        badgePublic
          ? "Badge enabled. You can now embed your score on a public page."
          : "Badge disabled. Your score is private again.",
      );
    },
    onError: (error, badgePublic) => {
      // Revert the optimistic toggle if the save failed.
      setEnabled(!badgePublic);
      toast.danger(getErrorMessage(error, "Could not update the badge setting"));
    },
  });

  const embed = domain
    ? `<a href="${SITE_URL}"><img src="${SITE_URL}/api/public/badge/${domain}" alt="AI Visibility score" width="220" height="48"></a>`
    : null;

  return (
    <Card className="material-panel">
      <Card.Header>
        <Card.Title className="tracking-tight">Public score badge</Card.Title>
        <Card.Description className="leading-relaxed">
          An embeddable SVG badge showing your latest visibility score. Your score stays private
          until you turn this on.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium tracking-tight text-foreground">
                Make my score embeddable
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {enabled
                  ? "Anyone with the badge URL can see your latest score."
                  : "The badge endpoint returns nothing for your domain."}
              </p>
            </div>
            <Switch
              aria-label="Public score badge"
              isSelected={enabled}
              isDisabled={update.isPending}
              onChange={(next) => {
                setEnabled(next);
                update.mutate(next);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          {enabled && embed ? (
            <div className="space-y-2 rounded-2xl border border-border/50 bg-surface/70 p-3.5">
              <p className="text-xs font-medium tracking-[0.01em] text-muted">
                Paste this into your site
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground">
                {embed}
              </pre>
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => {
                  void navigator.clipboard.writeText(embed);
                  toast.success("Embed code copied.");
                }}
              >
                Copy embed code
              </Button>
            </div>
          ) : null}
          {enabled && !embed ? (
            <p className="text-sm leading-relaxed text-muted">
              Add your website in brand settings to get the embed code.
            </p>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
