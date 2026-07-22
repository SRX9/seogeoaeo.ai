"use client";

import { Skeleton } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ContentLifecycle,
  type ContentView,
} from "@/components/articles/content-lifecycle";
import { Section } from "@/components/feedback/section";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { combineQueries, useArticles, useTopics } from "@/lib/api/queries";

const CONTENT_VIEWS = new Set<ContentView>(["ideas", "drafts", "completed"]);

function ContentSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading content">
      <Skeleton className="h-12 w-full max-w-md rounded-xl" />
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  );
}

function ContentPageContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view") as ContentView | null;
  const selectedView = requested && CONTENT_VIEWS.has(requested) ? requested : "ideas";
  const query = combineQueries(useArticles(), useTopics());

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-14 pt-8 sm:pt-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-medium text-muted">Content</p>
        <h1 className="type-display mt-3 text-balance text-5xl leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl">
          Ideas become finished content here.
        </h1>
        <p className="mt-5 max-w-[62ch] text-base leading-7 text-muted text-pretty">
          Choose a researched opportunity, review Claudia’s draft, and complete or publish it without changing tools.
        </p>
      </header>

      <Section query={query} skeleton={<ContentSkeleton />} errorLabel="Couldn't load your content.">
        {([articleData, topicData]) => (
          <ContentLifecycle
            articles={articleData.articles}
            topics={topicData.topics}
            selectedView={selectedView}
            onViewChange={(view) =>
              router.replace(view === "ideas" ? "/articles" : `/articles?view=${view}`, {
                scroll: false,
              })
            }
          />
        )}
      </Section>
    </main>
  );
}

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl px-5 py-12">
          <ContentSkeleton />
        </main>
      }
    >
      <ContentPageContent />
    </Suspense>
  );
}
