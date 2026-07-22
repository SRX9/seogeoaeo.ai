# Via Negativa Product Simplification

## Status

Confirmed product direction and implementation source of truth.

This document defines what SeoGeoAeo AI is becoming, what Claudia should do for the customer, which existing capabilities remain, and which product surfaces should be combined, hidden, or removed.

The purpose of the upcoming work is not to redesign every existing feature. It is to reduce the product until its value is immediately understandable.

## Core principle

The product should not become better by continually adding features, dashboards, controls, tools, and terminology. It should become better by removing anything that stands between the customer and the two outcomes they came for.

This follows Via Negativa:

- Improve the product through subtraction.
- Remove choices that Claudia can make for the customer.
- Remove features that expose internal product machinery.
- Remove duplicate ways of viewing or controlling the same work.
- Remove promises the product cannot reliably fulfill.
- Remove concepts customers must learn before receiving value.
- Preserve only the complexity required to produce a useful outcome safely.

The goal is not minimalism for appearance's sake. The goal is maximum customer value with the minimum necessary product complexity.

## Product definition

SeoGeoAeo AI gives the customer Claudia, an AI content and website-discovery agent.

Claudia does two jobs:

1. Finds the best topics and ideas the brand should create content about, and helps turn selected ideas into useful, brand-aligned content.
2. Assesses the website and produces a prioritized SEO, AEO, and GEO checklist showing exactly what the customer should fix.

The customer should be able to describe the entire product in one sentence:

> Claudia tells me what content to create and what website problems to fix.

An expanded version of the promise is:

> Claudia studies your brand, customers, competitors, search opportunities, and AI answers. She finds what your brand should talk about next, helps create the content, and gives you a prioritized checklist that makes the brand easier to find in search and AI systems.

## The two customer outcomes

### 1. Know what content to create next

Claudia studies:

- The brand website and products.
- The target customer and their questions.
- Existing content.
- Relevant competitors.
- Search demand and content gaps.
- Opportunities to appear in traditional search and AI-generated answers.

Claudia then presents a short, prioritized set of content opportunities.

Each opportunity should contain only the information required to make a decision:

- Topic or question.
- Why it matters.
- Who it is for.
- The opportunity Claudia found.
- Recommended content format.
- One primary action: **Create content**.

An idea should naturally become a draft and then completed content. Ideas and articles must not feel like unrelated product systems.

The default experience should emphasize Claudia's recommendation, not a large topic database or a research-tool interface.

### 2. Know what to fix

Claudia assesses the website and creates one actionable growth checklist.

The checklist may be grouped into:

- **SEO:** Google discovery, crawling, indexing, metadata, internal links, schema, and technical health.
- **AEO:** Direct answers, FAQs, structured explanations, and coverage of buyer questions.
- **GEO:** AI crawler access, citability, brand and entity signals, sources, evidence, and AI-answer readiness.

The default view is not the taxonomy. The default view is **Do these next**, which combines the most important work across SEO, AEO, and GEO.

Each checklist item should show:

- What is wrong or missing.
- Why it matters in plain language.
- Exactly how to fix it.
- Prepared copy, code, file, or instructions when available.
- A clear completion action.
- Claudia's verification after the customer implements the change.

Customers should see a small number of priorities at once. They should not receive a wall of findings or be required to choose which analyzer to run.

## Product boundary

The customer-facing product is:

- Claudia's recommended next content opportunity.
- A prioritized library of content ideas.
- Content creation and completion.
- A prioritized SEO, AEO, and GEO checklist.
- Clear implementation help for each checklist item.
- Verification that completed checklist work is now correct.
- Essential brand, account, connection, and billing settings.

The customer-facing product is not:

- A general SEO toolbox.
- A collection of standalone analyzers.
- A reporting or analytics suite.
- A technical operations console.
- A workflow administration system.
- An agent-debugging interface.
- A complex autonomous publishing platform.
- A roadmap of integrations that do not work yet.
- A dashboard that requires the customer to interpret many competing metrics.

Backend analyzers, workflows, evidence stores, logs, safety controls, and scoring systems may remain when Claudia needs them. Internal capability does not automatically deserve a customer-facing page.

## Confirmed information architecture

The primary product navigation should contain three destinations:

1. **Claudia**
2. **Content**
3. **Checklist**

Brand, connections, billing, and account settings should live under an account or settings menu rather than competing with the three primary outcomes.

### Claudia

Claudia is the focused home page.

It should show:

- One large, editorial headline.
- The best content opportunity Claudia recommends now.
- The most important website fix, when relevant.
- A short explanation of why each matters.
- One clear primary action.

Example:

> Your customers are searching for an answer you have not published yet.

Supporting explanation:

> Claudia found a high-intent question closely connected to your product. Relevant competitors appear for it, but none provides a complete answer.

Primary action:

> Create this content

The Claudia page should not repeat the Content library, Checklist, weekly report, activity history, and multiple signal dashboards.

### Content

Content should combine the current topic and article concepts into one lifecycle:

- **Ideas**
- **Drafts**
- **Completed**

Publishing or exporting may remain as an action on completed content. It should not require a separate product area or a large automation system.

### Checklist

Checklist should replace the fragmented visibility and fix surfaces.

Its views should be:

- **Do these next**
- **SEO**
- **AEO**
- **GEO**
- **Completed**

The following concepts should be absorbed into Checklist rather than remaining separate destinations:

- Site Health.
- Fix Queue.
- AI Answers.
- Visibility findings.
- Technical audit findings.
- Citability improvements.
- Crawler-access findings.
- Schema findings.

## Visual and writing direction

Product simplification must preserve the existing large editorial personality.

Keep:

- Huge display typography.
- Large, confident headlines.
- Dramatic but controlled spacing.
- Strong Claudia identity.
- Large focal components when they communicate one important idea.
- Quiet secondary information.
- Clear hierarchy and generous reading space.

The visual principle is:

> Large typography. Short language. Few decisions.

Large typography does not mean verbose copy. Screens should use fewer words, stronger headlines, and one obvious next action.

Existing interface rules remain mandatory:

- Do not use pills, chips, badges, or pill-shaped text containers.
- Use Hugeicons for interface icons.
- Do not use custom inline SVG icons, emoji, or AI-cliche decoration.
- Do not use HeroUI Button variants containing `soft`.
- Keep general product chrome neutral and reserve Claudia color for identity and live agent state.

## Simplified onboarding

The first-run journey should be:

1. The customer enters their website.
2. Claudia learns the brand, product, customer, and relevant competitors.
3. The customer confirms or corrects a short brand summary.
4. Claudia finds the first content opportunity.
5. Claudia creates the initial SEO, AEO, and GEO checklist.
6. The customer enters the simplified product.

The free-product promise must match the real journey. If marketing promises a free first opportunity or snapshot, the customer must see that result before being required to purchase a plan.

Do not ask during onboarding for:

- Detailed goal configuration.
- A choice among many first outcomes.
- Publishing automation mode.
- Category-level autonomy.
- Fast auto-publishing.
- Advanced permissions.
- Work rhythm.
- Detailed competitor management.
- Technical policy configuration.

Claudia should infer safe defaults. Publishing should default to review-first if it remains in the simplified product.

## Settings boundary

Settings should be reduced to the smallest useful set:

- **Brand:** website, positioning, audience, voice, and competitors.
- **Connections:** only operational connections relevant to content or measurement.
- **Billing:** plan and understandable usage information.
- **Account:** user and workspace administration.

If Claudia needs a customer-adjustable objective, it should appear as one simple instruction or preference, not a separate planning system.

Advanced policy simulators, memory controls, diagnostics, internal planning, and detailed action records should be removed from the normal customer interface. They may remain available to internal support when required.

## Pricing direction

Pricing should communicate how much useful work Claudia can do, not expose internal model accounting.

Avoid making the following primary buying concepts:

- Credits.
- Article-draft equivalents.
- Daily generation caps.
- Prompt limits.
- Competitor limits.
- Multiple interacting feature caps.

Credits and safety caps may remain internally for cost and risk control.

The customer-facing model should use a small number of understandable workload levels, for example:

- A light monthly workload.
- Consistent weekly work.
- Continuous higher-volume work.
- A custom plan for exceptional needs, if justified.

The final number and economics of plans must be validated against real cost and revenue data. The product surface should still avoid four nearly identical plans differentiated by several abstract limits.

## Keep, combine, hide, and remove

### Keep and strengthen

- Claudia as the central product identity.
- Automatic brand discovery.
- Competitor and customer-question research used by Claudia.
- Topic discovery and prioritization.
- Brand-aligned content creation.
- A single content lifecycle.
- Website assessment.
- Prepared fixes and precise implementation guidance.
- Completion and verification of checklist items.
- Evidence and reasoning, progressively disclosed.
- Safety controls that protect customer sites and brands.
- Operational publishing or export actions that directly support completed content.

### Combine

- Topic Queue and Article Library into Content.
- Fix Queue, Site Health, AI Answers, and visibility findings into Checklist.
- Ask Claudia and Steer Claudia into one interaction if conversational control remains.
- Goal, publishing preference, and work preference controls into one small Claudia preference area when still necessary.
- Current summary and historical reports into lightweight contextual information, only if retained.

### Hide from normal customers

- Standalone analyzers used internally by Claudia.
- Detailed audit evidence not needed for the next action.
- Work logs and low-level job states.
- Agent memory and internal planning.
- Policy simulation and connector certification controls.
- Diagnostics and operational records.
- Experimental or support-only routes.

### Remove from the customer-facing product

- Results as a separate dashboard.
- Composite visibility scores as a primary outcome.
- Weekly reporting as a separate product system.
- Advanced Tools hub.
- Extra Tools explorer.
- Separate analyzer pages.
- Separate AI Answers page.
- Separate Site Health page.
- Separate Fix Queue page.
- Separate Content Ideas route.
- Separate Inbox route.
- Separate Activity and Work Log routes.
- Duplicate Ask and Steer experiences.
- Complex goals configuration.
- Work-rhythm configuration.
- Category-level automation policies.
- Policy simulator.
- Customer-facing agent memory and planning controls.
- Planned or unavailable publishing destinations.
- Fast auto-publish and skip-editorial-holds flows.
- Complicated credit explanations in primary pricing.
- Enterprise complexity in the normal self-serve product unless real demand justifies it.

Removing a feature from the product does not always mean immediately deleting its backend code. The safe sequence is:

1. Remove it from primary navigation and customer journeys.
2. Redirect or merge routes where appropriate.
3. Confirm that the remaining product no longer depends on it.
4. Observe usage and operational dependencies.
5. Delete unused UI, APIs, tests, schemas, and code only after dependencies are resolved.

## Truthfulness rule

The product must not claim that Claudia completed a site change when she only prepared instructions, a file, a snippet, or a coding-agent prompt.

Use precise language:

- **Found** when Claudia identified an opportunity.
- **Prepared** when Claudia produced content or a fix artifact.
- **Published** only when a connected destination confirms publication.
- **Fixed** only after the live website change is verified.
- **Improved** only when a reliable measurement demonstrates change.

Until direct technical execution is reliable for a specific connection, describe Claudia as preparing exact fixes and verifying the customer's implementation.

## Feature decision test

Every existing or proposed feature must pass these questions:

1. Does it help the customer know what content to create?
2. Does it help the customer create or complete that content?
3. Does it help the customer know what website issue to fix?
4. Does it help the customer implement or verify that fix?
5. Is it essential for brand, account, connection, billing, safety, or reliability?

If the answer to all five is no, it should not be part of the customer-facing product.

Additional rules:

- If Claudia can make the decision safely, do not ask the customer.
- If two pages represent the same work at different technical levels, merge them.
- If a capability is not operational, do not advertise it inside the product.
- If a metric does not change a customer decision, do not give it primary space.
- If a feature exists mainly to reveal internal implementation, hide it.
- If a feature cannot be explained in one short sentence, simplify it before shipping.

## Measurement before permanent deletion

Via Negativa should be evidence-driven. Before permanently deleting uncertain capabilities, measure whether they contribute to the confirmed product outcomes.

The important customer journey is:

1. Website submitted.
2. Brand summary confirmed.
3. First content opportunity viewed.
4. Content opportunity accepted.
5. First draft created.
6. Content completed, exported, or published.
7. Initial checklist viewed.
8. Checklist item opened.
9. Fix prepared or copied.
10. Fix marked complete.
11. Fix verified on the live site.

Instrument these outcomes. Do not preserve a bloated interface merely because feature usage is currently unknown.

## Implementation order

### Phase 1: Establish the new shell

- Change primary navigation to Claudia, Content, and Checklist.
- Define redirects for removed primary routes.
- Update route titles and command navigation.
- Preserve settings access through the account/settings menu.

### Phase 2: Simplify Claudia

- Reduce the home page to one content recommendation, one important checklist item, and one primary action.
- Remove duplicate recent-content, reporting, activity, and signal sections.
- Combine conversational controls if they remain.

### Phase 3: Unite the content lifecycle

- Merge topic ideas and articles into Content.
- Present Ideas, Drafts, and Completed.
- Make Create content the natural transition from an idea.
- Keep publishing or export as a simple completed-content action.

### Phase 4: Build the single Checklist

- Merge visibility findings, site health, fixes, and AI-answer issues.
- Add Do these next, SEO, AEO, GEO, and Completed views.
- Normalize every item to problem, importance, exact fix, action, and verification.
- Limit the default view to the highest-priority work.

### Phase 5: Simplify onboarding and pricing

- Deliver the promised free first opportunity and initial checklist before checkout.
- Remove unnecessary onboarding choices.
- Default to safe review-first behavior.
- Simplify customer-facing pricing and usage language.

### Phase 6: Remove obsolete surfaces and code

- Hide and redirect obsolete routes.
- Confirm dependencies and usage.
- Remove unused components, queries, APIs, tests, schemas, and background work incrementally.
- Retain internal analyzers only when Claudia or operations still require them.

Each phase must leave the application buildable and usable. Do not perform a single destructive removal across the entire system without dependency checks.

## Acceptance criteria

The simplification is successful when:

- A new visitor can explain the product after reading one headline and one supporting sentence.
- A new user reaches a real content opportunity and initial checklist with minimal input.
- The primary navigation contains only Claudia, Content, and Checklist.
- Ideas and articles feel like one lifecycle.
- SEO, AEO, GEO, site health, AI answers, and fixes feel like one checklist.
- Customers are not asked to operate standalone analyzers.
- Customers do not see unavailable integrations or internal agent controls.
- Every major screen has one obvious primary action.
- Large editorial typography remains central to the visual identity.
- Product language distinguishes found, prepared, published, fixed, verified, and improved.
- Removed surfaces no longer create dead links or inaccessible required workflows.
- The application continues to pass relevant typechecks, tests, and builds throughout the migration.

## Final product mantra

> Know what to write. Know what to fix.

And the internal implementation mantra:

> Large typography. Short language. Few decisions.

