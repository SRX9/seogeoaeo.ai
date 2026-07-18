"use client";

import { Card, Input, Label, toast } from "@heroui/react";
import { ListBox } from "@heroui/react/list-box";
import { Select } from "@heroui/react/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiDelete, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type GoogleTrafficStatus } from "@/lib/api/queries";
import { authClient } from "@/lib/auth/client";
import { GOOGLE_TRAFFIC_SCOPES } from "@/lib/integrations/google-scopes";

/**
 * V6.6 connect: "Connect Search Console" card. The OAuth grant is requested on
 * demand with authClient.linkSocial (never at login); once granted the user picks
 * which verified GSC site (and optionally a GA4 property) maps to this brand. The
 * daily job then pulls real traffic into the Proof panel. Proof is never metered.
 */


function lastSyncLabel(iso: string | null): string {
  if (!iso) return "Not synced yet";
  return `Last synced ${new Date(iso).toLocaleDateString()}`;
}

export function GoogleTrafficCard({ status }: { status: GoogleTrafficStatus }) {
  const queryClient = useQueryClient();
  const [selectedSite, setSelectedSite] = useState<string>(status.gsc.siteUrl ?? "");
  const [propertyId, setPropertyId] = useState<string>(status.ga4.propertyId ?? "");
  const [connecting, setConnecting] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.googleTraffic });

  async function connect() {
    setConnecting(true);
    try {
      const callbackURL =
        typeof window !== "undefined" ? window.location.href : "/settings?tab=integrations";
      const { data, error } = await authClient.linkSocial({
        provider: "google",
        scopes: [...GOOGLE_TRAFFIC_SCOPES],
        callbackURL,
      });
      if (error) throw new Error(error.message ?? "Link failed");
      if (data && "url" in data && typeof data.url === "string") {
        window.location.href = data.url; // hand off to Google's consent screen
        return;
      }
      invalidate();
      setConnecting(false);
    } catch (error) {
      toast.danger(getErrorMessage(error, "Couldn't start the Google connection"));
      setConnecting(false);
    }
  }

  const save = useMutation({
    mutationFn: (body: { siteUrl?: string; propertyId?: string }) =>
      apiPost("/api/integrations/google", body),
    onSuccess: () => {
      toast.success("Connection saved. We are pulling your traffic now.");
      invalidate();
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't save the connection")),
  });

  const disconnect = useMutation({
    mutationFn: () => apiDelete("/api/integrations/google"),
    onSuccess: () => {
      toast.success("Disconnected.");
      invalidate();
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't disconnect")),
  });

  const busy = save.isPending || disconnect.isPending;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Card.Title className="tracking-tight">Search Console & Analytics</Card.Title>
          <Card.Description className="leading-relaxed">
            Compare your visibility score with real Google traffic. Add clicks to the score trend and
            use GA4 to track visits from AI assistants.
          </Card.Description>
        </div>
        {status.gsc.connected ? (
          <span className="text-xs font-medium text-success">Connected</span>
        ) : (
          <span className="text-xs font-medium text-muted">Optional</span>
        )}
      </div>

      {/* Not granted: the on-demand OAuth connect. */}
      {status.needsConnect ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            Connect the Google account that owns your Search Console property. We only request
            read-only access, and you can disconnect anytime.
          </p>
          <LoadingButton isPending={connecting} pendingLabel="Opening Google…" onPress={connect}>
            Connect Search Console
          </LoadingButton>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Search Console */}
          <div className="space-y-2">
            <Label>Search Console site</Label>
            {status.gsc.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-secondary px-4 py-3 text-sm">
                <span className="font-medium tracking-tight text-foreground">
                  {status.gsc.siteUrl}
                </span>
                <span className="text-xs tracking-[0.01em] text-muted">
                  {status.gsc.lastError
                    ? `Sync error: ${status.gsc.lastError}`
                    : lastSyncLabel(status.gsc.lastSyncedAt)}
                </span>
              </div>
            ) : status.sites.length > 0 ? (
              <>
                <Select
                  aria-label="Search Console site"
                  variant="secondary"
                  fullWidth
                  placeholder="Choose a verified site"
                  value={selectedSite || null}
                  onChange={(value) => setSelectedSite(value ? String(value) : "")}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {status.sites.map((site) => (
                        <ListBox.Item key={site.siteUrl} id={site.siteUrl} textValue={site.siteUrl}>
                          {site.siteUrl}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <LoadingButton
                  isPending={save.isPending}
                  pendingLabel="Connecting…"
                  isDisabled={busy || !selectedSite}
                  onPress={() => save.mutate({ siteUrl: selectedSite })}
                >
                  Connect this site
                </LoadingButton>
              </>
            ) : (
              <p className="rounded-xl bg-surface-secondary px-4 py-3 text-sm leading-relaxed text-muted">
                No verified Search Console sites found for this Google account. Verify your site in
                Search Console, then reload.
              </p>
            )}
          </div>

          {/* GA4 (optional, manual property id) */}
          <div className="space-y-2">
            <Label htmlFor="ga4-property">GA4 property ID (optional)</Label>
            <Input
              id="ga4-property"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              placeholder="e.g. 123456789"
              variant="secondary"
              fullWidth
            />
            <p className="text-xs leading-relaxed text-muted">
              Adds AI-referral sessions to the Proof panel. Find it in GA4 → Admin → Property
              settings. Leave blank to skip; clear it to stop GA4 sync.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <LoadingButton
              isPending={save.isPending}
              pendingLabel="Saving…"
              isDisabled={busy}
              onPress={() =>
                save.mutate({
                  ...(status.gsc.connected && status.gsc.siteUrl ? { siteUrl: status.gsc.siteUrl } : {}),
                  propertyId,
                })
              }
            >
              {status.gsc.connected ? "Sync now" : "Save"}
            </LoadingButton>
            {(status.gsc.connected || status.ga4.connected) && (
              <LoadingButton
                variant="ghost"
                isPending={disconnect.isPending}
                pendingLabel="Disconnecting…"
                isDisabled={busy}
                onPress={() => disconnect.mutate()}
              >
                Disconnect
              </LoadingButton>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
