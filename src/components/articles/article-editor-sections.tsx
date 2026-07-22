"use client";

import {
  Button,
  Card,
  Input,
  Label,
  ProgressBar,
  Skeleton,
  Table,
  TextArea,
  Tooltip,
} from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState, Segment } from "@heroui-pro/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckIcon,
  CircleCheckIcon,
  GlobeIcon,
  LayersIcon,
  LinkIcon,
  OverviewIcon,
  PlusIcon,
  LaunchIcon,
  SaveIcon,
  InsightIcon,
  XIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import type { Article, Publication } from "@/lib/api/queries";
import { parseTags } from "@/lib/articles/format";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

export type EditorFields = {
  title: string;
  slug: string;
  metaDescription: string;
  tags: string;
  bodyMarkdown: string;
};

export type GateResult = { gate: string; passed: boolean; detail: string };
export type EditorIntent = "draft" | "publish" | "republish";
export type QualityCheck = { label: string; passed: boolean | null };
export type DestinationItem = {
  provider: string;
  name: string;
  status: string;
  externalUrl: string | null;
};

const GATE_LABELS: Record<string, string> = {
  "style-lint": "Brand Voice",
  "eeat-source": "Sources",
};

const providerNames = new Map<string, string>(
  INTEGRATION_PROVIDERS.map((provider) => [provider.id, provider.name]),
);

const ArticleBodyEditor = dynamic(
  () => import("@/components/articles/article-body-editor").then((mod) => mod.ArticleBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 py-6" aria-label="Loading editor">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-5 w-11/12 rounded-lg" />
        <Skeleton className="h-5 w-4/5 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    ),
  },
);

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(status: string) {
  if (status === "published" || status === "approved") return "success" as const;
  if (["failed", "rejected", "error"].includes(status)) return "danger" as const;
  if (["pending", "review", "awaiting_review"].includes(status)) return "warning" as const;
  return "default" as const;
}

export function ArticleEditorTopbar({
  articleId,
  status,
  pending,
  isPreview,
  canPublish,
  intent,
  onTogglePreview,
  onPublish,
}: {
  articleId: string;
  status: string;
  pending: boolean;
  isPreview: boolean;
  canPublish: boolean;
  intent: EditorIntent | null;
  onTogglePreview: () => void;
  onPublish: () => void;
}) {
  return (
    <Card className="gap-4">
      <Card.Header className="flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/articles" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeftIcon className="size-4" />
            Articles
          </Link>
          <ToneText tone={statusColor(status)} className="text-xs">{titleCase(status)}</ToneText>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            {pending ? "Saving changes" : <><CheckIcon className="size-3.5 text-success" />All changes saved</>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/api/articles/${articleId}/export`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowDownIcon className="size-4" />
            <span className="hidden sm:inline">Export Markdown</span>
            <span className="sm:hidden">Export</span>
          </Link>
          <Button size="sm" variant="outline" onPress={onTogglePreview}>
            <OverviewIcon className="size-4" />
            {isPreview ? "Edit" : "Preview"}
          </Button>
          {canPublish ? (
            <LoadingButton
              size="sm"
              isDisabled={pending}
              isPending={intent === "publish"}
              onPress={onPublish}
            >
              <LaunchIcon className="size-4" />
              {intent === "publish" ? "Publishing" : "Approve & Publish"}
            </LoadingButton>
          ) : (
            <Link href="/settings?tab=billing&upgrade=1" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Upgrade to Publish
            </Link>
          )}
        </div>
      </Card.Header>
    </Card>
  );
}

function EditorPanel({
  article,
  fields,
  isPreview,
  pending,
  intent,
  onFieldChange,
  onCopySlug,
  onRemoveTag,
  onAddTag,
  onBodyChange,
  onSaveDraft,
}: {
  article: Article;
  fields: EditorFields;
  isPreview: boolean;
  pending: boolean;
  intent: EditorIntent | null;
  onFieldChange: (key: "title" | "slug" | "metaDescription", value: string) => void;
  onCopySlug: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
  onBodyChange: (markdown: string) => void;
  onSaveDraft: () => void;
}) {
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const tags = parseTags(fields.tags);

  function commitTag() {
    if (!newTag.trim()) return;
    onAddTag(newTag);
    setNewTag("");
    setIsAddingTag(false);
  }

  return (
    <section className="space-y-6" role="tabpanel" aria-label="Article editor">
      <div className="space-y-2">
        <Label htmlFor="article-title">Article Title</Label>
        <TextArea
          id="article-title"
          rows={2}
          value={fields.title}
          onChange={(event) => onFieldChange("title", event.target.value)}
          readOnly={isPreview}
          variant="secondary"
          fullWidth
          className="text-lg font-semibold sm:text-xl"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="article-slug">Slug</Label>
          <div className="flex items-center gap-2">
            <Input
              id="article-slug"
              value={fields.slug}
              onChange={(event) => onFieldChange("slug", event.target.value)}
              readOnly={isPreview}
              variant="secondary"
              fullWidth
            />
            <Tooltip delay={300}>
              <Button isIconOnly size="sm" variant="outline" onPress={onCopySlug} aria-label="Copy article slug">
                <LayersIcon className="size-4" />
              </Button>
              <Tooltip.Content>Copy Slug</Tooltip.Content>
            </Tooltip>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="meta-description">Meta Description</Label>
            <span className="text-xs tabular-nums text-muted">{fields.metaDescription.length}/160</span>
          </div>
          <TextArea
            id="meta-description"
            rows={3}
            value={fields.metaDescription}
            onChange={(event) => onFieldChange("metaDescription", event.target.value)}
            readOnly={isPreview}
            variant="secondary"
            fullWidth
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5">
              <span className="text-sm font-medium text-muted">{tag}</span>
              {!isPreview ? (
                <Tooltip delay={300}>
                  <Button isIconOnly size="sm" variant="ghost" onPress={() => onRemoveTag(tag)} aria-label={`Remove ${tag} tag`}>
                    <XIcon className="size-3.5" />
                  </Button>
                  <Tooltip.Content>Remove Tag</Tooltip.Content>
                </Tooltip>
              ) : null}
            </span>
          ))}
          {!isPreview && isAddingTag ? (
            <Input
              autoFocus
              value={newTag}
              placeholder="New tag"
              aria-label="New tag"
              className="max-w-40"
              variant="secondary"
              onChange={(event) => setNewTag(event.target.value)}
              onBlur={commitTag}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitTag();
                if (event.key === "Escape") setIsAddingTag(false);
              }}
            />
          ) : !isPreview ? (
            <Button size="sm" variant="outline" onPress={() => setIsAddingTag(true)}>
              <PlusIcon className="size-4" />Add Tag
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Article Body</Label>
        <ArticleBodyEditor
          defaultMarkdown={article.bodyMarkdown}
          isReadOnly={isPreview}
          onChange={onBodyChange}
        />
      </div>

      {!isPreview ? (
        <div className="flex justify-end">
          <LoadingButton
            variant="outline"
            isDisabled={pending}
            isPending={intent === "draft"}
            onPress={onSaveDraft}
          >
            <SaveIcon className="size-4" />
            {intent === "draft" ? "Saving" : "Save Draft"}
          </LoadingButton>
        </div>
      ) : null}
    </section>
  );
}

function HistoryPanel({
  publications,
  canPublish,
  isApproved,
  pending,
  intent,
  onRepublish,
}: {
  publications: Publication[];
  canPublish: boolean;
  isApproved: boolean;
  pending: boolean;
  intent: EditorIntent | null;
  onRepublish: () => void;
}) {
  return (
    <section className="space-y-6" role="tabpanel" aria-label="Publishing history">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Publishing History</h2>
          <p className="mt-1 text-sm text-muted">Destination attempts, retries, and failures for this article.</p>
        </div>
        {canPublish ? (
          <LoadingButton
            size="sm"
            variant="outline"
            isDisabled={!isApproved || pending}
            isPending={intent === "republish"}
            onPress={onRepublish}
          >
            <LaunchIcon className="size-4" />
            {intent === "republish" ? "Publishing" : "Republish"}
          </LoadingButton>
        ) : null}
      </div>

      {publications.length === 0 ? (
        <EmptyState className="rounded-2xl bg-surface-secondary" size="sm">
          <EmptyState.Header>
            <EmptyState.Media variant="icon"><LaunchIcon /></EmptyState.Media>
            <EmptyState.Title>No Publication Attempts</EmptyState.Title>
            <EmptyState.Description>Approve and publish this article when the draft is ready.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <Table variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Publishing history" className="min-w-[640px]">
              <Table.Header>
                <Table.Column isRowHeader>Destination</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Attempts</Table.Column>
                <Table.Column>Result</Table.Column>
              </Table.Header>
              <Table.Body>
                {publications.map((publication) => (
                  <Table.Row key={publication.provider} id={publication.provider}>
                    <Table.Cell className="font-medium">{providerNames.get(publication.provider) ?? titleCase(publication.provider)}</Table.Cell>
                    <Table.Cell><ToneText tone={statusColor(publication.status)} className="text-xs">{titleCase(publication.status)}</ToneText></Table.Cell>
                    <Table.Cell><span className="tabular-nums">{publication.attemptCount}</span></Table.Cell>
                    <Table.Cell>
                      {publication.externalUrl ? (
                        <a href={publication.externalUrl} target="_blank" rel="noreferrer" className="text-sm text-accent no-underline hover:underline">View Published Article</a>
                      ) : publication.errorMessage ? (
                        <span className="line-clamp-2 max-w-xs text-sm text-danger">{publication.errorMessage}</span>
                      ) : (
                        <span className="text-sm text-muted">No URL returned</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </section>
  );
}

export function ArticleCanvas({
  article,
  fields,
  publications,
  canPublish,
  pending,
  intent,
  isPreview,
  onFieldChange,
  onCopySlug,
  onRemoveTag,
  onAddTag,
  onBodyChange,
  onSaveDraft,
  onRepublish,
}: {
  article: Article;
  fields: EditorFields;
  publications: Publication[];
  canPublish: boolean;
  pending: boolean;
  intent: EditorIntent | null;
  isPreview: boolean;
  onFieldChange: (key: "title" | "slug" | "metaDescription", value: string) => void;
  onCopySlug: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: (tag: string) => void;
  onBodyChange: (markdown: string) => void;
  onSaveDraft: () => void;
  onRepublish: () => void;
}) {
  const [view, setView] = useState<"editor" | "history">("editor");

  return (
    <Card className="min-w-0 gap-6">
      <Card.Header className="justify-between gap-3">
        <Segment aria-label="Article views" selectedKey={view} size="sm" variant="ghost" onSelectionChange={(key) => setView(String(key) as "editor" | "history")}>
          <Segment.Item id="editor">Editor</Segment.Item>
          <Segment.Item id="history">History</Segment.Item>
        </Segment>
        {isPreview ? <ToneText tone="accent" className="text-xs">Preview Mode</ToneText> : null}
      </Card.Header>
      <Card.Content>
        {view === "editor" ? (
          <EditorPanel
            article={article}
            fields={fields}
            isPreview={isPreview}
            pending={pending}
            intent={intent}
            onFieldChange={onFieldChange}
            onCopySlug={onCopySlug}
            onRemoveTag={onRemoveTag}
            onAddTag={onAddTag}
            onBodyChange={onBodyChange}
            onSaveDraft={onSaveDraft}
          />
        ) : (
          <HistoryPanel
            publications={publications}
            canPublish={canPublish}
            isApproved={article.status === "approved"}
            pending={pending}
            intent={intent}
            onRepublish={onRepublish}
          />
        )}
      </Card.Content>
    </Card>
  );
}

export function ArticleInspector({
  targetQuery,
  thesis,
  evidenceSignals,
  styleGate,
  qualityChecks,
  destinations,
  gates,
}: {
  targetQuery: string;
  thesis: string;
  evidenceSignals: string[];
  styleGate: GateResult | undefined;
  qualityChecks: QualityCheck[];
  destinations: DestinationItem[];
  gates: GateResult[];
}) {
  const voiceScore = styleGate ? (styleGate.passed ? 100 : 35) : 0;

  return (
    <Card className="gap-6 xl:sticky xl:top-8" aria-label="Article brief">
      <Card.Header className="flex-row items-center gap-2">
        <InsightIcon className="size-5 text-accent" />
        <div>
          <Card.Title>Article Brief</Card.Title>
          <Card.Description>Research context and publishing readiness.</Card.Description>
        </div>
      </Card.Header>

      <Card.Content className="space-y-6">
        <section>
          <p className="text-xs font-medium text-muted">Target Query</p>
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-surface-secondary p-3">
            <LinkIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <p className="text-sm leading-5 text-foreground">{targetQuery}</p>
          </div>
        </section>

        <section>
          <p className="text-xs font-medium text-muted">Content Thesis</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{thesis}</p>
        </section>

        <section>
          <p className="text-xs font-medium text-muted">Research Signals</p>
          {evidenceSignals.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {evidenceSignals.map((signal) => <span key={signal} className="text-xs font-medium text-muted">{titleCase(signal)}</span>)}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No research signals are attached yet.</p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted">Brand Voice</p>
            <ToneText tone={styleGate?.passed ? "success" : styleGate ? "danger" : "default"} className="text-xs">
              {styleGate ? (styleGate.passed ? "Aligned" : "Review") : "Not Scored"}
            </ToneText>
          </div>
          <ProgressBar value={voiceScore} size="sm" color={styleGate?.passed ? "success" : styleGate ? "danger" : "default"} aria-label="Brand voice score" className="mt-3">
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
          <p className="mt-2 text-xs leading-5 text-muted">{styleGate?.detail ?? "Run a quality check to compare this draft with your brand voice."}</p>
        </section>

        <section>
          <p className="text-xs font-medium text-muted">Citability Checklist</p>
          <ul className="mt-3 space-y-3">
            {qualityChecks.map((check) => (
              <li key={check.label} className="flex items-start gap-2.5 text-sm">
                {check.passed === null ? (
                  <span className="mt-1 size-3.5 shrink-0 rounded-full bg-surface-tertiary" />
                ) : check.passed ? (
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                )}
                <span className={check.passed === false ? "text-foreground" : "text-muted"}>{check.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="text-xs font-medium text-muted">Publishing Destinations</p>
          {destinations.length > 0 ? (
            <div className="mt-3 space-y-2">
              {destinations.map((destination) => {
                const content = (
                  <>
                    <GlobeIcon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{destination.name}</span>
                    <ToneText tone={destination.status === "Ready" || destination.status === "Published" ? "success" : "default"} className="text-xs">{destination.status}</ToneText>
                  </>
                );
                return destination.externalUrl ? (
                  <a key={destination.provider} href={destination.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm no-underline hover:bg-surface-secondary">{content}</a>
                ) : (
                  <div key={destination.provider} className="flex items-center gap-2 px-2 py-1.5 text-sm">{content}</div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No publishing destination is connected.</p>
          )}
          <Link href="/settings?tab=integrations" className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-2`}>
            <PlusIcon className="size-4" />Add Destination
          </Link>
        </section>
      </Card.Content>

      {gates.length > 0 ? (
        <Card.Footer className="flex-wrap gap-2 border-t border-separator/60 pt-5">
          {gates.map((gate) => (
            <ToneText key={gate.gate} tone={gate.passed ? "success" : "danger"} className="inline-flex items-center gap-1.5 text-xs">
              {gate.passed ? <CheckIcon className="size-3.5" /> : <AlertTriangleIcon className="size-3.5" />}
              {GATE_LABELS[gate.gate] ?? titleCase(gate.gate)}
            </ToneText>
          ))}
        </Card.Footer>
      ) : null}
    </Card>
  );
}
