export type BrandContext = {
  productDescription?: string | null;
  audience?: string | null;
  tone?: string | null;
  website?: string | null;
  seedKeywords?: string | null;
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
  ]
    .filter(Boolean)
    .join("\n");
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

export function outlinePrompt(topic: TopicInput, brand: BrandContext, summary: string) {
  return {
    system:
      "You are an expert SEO editor. Produce clear article outlines with H2/H3 headings and bullet notes.",
    user: `Create a detailed article outline in Markdown.

Topic: ${topic.title}
Angle: ${topic.angle ?? "General"}
Keywords: ${topic.keywords ?? "None"}
Summary: ${summary}

Brand context:
${brandBlock(brand) || "No brand profile yet."}

Include an introduction, 4-6 main sections, and a conclusion.`,
  };
}

export function draftPrompt(
  topic: TopicInput,
  brand: BrandContext,
  outline: string,
) {
  return {
    system:
      "You are a senior content writer. Write helpful, accurate, SEO-friendly blog articles in Markdown.",
    user: `Write a complete blog article in Markdown using this outline.

Topic: ${topic.title}
Angle: ${topic.angle ?? "General"}
Keywords: ${topic.keywords ?? "None"}

Brand context:
${brandBlock(brand) || "No brand profile yet."}

Outline:
${outline}

Requirements:
- Use a single H1 title at the top
- Use H2/H3 for sections
- Target 900-1200 words
- Be specific and practical
- Do not invent fake statistics or quotes`,
  };
}

export function seoEditPrompt(draft: string, keywords?: string | null) {
  return {
    system:
      "You are an SEO editor. Improve clarity, headings, keyword placement, and readability without changing the core message.",
    user: `Edit this Markdown article for SEO and readability. Return only the revised Markdown.

Target keywords: ${keywords ?? "Use the article's natural keywords"}

Article:
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
  candidates: string,
  limit: number,
) {
  return {
    system:
      "You identify direct business competitors. Given a brand and a list of candidate sites from web search, " +
      `return JSON with key competitors: an array of at most ${limit} objects { name, url }. ` +
      "Include only genuine competing products/companies. Exclude the brand itself, review aggregators " +
      "(g2, capterra, trustpilot), marketplaces, social networks, news, and wikis. Use the candidate's real " +
      "homepage URL (https://domain). Return fewer than the limit rather than padding with weak matches.",
    user: `Brand name: ${brand.name}
Brand website: ${brand.website || "Unknown"}
What the brand does: ${brand.productDescription || "Unknown"}

Candidate sites from web search:
${candidates || "No candidates found."}`,
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
