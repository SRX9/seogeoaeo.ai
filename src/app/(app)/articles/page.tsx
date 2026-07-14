"use client";

import { Card, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { ArticlesList } from "@/components/articles/articles-list";
import { Section } from "@/components/feedback/section";
import { ResearchIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { useArticles, useTopics } from "@/lib/api/queries";

function ArticlesSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading articles">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="gap-3">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-8 w-14 rounded-lg" />
          </Card>
        ))}
      </div>
      <Card className="gap-4">
        <Skeleton className="h-10 w-full rounded-xl sm:max-w-sm" />
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="flex items-center gap-4 py-2">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <Skeleton className="h-5 flex-1 rounded-lg" />
            <Skeleton className="hidden h-5 w-28 rounded-lg sm:block" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function ArticlesPage() {
  const articles = useArticles();
  const topics = useTopics();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Articles"
        description="Create, review, and publish content built to earn search and AI visibility."
        actions={
          <Link href="/topics" className={buttonVariants({ variant: "primary" })}>
            <ResearchIcon className="size-4" />
            Create From Topic
          </Link>
        }
      />

      <Section
        query={articles}
        skeleton={<ArticlesSkeleton />}
        errorLabel="Couldn't load your articles."
      >
        {(data) => (
          <ArticlesList articles={data.articles} topics={topics.data?.topics ?? []} />
        )}
      </Section>
    </main>
  );
}
