"use client";

import { Button, Card, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArticlesIcon,
  ChevronRightIcon,
  CreditCardIcon,
  PenIcon,
  PlugIcon,
  ShieldIcon,
  UserInputIcon,
} from "@/components/icons";
import { apiGet, apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { LoadingButton } from "@/components/ui/loading-button";
import { queryKeys, type Article } from "@/lib/api/queries";
import { parseTags } from "@/lib/articles/format";
import { notifyPublishError, notifyPublishResult } from "@/lib/articles/notify-publish";
import { cn } from "@/lib/cn";
import type {
  OwnerRequestAction,
  OwnerRequestType,
  OwnerRequestView,
} from "@/lib/inbox/owner-request";

type ExecutableAction = Exclude<OwnerRequestAction, { kind: "link" }>;

function actionBelongsToRequest(
  action: ExecutableAction | undefined,
  request: OwnerRequestView,
) {
  if (!action) return false;
  if (action.kind === "publish_article") {
    return (
      request.primaryAction.kind === "publish_article" &&
      request.primaryAction.articleId === action.articleId
    );
  }
  return (
    request.primaryAction.kind === "approve_change" &&
    request.primaryAction.approvalId === action.approvalId
  );
}

const REQUEST_COPY: Record<
  OwnerRequestType,
  { label: string; Icon: typeof ShieldIcon }
> = {
  content_review: { label: "Content review", Icon: ArticlesIcon },
  connection: { label: "Connection", Icon: PlugIcon },
  permission: { label: "Permission", Icon: ShieldIcon },
  preference: { label: "Your preference", Icon: UserInputIcon },
  billing: { label: "Account", Icon: CreditCardIcon },
  brand_correction: { label: "Brand knowledge", Icon: PenIcon },
};

function invalidateOwnerRequests(queryClient: ReturnType<typeof useQueryClient>) {
  for (const queryKey of [
    queryKeys.inbox,
    queryKeys.inboxSummary,
    queryKeys.dashboard,
    queryKeys.articles,
    queryKeys.activity,
    queryKeys.agentState,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

async function publishArticle(articleId: string) {
  const detail = await apiGet<{ article: Article }>(`/api/articles/${articleId}`);
  const article = detail.article;
  await apiPatch(`/api/articles/${articleId}`, {
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription ?? "",
    tags: parseTags(article.tags).join(", "),
    bodyMarkdown: article.bodyMarkdown,
    status: "approved",
  });
  return apiPost<{
    published: number;
    skipped: number;
    failed: number;
    unchanged?: boolean;
  }>(`/api/articles/${articleId}/publish`);
}

function ActionControl({
  action,
  primary,
  pending,
  onExecute,
}: {
  action: OwnerRequestAction;
  primary: boolean;
  pending: boolean;
  onExecute: (action: ExecutableAction) => void;
}) {
  if (action.kind === "link") {
    return (
      <Link
        href={action.href}
        className={cn(
          buttonVariants({ variant: primary ? "primary" : "secondary" }),
          "min-h-10 active:scale-[0.96]",
        )}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <LoadingButton
      variant={primary ? "primary" : "secondary"}
      isPending={pending}
      isDisabled={pending}
      className="min-h-10 active:scale-[0.96]"
      onPress={() => onExecute(action)}
    >
      {action.label}
    </LoadingButton>
  );
}

function RequestCard({
  request,
  open,
  pending,
  onToggle,
  onExecute,
}: {
  request: OwnerRequestView;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onExecute: (action: ExecutableAction) => void;
}) {
  const { Icon, label } = REQUEST_COPY[request.type];

  return (
    <Card className="p-0" aria-labelledby={`owner-request-${request.id}`}>
      <Button
        variant="ghost"
        className="h-auto min-h-16 w-full justify-start gap-3 rounded-2xl px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
        onPress={onToggle}
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-muted">{label}</span>
          <span
            id={`owner-request-${request.id}`}
            className="mt-1 block text-sm font-semibold text-foreground"
          >
            {request.title}
          </span>
          {!open ? (
            <span className="mt-1 line-clamp-1 block text-xs font-normal text-muted">
              {request.recommendation}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </Button>

      {open ? (
        <div className="space-y-5 px-4 pb-5 sm:px-5">
          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted">What Claudia recommends</p>
              <p className="mt-1 text-sm leading-6 text-foreground">{request.recommendation}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Why it matters</p>
              <p className="mt-1 text-sm leading-6 text-foreground">{request.reason}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">What will change</p>
              <p className="mt-1 text-sm leading-6 text-foreground">{request.changeSummary}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">If you do nothing</p>
              <p className="mt-1 text-sm leading-6 text-foreground">{request.noActionOutcome}</p>
            </div>
          </div>

          {request.readableDetails.length > 0 ? (
            <details className="group border-t border-border pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-medium text-muted hover-fine:text-foreground">
                See details
                <ChevronRightIcon className="size-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
              </summary>
              <dl className="grid gap-3 pb-1 pt-2 sm:grid-cols-2">
                {request.readableDetails.map((detail) => (
                  <div key={`${detail.label}-${detail.value}`} className="min-w-0">
                    <dt className="text-xs font-medium text-muted">{detail.label}</dt>
                    <dd className="mt-1 break-words text-sm leading-6 text-foreground">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionControl
              action={request.alternativeAction}
              primary={false}
              pending={pending}
              onExecute={onExecute}
            />
            <ActionControl
              action={request.primaryAction}
              primary
              pending={pending}
              onExecute={onExecute}
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function OwnerRequestList({ requests }: { requests: OwnerRequestView[] }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(() => requests[0]?.id ?? null);
  const execute = useMutation({
    mutationFn: async (action: ExecutableAction) => {
      if (action.kind === "publish_article") {
        const result = await publishArticle(action.articleId);
        notifyPublishResult(result);
        return;
      }
      await apiPatch("/api/agent/approvals", {
        approvalId: action.approvalId,
        decision: action.kind === "approve_change" ? "approved" : "rejected",
      });
      toast.success(
        action.kind === "approve_change"
          ? "Change approved. Claudia will continue automatically."
          : "Claudia will keep the current setup.",
      );
    },
    onError: (error, action) => {
      if (action.kind === "publish_article") {
        notifyPublishError(error);
        return;
      }
      toast.danger(getErrorMessage(error, "Couldn't save that decision."));
    },
    onSettled: () => invalidateOwnerRequests(queryClient),
  });

  useEffect(() => {
    if (openId && !requests.some((request) => request.id === openId)) {
      setOpenId(requests[0]?.id ?? null);
    }
  }, [openId, requests]);

  return (
    <section className="space-y-3" aria-label="Decisions needing your input">
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          open={openId === request.id}
          pending={execute.isPending && actionBelongsToRequest(execute.variables, request)}
          onToggle={() => setOpenId((current) => (current === request.id ? null : request.id))}
          onExecute={(action) => execute.mutate(action)}
        />
      ))}
    </section>
  );
}
