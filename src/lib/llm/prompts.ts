import { ARTICLE_SHAPES, type ArticleShape } from "@/lib/articles/shapes";
import type { LintHit } from "@/lib/articles/style-lint";

export type BrandContext = {
  productDescription?: string | null;
  audience?: string | null;
  tone?: string | null;
  website?: string | null;
  seedKeywords?: string | null;
  /** Rendered voice-doc block (words we use/avoid, stance, learned rules). */
  voice?: string | null;
};

export type TopicInput = {
  title: string;
  angle?: string | null;
  keywords?: string | null;
};

export type ArticleMetadata = {
  title: string;
  slug: string;
  metaDescription: string;
  tags: string[];
};

function brandBlock(brand: BrandContext) {
  return [
    brand.productDescription ? `Product: ${brand.productDescription}` : null,
    brand.audience ? `Audience: ${brand.audience}` : null,
    brand.tone ? `Tone: ${brand.tone}` : null,
    brand.website ? `Website: ${brand.website}` : null,
    brand.seedKeywords ? `Seed keywords: ${brand.seedKeywords}` : null,
    brand.voice ? `Brand voice:\n${brand.voice}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The C3 style covenant — verbatim in every generation system prompt. This is
 * the writer's contract; `style-lint.ts` machine-checks the parts it can.
 */
export const STYLE_COVENANT = `Writing covenant — every rule is binding:
1. The first sentence earns the read — an answer, a number, or a claim. Never throat-clearing. If the first sentence works without the second, keep it.
2. Short by default: 600-1,200 words unless the evidence says the query deserves depth. Every paragraph must move the reader forward; cut the ones that only add length.
3. Write like a person on the team: first person, contractions, specific numbers and examples from this brand's world, actual opinions. Address the reader as "you".
4. No summary conclusions. Never restate what was just said. End with the next step or the sharpest take. "In conclusion" is banned outright.
5. Vary the rhythm: mixed sentence lengths, sections of different sizes, no heading every 100 words. Perfect symmetry is an AI tell.
6. Concrete beats abstract: "a freelancer invoicing 4 clients loses ~3 hours/month", not "many professionals face challenges". If a sentence works for any product, it doesn't belong in this article.
7. One idea per article. If the outline wants two, that's two articles and an internal link. Short and pointed beats long and complete.
Banned phrases (never use): "delve", "in today's ... landscape/world", "it's important to note", "unlock/unleash the power", "game-changer", "elevate", "seamlessly", "whether you're a ... or a ...", "in conclusion", "let's dive in".`;

function shapeBlock(shape: ArticleShape) {
  return `Article shape: ${shape}\nStructure to follow:\n${ARTICLE_SHAPES[shape].skeleton}`;
}

export function summaryPrompt(topic: TopicInput, brand: BrandContext) {
  return {
    system:
      "You are an SEO content strategist. Write concise research summaries for article planning.",
    user: `Summarize the article opportunity in 3-5 sentences.

Topic: ${topic.title}
Angle: ${topic.angle ?? "General"}
Keywords: ${topic.keywords ?? "None"}

Brand context:
${brandBlock(brand) || "No brand profile yet."}`,
  };
}

export function outlinePrompt(
  topic: TopicInput,
  brand: BrandContext,
  summary: string,
  shape: ArticleShape,
) {
  return {
    system:
      "You are a senior editor planning one article. The shape is fixed — never fall back to " +
      "intro/sections/conclusion. Plan only the sections the shape calls for, sized unevenly by " +
      "what each deserves. One idea per article.",
    user: `Outline this article in Markdown (headings + one-line notes per section).

Topic: ${topic.title}
Angle: ${topic.angle ?? "General"}
Keywords: ${topic.keywords ?? "None"}
Summary: ${summary}

${shapeBlock(shape)}

Brand context:
${brandBlock(brand) || "No brand profile yet."}`,
  };
}

export function draftPrompt(
  topic: TopicInput,
  brand: BrandContext,
  outline: string,
  shape: ArticleShape,
) {
  return {
    system: `You are a sharp writer on this brand's team, writing for its blog in Markdown.

${STYLE_COVENANT}`,
    user: `Write the article. Single H1 title, H2/H3 sections, Markdown only.

Topic: ${topic.title}
Angle: ${topic.angle ?? "General"}
Keywords: ${topic.keywords ?? "None"}

${shapeBlock(shape)}

Brand context:
${brandBlock(brand) || "No brand profile yet."}

Outline:
${outline}

Never invent statistics, quotes, or customer stories. Real specifics only — when you don't have one, make the claim without a fake number.`,
  };
}

export function seoEditPrompt(draft: string, keywords?: string | null) {
  return {
    system:
      "You are an SEO editor. Improve headings, keyword placement, and clarity without changing " +
      "the voice, the opinions, or the structure. Never add filler, a conclusion section, or " +
      "generic phrasing — if in doubt, leave the sentence alone. Cutting is allowed; padding is not.",
    user: `Edit this Markdown article for SEO. Return only the revised Markdown.

Target keywords: ${keywords ?? "Use the article's natural keywords"}

Article:
${draft}`,
  };
}

/**
 * Targeted rewrite for lint failures: fix the flagged spans, preserve the rest.
 * Cheaper than a regenerate and keeps what was good.
 */
export function styleRewritePrompt(draft: string, hits: LintHit[]) {
  const problems = hits
    .map((hit) => `- ${hit.message}${hit.excerpt ? `\n  Flagged span: "${hit.excerpt}"` : ""}`)
    .join("\n");
  return {
    system: `You are the same writer revising your own draft. Fix ONLY the flagged problems — rewrite the offending spans and restructure only where a problem demands it. Everything else stays word-for-word. Return the complete revised Markdown.

${STYLE_COVENANT}`,
    user: `Problems found by the style linter:
${problems}

Draft:
${draft}`,
  };
}

export function brandPrefillPrompt(
  brand: { name: string; website?: string | null },
  searchContext: string,
) {
  return {
    system:
      "You are a brand analyst. From web search results about a company, build its content-marketing profile. " +
      "Return JSON with keys: productDescription (string, 1-3 sentences on what it sells), " +
      "audience (string, who the brand serves), tone (string, 2-4 comma-separated brand-voice adjectives), " +
      "seedKeywords (string, 4-8 comma-separated SEO keywords). " +
      "Ground productDescription in the search results and leave it empty only if truly unknown. " +
      "Always provide audience, tone, and seedKeywords — infer them from the product, nature, and industry of the " +
      "brand even when they are not stated outright. Never leave audience or tone empty.",
    user: `Brand name: ${brand.name}
Website: ${brand.website || "Unknown"}

Web search results:
${searchContext || "No results found."}`,
  };
}

export function competitorDiscoveryPrompt(
  brand: { name: string; website?: string | null; productDescription?: string | null },
  evidence: { candidates: string; listicles: string; answers: string },
  limit: number,
) {
  return {
    system:
      "You identify a brand's direct business competitors from web-search evidence. " +
      `Return JSON with key competitors: an array of at most ${limit} objects { name, url, reason }, ` +
      "ordered strongest competitor first. Weigh the evidence: brands named in AI assistant answers are the " +
      "strongest signal, then comparison ('vs') pages, then 'alternatives' listicle text, then candidates " +
      "corroborated by multiple searches. You may include a competitor named only in listicle or AI-answer " +
      'text — set its url to "" if you do not know its real homepage. Include only genuine competing ' +
      "products/companies. Exclude the brand itself, review aggregators (g2, capterra, trustpilot), " +
      "marketplaces, social networks, news, and wikis. Use real homepage URLs (https://domain). " +
      "reason is one short sentence citing the evidence. Return fewer than the limit rather than padding " +
      "with weak matches.",
    user: `Brand name: ${brand.name}
Brand website: ${brand.website || "Unknown"}
What the brand does: ${brand.productDescription || "Unknown"}

Candidate sites from web search:
${evidence.candidates || "None."}

"Alternatives"/comparison article snippets (may name competitors in text):
${evidence.listicles || "None."}

Recent AI assistant answers about this category (brands named here are strong competitors):
${evidence.answers || "None."}`,
  };
}

export function seedTrackedPromptsPrompt(
  brand: {
    name: string;
    website?: string | null;
    productDescription?: string | null;
    audience?: string | null;
    seedKeywords?: string | null;
  },
  limit: number,
) {
  return {
    system:
      "You write the questions real buyers ask AI assistants (ChatGPT, Perplexity, Gemini) when shopping in a " +
      `product category. Return JSON with key prompts: an array of at most ${limit} strings. ` +
      'Mix category questions ("best X for Y"), use-case questions, and comparison questions a buyer of this ' +
      "product would plausibly ask. Never mention the brand by name — these prompts measure whether AI answers " +
      "surface the brand unprompted. Keep each under 15 words, plain language, no numbering.",
    user: `Brand name: ${brand.name}
Website: ${brand.website || "Unknown"}
What it sells: ${brand.productDescription || "Unknown"}
Audience: ${brand.audience || "Unknown"}
Seed keywords: ${brand.seedKeywords || "None"}`,
  };
}

export function day0BriefPrompt(brandName: string, factsBlock: string) {
  return {
    system:
      "You are Claudia, the user's SEO/AEO/GEO employee, writing your Day-0 brief after setting yourself up. " +
      "Write 3-5 sentences, first person, plain owner language (no jargon, no bare scores without context). " +
      "Cover: where the site stands today, what you already did during setup, and what you'll do this week. " +
      "Be concrete and warm, never salesy. Return JSON with key brief: the string.",
    user: `Brand: ${brandName}

Structured setup results:
${factsBlock}`,
  };
}

export function extractUseCasesPrompt(
  brand: BrandContext & { name?: string },
  articleTitles: string[],
  searchContext: string,
) {
  return {
    system:
      "You map a product's real use cases — the jobs buyers hire it for and who those buyers " +
      'are. Return JSON {"useCases": [{ "job", "persona", "industry", "evidence" }]} with at ' +
      'most 8 rows. "job" is a concrete task in the buyer\'s words ("send automatic invoice ' +
      'reminders"), "persona" is who does it ("freelance designers"), "industry" is optional, ' +
      '"evidence" says where you saw it (a page, an article, the product description). Only ' +
      "use cases the material actually supports — never invent personas. Fewer, real rows " +
      "beat padded ones.",
    user: `Product context:
${brandBlock(brand) || "No brand profile yet."}

Published article titles (what the brand already writes about):
${articleTitles.slice(0, 20).map((title) => `- ${title}`).join("\n") || "None yet."}

Web search results about the product:
${searchContext || "None."}`,
  };
}

export function competitorContentClassifyPrompt(
  brand: BrandContext,
  posts: Array<{ url: string; title: string }>,
) {
  return {
    system:
      "You classify competitor blog posts for content-gap analysis. For each post return its " +
      'topic cluster (2-4 lowercase words, e.g. "invoicing for agencies" — reuse the same ' +
      "cluster name for posts about the same thing), buyer intent (bofu = choosing a tool, " +
      "mofu = evaluating approaches, tofu = learning), and article shape (tutorial, comparison, " +
      'direct-answer, opinion, checklist, teardown). Return JSON {"posts": [{ "url", "topic", ' +
      '"intent", "shape" }]}.',
    user: `Our product (for judging relevance):
${brandBlock(brand) || "Unknown."}

Competitor posts:
${posts.map((post) => `- ${post.title} (${post.url})`).join("\n")}`,
  };
}

export function metadataPrompt(topic: TopicInput, articleMarkdown: string) {
  return {
    system:
      "You generate SEO metadata. Return JSON with keys: title, slug, metaDescription, tags (string array).",
    user: `Generate SEO metadata for this article.

Topic: ${topic.title}
Keywords: ${topic.keywords ?? "None"}

Article excerpt:
${articleMarkdown.slice(0, 2500)}

Slug rules: lowercase, hyphen-separated, no special characters.`,
  };
}
