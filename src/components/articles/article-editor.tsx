"use client";

import { buttonVariants } from "@heroui/react/button";
import { Chip, Input, Label, Tabs, TextArea, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { ApiError, apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type Article, type Publication } from "@/lib/api/queries";

type ArticleCache = { article: Article; publications: Publication[] };
import { parseTags } from "@/lib/articles/format";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

type ArticleEditorProps = {
  article: {
    id: string;
    title: string;
    slug: string;
    metaDescription: string | null;
    tags: string | null;
    bodyMarkdown: string;
    status: string;
    version: number;
    shape?: string | null;
    gateResultsJson?: string | null;
  };
  publications: Publication[];
  canPublish: boolean;
};

type GateResult = { gate: string; passed: boolean; detail: string };

// Owner-facing names for the machine gates — never show the raw ids.
const GATE_LABELS: Record<string, string> = {
  "style-lint": "Reads human",
  "eeat-source": "Cites a source",
};

function parseGateResults(json: string | null | undefined): GateResult[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as GateResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type Intent = "draft" | "publish" | "republish";

type PublishSummary = {
  ok: boolean;
  published: number;
  skipped: number;
  failed: number;
  unchanged: boolean;
};

// Pick the toast that matches what actually happened on the server: nothing to
// send, a partial failure, or a clean publish.
function notifyPublishResult(summary: PublishSummary) {
  if (summary.unchanged) {
    toast.info("No changes since the last publish — nothing to send.");
  } else if (summary.failed > 0) {
    toast.danger(
      summary.published > 0
        ? "Published, but some destinations failed — see Publishing below."
        : "Publishing failed — see Publishing below.",
    );
  } else {
    toast.success("Publishing to your connected destinations.");
  }
}

// The rich-text editor pulls in tiptap/ProseMirror — a heavy chunk only needed
// on this route. Load it on demand so it doesn't bloat the article page's JS.
const ArticleBodyEditor = dynamic(
  () => import("@/components/articles/article-body-editor").then((m) => m.ArticleBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[420px] animate-pulse rounded-xl border border-border bg-default/40" />
    ),
  },
);

const providerNames = new Map<string, string>(
  INTEGRATION_PROVIDERS.map((provider) => [provider.id, provider.name]),
);

export function ArticleEditor({ article, publications, canPublish }: ArticleEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<Intent | null>(null);
  // Controlled state — HeroUI inputs don't reliably submit via native FormData.
  const [fields, setFields] = useState({
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription ?? "",
    tags: parseTags(article.tags).join(", "),
    bodyMarkdown: article.bodyMarkdown,
  });
  const isApproved = article.status === "approved";

  const set =
    (key: "title" | "slug" | "metaDescription" | "tags") =>
    (event: { target: { value: string } }) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const saveMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      slug: string;
      metaDescription: string;
      tags: string;
      bodyMarkdown: string;
      status: "draft" | "approved";
    }) => apiPatch(`/api/articles/${article.id}`, payload),
    // Write the saved values into the cache up front so the status chip flips
    // (and Re-publish unlocks) immediately instead of after the follow-up GET.
    onMutate: async (payload) => {
      const key = queryKeys.article(article.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ArticleCache>(key);
      queryClient.setQueryData<ArticleCache>(key, (current) =>
        current
          ? {
              ...current,
              article: {
                ...current.article,
                title: payload.title,
                slug: payload.slug,
                metaDescription: payload.metaDescription || null,
                tags: payload.tags || null,
                bodyMarkdown: payload.bodyMarkdown,
                status: payload.status,
              },
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.article(article.id), context.previous);
      }
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => apiPost<PublishSummary>(`/api/articles/${article.id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.article(article.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.articles });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
    },
  });

  const pending = saveMutation.isPending || publishMutation.isPending;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.article(article.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.articles });
    queryClient.invalidateQueries({ queryKey: queryKeys.automation });
    queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
  }

  function handleApiError(error: unknown) {
    if (error instanceof ApiError && error.status === 402) {
      router.push("/account?tab=billing&upgrade=1");
      return;
    }
    toast.danger(getErrorMessage(error));
  }

  // Save the form's current values with an explicit status. Publishing is a
  // separate, explicit step so "Approve & publish" is a single predictable click.
  async function save(status: "draft" | "approved", thenPublish: boolean, kind: Intent) {
    setIntent(kind);
    try {
      await saveMutation.mutateAsync({
        title: fields.title,
        slug: fields.slug,
        metaDescription: fields.metaDescription,
        tags: fields.tags,
        bodyMarkdown: fields.bodyMarkdown,
        status,
      });
      if (thenPublish) {
        const summary = await publishMutation.mutateAsync();
        notifyPublishResult(summary);
      } else {
        toast.success("Draft saved.");
      }
      invalidate();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIntent(null);
    }
  }

  async function republish() {
    setIntent("republish");
    try {
      const summary = await publishMutation.mutateAsync();
      notifyPublishResult(summary);
      invalidate();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIntent(null);
    }
  }

  const gates = parseGateResults(article.gateResultsJson);
  const heldForReview = gates.some((gate) => gate.gate === "style-lint" && !gate.passed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Chip variant="soft">v{article.version}</Chip>
        <Chip color={isApproved ? "success" : "default"} variant="soft">
          {article.status}
        </Chip>
        {article.shape ? <Chip variant="soft">{article.shape}</Chip> : null}
        {gates.map((gate) => (
          <Chip
            key={gate.gate}
            color={gate.passed ? "success" : "warning"}
            variant="soft"
            title={gate.detail}
          >
            {gate.passed ? "✓" : "!"} {GATE_LABELS[gate.gate] ?? gate.gate}
          </Chip>
        ))}
      </div>
      {heldForReview ? (
        <p className="text-sm text-muted">
          Claudia held this draft for your review — it didn&apos;t pass her quality checks:{" "}
          {gates.find((gate) => gate.gate === "style-lint" && !gate.passed)?.detail}
        </p>
      ) : null}

      <Tabs defaultSelectedKey="editor">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Article views" className="w-fit">
            <Tabs.Tab id="editor" className="whitespace-nowrap">
              Editor
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="history" className="whitespace-nowrap">
              <Tabs.Separator />
              History
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="editor">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" value={fields.title} onChange={set("title")} required fullWidth />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" value={fields.slug} onChange={set("slug")} required fullWidth />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaDescription">Meta description</Label>
              <TextArea
                id="metaDescription"
                name="metaDescription"
                value={fields.metaDescription}
                onChange={set("metaDescription")}
                className="min-h-20"
                fullWidth
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" name="tags" value={fields.tags} onChange={set("tags")} fullWidth />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Article body</p>
              <ArticleBodyEditor
                defaultMarkdown={article.bodyMarkdown}
                onChange={(markdown) => setFields((prev) => ({ ...prev, bodyMarkdown: markdown }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {canPublish ? (
                <LoadingButton
                  isPending={intent === "publish"}
                  pendingLabel="Publishing…"
                  isDisabled={pending}
                  onPress={() => save("approved", true, "publish")}
                >
                  Approve &amp; publish
                </LoadingButton>
              ) : null}
              <LoadingButton
                variant={canPublish ? "secondary" : "primary"}
                isPending={intent === "draft"}
                pendingLabel="Saving…"
                isDisabled={pending}
                onPress={() => save("draft", false, "draft")}
              >
                Save as draft
              </LoadingButton>
              {canPublish ? (
                <p className="text-xs text-muted">
                  Approve &amp; publish saves your edits and sends the article to every enabled
                  destination.
                </p>
              ) : (
                <Link
                  href="/account?tab=billing&upgrade=1"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Upgrade to publish
                </Link>
              )}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="history">
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Publishing</h2>
                <p className="mt-1 text-sm text-muted">
                  Per-destination results. Re-publish after fixing a connector or editing an
                  approved article.
                </p>
              </div>
              {canPublish ? (
                <LoadingButton
                  variant="secondary"
                  isPending={intent === "republish"}
                  pendingLabel="Publishing…"
                  isDisabled={!isApproved || pending}
                  onPress={republish}
                >
                  Re-publish
                </LoadingButton>
              ) : (
                <Link
                  href="/account?tab=billing&upgrade=1"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Upgrade to publish
                </Link>
              )}
            </div>

            {!canPublish ? (
              <p className="mt-4 text-sm text-muted">
                Publishing to your connected destinations is available on a paid plan.
              </p>
            ) : !isApproved ? (
              <p className="mt-4 text-sm text-muted">
                Approve the article (above) to publish it to your connected destinations.
              </p>
            ) : null}

            {publications.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No publication attempts yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {publications.map((publication) => (
                  <li key={publication.provider} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {providerNames.get(publication.provider) ?? publication.provider}
                      </p>
                      <Chip
                        color={
                          publication.status === "published"
                            ? "success"
                            : publication.status === "failed"
                              ? "danger"
                              : "default"
                        }
                        variant="soft"
                      >
                        {publication.status}
                      </Chip>
                    </div>
                    {publication.externalUrl ? (
                      <a
                        href={publication.externalUrl}
                        className="mt-2 inline-block text-muted hover:text-foreground"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {publication.externalUrl}
                      </a>
                    ) : null}
                    {publication.errorMessage ? (
                      <p className="mt-2 text-danger">{publication.errorMessage}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted tabular-nums">Attempts: {publication.attemptCount}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
