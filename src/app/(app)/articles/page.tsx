"use client";

import { ArticlesList } from "@/components/articles/articles-list";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { useArticles } from "@/lib/api/queries";

const articlesSkeleton = <TableSkeleton rows={6} />;

export default function ArticlesPage() {
  const articles = useArticles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Articles"
        description="Generated drafts, edits, and publication status."
      />
      <Section
        query={articles}
        skeleton={articlesSkeleton}
        errorLabel="Couldn't load your articles."
      >
        {(data) => <ArticlesList articles={data.articles} />}
      </Section>
    </div>
  );
}
