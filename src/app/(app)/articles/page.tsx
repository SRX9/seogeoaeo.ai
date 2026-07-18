"use client";

import { Card, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { ArticlesList } from "@/components/articles/articles-list";
import { Section } from "@/components/feedback/section";
import { ResearchIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { combineQueries, useArticles, useAutomation, useTopics } from "@/lib/api/queries";

function ArticlesSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading content">
      {[0, 1].map((section) => (
        <Card key={section} className="space-y-4 rounded-3xl p-6">
          <Skeleton className="h-6 w-36 rounded-lg" />
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20 rounded-xl" />
          ))}
        </Card>
      ))}
    </div>
  );
}

export default function ArticlesPage() {
  const articles = useArticles();
  const topics = useTopics();
  const automation = useAutomation();
  const content = combineQueries(articles, automation);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Content"
        description="Everything Claudia is preparing, publishing, and improving for your brand."
        actions={
          <Link href="/topics" className={buttonVariants({ variant: "outline" })}>
            <ResearchIcon className="size-4" />
            Content ideas
          </Link>
        }
      />

      <Section
        query={content}
        skeleton={<ArticlesSkeleton />}
        errorLabel="Couldn't load your content."
      >
        {([articleData, automationData]) => (
          <ArticlesList
            articles={articleData.articles}
            topics={topics.data?.topics ?? []}
            autoPublish={automationData.autoPublish}
          />
        )}
      </Section>
    </main>
  );
}
