"use client";

import { Surface, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArticleCanvas,
  ArticleEditorTopbar,
  ArticleInspector,
  type DestinationItem,
  type EditorFields,
  type EditorIntent,
  type GateResult,
  type QualityCheck,
} from "@/components/articles/article-editor-sections";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ApiError, apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  type Article,
  type IntegrationView,
  type Publication,
  type Topic,
} from "@/lib/api/queries";
import { parseTags } from "@/lib/articles/format";
import {
  notifyPublishResult,
  type PublishSummary,
} from "@/lib/articles/notify-publish";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

type ArticleCache = { article: Article; publications: Publication[] };

type ArticleEditorProps = {
  article: Article;
  publications: Publication[];
  integrations: IntegrationView[];
  topic: Topic | null;
  canPublish: boolean;
};

const providerNames = new Map<string, string>(
  INTEGRATION_PROVIDERS.map((provider) => [provider.id, provider.name]),
);

function parseGateResults(json: string | null | undefined): GateResult[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as GateResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEvidenceSignals(json: string | null | undefined) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const labels = candidates.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      const value = item.sourceType ?? item.source ?? item.name ?? item.title;
      return typeof value === "string" && value.trim() ? [value.trim()] : [];
    });
    return [...new Set(labels)].slice(0, 4);
  } catch {
    return [];
  }
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ArticleEditor({
  article,
  publications,
  integrations,
  topic,
  canPublish,
}: ArticleEditorProps) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<EditorIntent | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [fields, setFields] = useState<EditorFields>({
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription ?? "",
    tags: parseTags(article.tags).join(", "),
    bodyMarkdown: article.bodyMarkdown,
  });
  const gates = useMemo(() => parseGateResults(article.gateResultsJson), [article.gateResultsJson]);
  const evidenceSignals = useMemo(
    () => parseEvidenceSignals(topic?.evidenceJson),
    [topic?.evidenceJson],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      slug: string;
      metaDescription: string;
      tags: string;
      bodyMarkdown: string;
      status: "draft" | "approved";
      expectedVersion: number;
    }) => apiPatch(`/api/articles/${article.id}`, payload),
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
    onSuccess: () => invalidateArticleQueries(),
  });
  const pending = saveMutation.isPending || publishMutation.isPending;

  function invalidateArticleQueries() {
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

  async function save(status: "draft" | "approved", thenPublish: boolean, kind: EditorIntent) {
    setIntent(kind);
    try {
      await saveMutation.mutateAsync({ ...fields, status, expectedVersion: article.version });
      if (thenPublish) {
        notifyPublishResult(await publishMutation.mutateAsync());
      } else {
        toast.success("Draft saved.");
      }
      invalidateArticleQueries();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIntent(null);
    }
  }

  function setField(key: "title" | "slug" | "metaDescription", value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }

  function removeTag(tag: string) {
    setFields((previous) => ({
      ...previous,
      tags: parseTags(previous.tags).filter((item) => item !== tag).join(", "),
    }));
  }

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setFields((previous) => ({
      ...previous,
      tags: [...new Set([...parseTags(previous.tags), trimmed])].join(", "),
    }));
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(fields.slug);
      toast.success("Slug copied.");
    } catch {
      toast.danger("Could not copy the slug.");
    }
  }

  const styleGate = gates.find((gate) => gate.gate === "style-lint");
  const sourceGate = gates.find((gate) => gate.gate === "eeat-source");
  const qualityChecks: QualityCheck[] = [
    {
      label: "Includes citations and sources",
      passed: sourceGate?.passed ?? (/\[[^\]]+\]\([^)]+\)/.test(fields.bodyMarkdown) || evidenceSignals.length > 0),
    },
    { label: "Answers the target query clearly", passed: Boolean(fields.title.trim() && fields.metaDescription.trim()) },
    { label: "Scannable structure and headings", passed: /^#{1,3}\s+.+/m.test(fields.bodyMarkdown) },
    { label: "Brand voice reviewed", passed: styleGate?.passed ?? null },
  ];
  const targetQuery = topic?.keywords?.split(",")[0]?.trim() || topic?.title || fields.title;
  const thesis = topic?.thesis || topic?.rationale || topic?.angle || fields.metaDescription || "No thesis attached yet.";
  const destinationMap = new Map<string, DestinationItem>();
  for (const integration of integrations) {
    destinationMap.set(integration.provider, {
      provider: integration.provider,
      name: integration.name,
      status: integration.requirementsMet ? "Ready" : "Setup needed",
      externalUrl: null,
    });
  }
  for (const publication of publications) {
    destinationMap.set(publication.provider, {
      provider: publication.provider,
      name: providerNames.get(publication.provider) ?? titleCase(publication.provider),
      status: titleCase(publication.status),
      externalUrl: publication.externalUrl,
    });
  }

  return (
    <Surface className="min-h-full bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <ArticleEditorTopbar
        articleId={article.id}
        status={article.status}
        pending={pending}
        isPreview={isPreview}
        canPublish={canPublish}
        intent={intent}
        onTogglePreview={() => setIsPreview((current) => !current)}
        onPublish={() => save("approved", true, "publish")}
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <ArticleCanvas
          article={article}
          fields={fields}
          publications={publications}
          canPublish={canPublish}
          pending={pending}
          intent={intent}
          isPreview={isPreview}
          onFieldChange={setField}
          onCopySlug={copySlug}
          onRemoveTag={removeTag}
          onAddTag={addTag}
          onBodyChange={(bodyMarkdown) => setFields((previous) => ({ ...previous, bodyMarkdown }))}
          onSaveDraft={() => save("draft", false, "draft")}
          onRepublish={() => save("approved", true, "republish")}
        />
        <ArticleInspector
          targetQuery={targetQuery}
          thesis={thesis}
          evidenceSignals={evidenceSignals}
          styleGate={styleGate}
          qualityChecks={qualityChecks}
          destinations={[...destinationMap.values()]}
          gates={gates}
        />
      </div>
      </div>
    </Surface>
  );
}
