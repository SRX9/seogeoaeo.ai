# Product Design Feel: Quiet Operator

Status: proposed direction  
Scope: authenticated product, onboarding, settings, billing, and supporting marketing surfaces  
Implementation base: HeroUI/HeroUI Pro, Tailwind CSS v4, Geist, Cal Sans for rare display moments, and Hugeicons

## 1. Direction in one sentence

Make seogeoaeo.ai feel like a calm command center where Claudia's work is visible, understandable, and easy to steer: structured like a desktop tool, quiet in color and decoration, dense enough for serious work, and warm enough to avoid feeling mechanical.

The reference images should not be copied screen-for-screen. Their shared value is a visual grammar:

- a stable shell around changing work;
- neutral surfaces separated by tone, spacing, and hairlines;
- compact rows for repeatable information;
- one obvious action per decision area;
- restrained typography with strong information hierarchy;
- overlays that isolate a task without becoming theatrical;
- occasional atmospheric imagery used as a focal event, not as permanent decoration;
- color reserved for status, selection, and Claudia's presence.

The working name for this direction is **Quiet Operator**. It is less “AI dashboard” and more “trusted operating system for growth work.”

## 2. What the references contribute

| Reference | Useful piece | Application to seogeoaeo.ai | Do not copy |
| --- | --- | --- | --- |
| 1 — profile card | Clear identity block, plain metadata, a single dominant CTA, and an inset summary area | Brand profile, report summary, or artifact detail header | Oversized pill buttons, very large corner radii, and decorative verification marks without product meaning |
| 2 — share dialog | Framed preview, compact access rows, a link field, and a stable footer action rail | Share report, invite collaborator, publish/export confirmation | Badge-like role labels and avatar decoration that does not convey access |
| 3 — install modal | Strong modal focus, subdued backdrop, simple information card, and one full-width completion action | Connect an integration, approve a publishing destination, or authorize a high-impact action | Generic rainbow “AI” gradients on routine dialogs and text chips for capabilities |
| 4 — account menu | Profile context, grouped account actions, workspace switching, usage summary, and upgrade path in one popover | Brand/workspace switcher and account popover | Pill-shaped theme selector, cramped plan decorations, and status shown as a badge |
| 5 — dark workspace | Persistent top bar, grouped sidebar, low-contrast active row, recents, and utility content anchored at the bottom | Global app shell and activity-oriented pages | Filling the sidebar with low-value links or treating every new feature as navigation |
| 6 — inbox workspace | Rail/list/detail hierarchy, strong contextual preview, and a clear empty/detail state | Needs-your-input inbox and approval flows | Decorative scenic backgrounds behind routine work and excessive icon-only navigation |
| 7 — settings/apps | Dedicated settings navigation, search and filtering, dense two-column connection rows | Settings and integrations information architecture | A separate card around every row and filters that become pills or chips |
| 8 — plan choice | Focused comparison, calm dark canvas, short feature lists, bottom-aligned actions, and limited atmospheric art | Pricing, billing upgrade, and onboarding plan choice | Price badges, overly tall cards, and high-saturation CTA color as the default action language |

## 3. Product personality

The interface should feel:

- **Competent:** work, evidence, status, and next actions are visible without exploration.
- **Calm:** neutral surfaces dominate; animation and color never compete with content.
- **Agentic but accountable:** Claudia may feel present, but her actions, reasoning, authority, and results remain inspectable.
- **Editorially clear:** headings explain the decision; descriptions explain why it matters; metadata answers when, where, and who.
- **Desktop-native:** compact navigation, stable panes, predictable menus, and immediate feedback make the app feel like a professional tool.

It should not feel:

- like a collection of unrelated rounded cards;
- like a marketing page inside the authenticated app;
- like a generic purple-gradient AI product;
- playful, bubbly, or badge-heavy;
- visually louder when the underlying information is more important than the container.

## 4. Repository constraints that override the references

These rules are non-negotiable across the redesign:

- Do not use pills, chips, badges, or pill-shaped text containers. Status and metadata remain plain text, optionally paired with a small circular status mark.
- Use `@hugeicons/react` with `@hugeicons/core-free-icons` for interface icons. Do not introduce inline SVGs, emoji, sparkles, stars, or magic-wand imagery.
- Do not use any HeroUI Button variant containing `soft`. Use primary, secondary, outline, ghost, or danger treatments.
- Keep circular geometry for avatars, progress rings, and small status marks. Buttons, filters, tabs, and labels use rounded rectangles with a visible straight run.
- New colors are expressed as semantic OKLCH tokens, not hard-coded hex values in components.

### 4.1 Existing foundation to retain

This is an evolution of the current system, not a reset.

| Keep | Why it belongs in the target direction |
| --- | --- |
| HeroUI semantic tokens and Tailwind utilities | They provide one implementation language across components and themes |
| Geist as the application typeface | It supports the compact, desktop-native feel of the references |
| Cal Sans as a limited display face | It gives Claudia a recognizable voice when used only at true focal moments |
| The 4 px spacing rhythm | It supports both compact rows and spacious page-level composition |
| The small four-item primary navigation | It keeps the shell durable and avoids feature-by-feature navigation growth |
| Plain `ToneText` / `StatusText` patterns | They already align with the no-badge status rule |
| The Claudia orb and its blue/cyan/lilac material | It is a distinctive identity asset when used with restraint |
| Reduced-motion, reduced-transparency, and contrast fallbacks | They keep the visual system usable beyond the default presentation |

The main evolution is structural: flatter workspaces, fewer oversized cards, a tighter radius scale, more row-based information, and stricter control of atmospheric color.

## 5. Core design principles

### 5.1 The shell is the primary surface

The global shell should do more of the visual organization so page content needs fewer cards. The sidebar, top bar, content canvas, and optional detail pane establish the hierarchy before any local component appears.

Use cards for a meaningful object, decision, or summary. Do not wrap an ordinary heading, a short description, or every settings section in a separate card.

### 5.2 Structure should be quiet but unmistakable

Use spacing for ordinary grouping, hairline dividers for structural boundaries, and a small tonal change for nested regions. Use elevation only for floating layers or a surface that genuinely sits above another.

The visual order should normally be:

1. page or workspace title;
2. current state and the primary next action;
3. work or results;
4. supporting evidence and configuration;
5. secondary actions.

### 5.3 One focal action per decision area

Each card, dialog, or page region may have many available actions, but only one should have primary visual weight. Alternatives are outline, secondary, ghost, or plain links.

Destructive actions are separated spatially and use the danger treatment only when the consequence is genuinely destructive.

### 5.4 Density with breathing room

The references are spacious at the macro level and compact at the row level. Apply the same distinction:

- generous page gutters and section spacing;
- compact navigation and metadata;
- 56–72 px repeated rows depending on description length;
- 20–24 px card padding for singular objects;
- avoid empty vertical space created only to make a card look “premium.”

### 5.5 Color is evidence, not decoration

Most of the app is neutral. Color communicates:

- current selection;
- live or working state;
- success, caution, failure, or required input;
- Claudia's identity in rare focal moments;
- data series that cannot be differentiated another way.

If a region remains understandable in grayscale, the hierarchy is strong enough.

### 5.6 Claudia is present through behavior

Claudia's personality should come from clear first-person explanations, visible progress, useful recommendations, and accountable reasoning. The orb and its blue/cyan/lilac material can appear in onboarding, an agent status focal area, or a major empty state. It should not appear on every card or beside every action.

## 6. Global layout system

### 6.1 Desktop shell

| Region | Target behavior |
| --- | --- |
| Sidebar | 240–256 px expanded; stable on desktop; off-canvas on smaller screens; one subtle divider from content |
| Top bar | 52–56 px; route title at the start; only global or urgent actions at the end |
| Content canvas | Fills remaining width; background distinct from resting surfaces by one tonal step |
| Utility/detail pane | 320–400 px when a page benefits from persistent context; otherwise use a sheet or modal |
| Main gutter | 20 px at compact widths, 28–32 px on desktop |

The sidebar should contain the smallest durable set of destinations. Secondary routes such as activity logs, ideas, fixes, and reports should remain contextual children of the primary destinations instead of becoming permanent top-level links.

### 6.2 Page width by task

Do not apply one `max-w-*` to every route.

| Page type | Width rule |
| --- | --- |
| Operational dashboard, inbox, results explorer | Up to 1440–1600 px or fluid within the shell |
| Lists and settings | 1120–1280 px |
| Editor or reading view | 680–760 px for the reading column, with supporting rails outside it |
| Dialog | 480–640 px for routine decisions; wider only for real comparisons or previews |

### 6.3 Responsive behavior

- At desktop widths, preserve panes and visible context.
- Below roughly 1024 px, collapse optional detail panes into sheets.
- On mobile, use a single content column, 16–20 px gutters, and 44 px minimum touch targets.
- Move secondary actions into a clearly labeled menu before shrinking labels into icons.
- Keep fields at 16 px text on mobile to prevent iOS input zoom.
- Do not make dense desktop tables horizontally microscopic; allow a scroll container or transform rows into labeled blocks.

### 6.4 Layout wireframes

General operational workspace:

```text
┌────────────────────┬──────────────────────────────────────────────────────┐
│ Brand / workspace  │ Route title                         Urgent global act │
├────────────────────┼──────────────────────────────────────────────────────┤
│ Primary navigation │ State + concise explanation        Primary action   │
│                    ├──────────────────────────────────────┬───────────────┤
│                    │ Work / results / repeated rows       │ Evidence or   │
│                    │                                      │ detail rail   │
│                    │                                      │ when useful   │
│ Account + plan     │                                      │               │
└────────────────────┴──────────────────────────────────────┴───────────────┘
```

Needs-your-input workspace:

```text
┌─────────────────┬──────────────────────────┬─────────────────────────────┐
│ Queue categories│ Request list             │ Selected request            │
│ + counts        │ title / reason / time    │ evidence → recommendation  │
│                 │ plain semantic status    │ → decision controls         │
└─────────────────┴──────────────────────────┴─────────────────────────────┘
```

## 7. Surface, radius, and depth language

### 7.1 Surface levels

Use four semantic levels:

| Level | Purpose | Typical use |
| --- | --- | --- |
| Canvas | Page background | Main app area |
| Rail | Stable structural region | Sidebar, secondary settings navigation |
| Surface | Resting grouped object | Card, list group, editor panel |
| Overlay | Floating and task-isolating | Menu, popover, modal, sheet |

Nested surface changes should be subtle. Avoid stacking multiple equally prominent white cards inside another white card.

### 7.2 Radius scale

Use a restrained radius system aligned to the current 4 px spacing rhythm:

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 6 px | Small icon wells and compact controls |
| `radius-md` | 10 px | Buttons, fields, rows, and selected navigation items |
| `radius-lg` | 14 px | Cards and grouped panels |
| `radius-xl` | 18 px | Dialogs, sheets, and rare focal frames |

Do not use `rounded-full` for text-bearing controls. Reduce routine use of `rounded-3xl`; 24 px should not be the default card shape.

For closely nested shapes, use concentric radii: outer radius = inner radius + the padding between them. When the gap exceeds 24 px, treat the layers as independent surfaces.

### 7.3 Borders and shadows

- Keep real borders for shell dividers, table separators, fields, and structural boundaries.
- Use a subtle shadow-ring for card depth in light mode rather than a hard dark outline.
- Use only a low-opacity white ring for resting surfaces in dark mode.
- Floating overlays may use a layered neutral shadow; avoid colored or oversized blur shadows.
- Images and preview art receive a 1 px inset outline: pure black at 10% in light mode and pure white at 10% in dark mode.

Suggested light surface shadow:

```css
--shadow-surface:
  0 0 0 1px oklch(0 0 0 / 0.06),
  0 1px 2px -1px oklch(0 0 0 / 0.06),
  0 2px 4px oklch(0 0 0 / 0.04);
```

Suggested dark surface shadow:

```css
--shadow-surface: 0 0 0 1px oklch(1 0 0 / 0.08);
```

## 8. Color direction

The existing neutral accent is a good fit for the references. Keep primary actions ink-like rather than turning the whole application blue. Introduce a separate Claudia signal palette derived from the orb for identity and live-state moments.

### 8.1 Semantic roles

| Role | Light direction | Dark direction |
| --- | --- | --- |
| Canvas | Cool near-white, around `oklch(0.97–0.98 0.002–0.004 250)` | Near-black, around `oklch(0.14–0.16 0.003–0.005 250)` |
| Surface | Near-white with a one-step separation from canvas | `oklch(0.18–0.20 0.003–0.005 250)` |
| Primary text | `oklch(0.20–0.24 0.004–0.008 250)` | `oklch(0.94–0.97 0.002–0.004 250)` |
| Muted text | Dark enough to pass normal-text contrast on its actual surface | Light enough to pass normal-text contrast on its actual surface |
| Primary action | Neutral ink with high-contrast text | Near-white or a clearly separated neutral surface |
| Claudia blue | Approximately `oklch(0.62 0.16 250)` | Approximately `oklch(0.72 0.14 250)` |
| Claudia cyan | Approximately `oklch(0.76 0.09 210)` | Approximately `oklch(0.78 0.08 210)` |
| Claudia lilac | Approximately `oklch(0.70 0.12 285)` | Approximately `oklch(0.76 0.10 285)` |

These Claudia colors are ingredient tokens, not default backgrounds. Use them in the orb, a thin artwork band, a focused agent-presence field, or a small live-state mark.

### 8.2 Status color

Status appears as plain semantic text, optionally with a 6–8 px circular mark. Do not put status inside a colored container.

- Success: completed, verified, connected, or improving.
- Warning: owner input required, time-sensitive, or incomplete setup.
- Danger: failure, regression, blocked work, or destructive action.
- Claudia blue: active agent work or selected Claudia-owned context; not a synonym for success.
- Muted: scheduled, paused, unknown, or not yet started when no stronger meaning exists.

All foreground/background pairs must meet WCAG AA. Adjust the OKLCH lightness channel to fix contrast while preserving hue and chroma.

### 8.3 Light and dark mode

The current product is light-first. Complete the structural redesign and contrast audit in light mode before adding a user-facing theme switch. Dark mode should mirror the same hierarchy; it is not a separate visual concept. Avoid pure black expanses, high-contrast borders everywhere, or brighter accent saturation simply because the background is dark.

## 9. Typography

Use Geist for the authenticated interface. Keep Cal Sans for rare, large, brand-forward moments such as onboarding, a major Claudia workspace headline, or marketing—not for ordinary card titles or settings headings.

### 9.1 Semantic type roles

| Role | Size / line height | Weight | Notes |
| --- | --- | --- | --- |
| Caption | 12 / 16 px | 400–500 | Timestamps, counts, compact metadata; never below 12 px |
| UI label | 13 / 18 px | 500 | Navigation group labels and field support |
| Operational body | 14 / 20 px | 400 | Rows, menus, settings, descriptions |
| Reading body | 16 / 24–26 px | 400 | Explanations, article content, longer summaries |
| Component title | 16 / 22 px | 600 | Cards, list groups, detail panes |
| Page title | 20 / 26 px | 600 | Top bar or local page heading |
| Section title | 24 / 29 px | 600 | Major page regions only |
| Display | 36–48 px / about 1.05 | 600 | Onboarding or one focal Claudia state |

Use only 400, 500, and 600 in the product UI unless a data visualization genuinely needs another weight.

### 9.2 Typography behavior

- Use slightly negative tracking for page and display headings; leave body tracking neutral.
- Use natural case. Avoid all-caps eyebrow labels; concise sentence case is calmer and easier to scan.
- Use `text-wrap: balance` on short headings and `text-wrap: pretty` on descriptions.
- Keep reading measure around 60–75 characters.
- Use tabular numbers for changing metrics, dates aligned in columns, prices, credit counts, and percentages.
- Keep full truncated values available through a tooltip, detail view, or expansion.
- Apply font smoothing once at the root and keep `font-synthesis: none`.

## 10. Components and interaction patterns

### 10.1 Navigation

- Selected navigation is a low-contrast rectangular row, not a pill.
- Use a literal 16–18 px Hugeicon plus a short label.
- Keep group labels subdued and sparse; omit a group label when the grouping is already obvious.
- A sidebar row is 40–44 px high. The full row is the hit target.
- Global urgent counts appear as plain text at the end of the row or top bar.
- The brand/workspace switcher opens a grouped account popover inspired by reference 4, with identity first, workspace choices second, and plan usage last.

### 10.2 Buttons

- Primary: neutral ink fill, high-contrast label, 8–10 px radius.
- Secondary: lower-contrast neutral fill.
- Outline: neutral ring for a real alternative action.
- Ghost: toolbars, dismissals, and low-emphasis actions.
- Danger: destructive confirmation only.
- Keep visible buttons at least 40 px high on desktop and 44 px on touch surfaces.
- Use a subtle `scale(0.96)` press response unless the button is marked static.
- Icon-side padding may be 2 px tighter than the text side for optical balance.
- Do not use fully rounded buttons or variants containing `soft`.

### 10.3 Cards and panels

A card should represent one of these:

- a durable object such as an article, report, integration, or plan;
- a decision such as approval, connection, or upgrade;
- a meaningful summary that combines related signals;
- a preview of something the user will open, share, or publish.

Prefer flat sections with dividers for repeated rows. Avoid a separate card per small statistic when three metrics can share one aligned summary row.

### 10.4 Repeated rows

Use rows for articles, activity, integrations, approvals, and search results:

- start: literal icon or provider mark;
- center: title, one-line description, optional reason;
- end: plain status, metric, time, or one action;
- divider between rows;
- hover changes surface tone only when the row is interactive;
- no press scaling on full-width dense rows, which can make lists visually unstable.

### 10.5 Filters, tabs, and segmented choices

- Prefer a search field plus rectangular dropdown controls for large result sets.
- Use a compact tab bar for three to five peer views.
- Use a left settings sub-navigation when sections exceed five or represent different mental models.
- Selected tabs and filters use a bottom indicator, subtle surface, or weight change—not a pill.
- Counts sit as plain tabular text beside the label.

### 10.6 Forms

- Labels remain above fields for scanability.
- Fields use a visible accessible outline and 10 px radius.
- Group related fields inside a section; do not place every field in its own card.
- Help text explains format or consequence, not the label again.
- Put save actions near the changed region; use a sticky footer only for long multi-section forms.
- Display credential safety and publishing authority as concise inline information, not decorative trust cards.

### 10.7 Status, progress, and usage

- Status is plain text with semantic color and, when useful, a small dot.
- Progress bars and meters stay inside the content flow, never attached decoratively to card edges.
- Usage summaries combine the current value, limit, reset date, and action in one compact region.
- Use a meter only when the proportion changes a decision; otherwise show a number and explanatory text.

### 10.8 Overlays

Menus, popovers, sheets, and dialogs should feel like focused tools:

- clear title and one-sentence description;
- content grouped into no more than two surface levels;
- stable footer for irreversible or multi-action decisions;
- one primary action;
- blurred or dimmed backdrop with a reduced-transparency fallback;
- 18 px maximum outer radius for routine overlays;
- close control with at least a 40 px desktop hit area.

Use atmospheric art in an overlay only for a significant connection, launch, or onboarding event. Routine confirmations use a plain header.

### 10.9 Imagery and Claudia material

- Preserve the existing Claudia orb as the recognizable identity asset.
- Use it large only on setup, a major live-agent state, or an intentional empty state.
- For previews or plan cards, a cropped cyan/blue/lilac material strip can provide warmth without dominating the content.
- Every image receives the neutral inset outline described above.
- Do not introduce unrelated scenic imagery, fake dashboards, stock illustration, sparkles, or cosmic AI motifs.

## 11. Motion

Motion should clarify state and preserve context.

| Interaction | Target |
| --- | --- |
| Hover / focus tone change | 120–160 ms, ease-out |
| Button press | Interruptible scale to `0.96`, about 150 ms |
| Menu / popover | 160–200 ms with short opacity and 4–8 px movement |
| Modal / sheet | 200–240 ms; exit shorter and quieter than enter |
| Contextual icon swap | Opacity 0→1, scale 0.25→1, blur 4→0; Motion spring duration 0.3, bounce 0 |
| Page content | No generic animation on every navigation; use staged entry only for onboarding or a true first-use moment |

Do not use `transition: all`. Specify the properties that change. Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.

## 12. Page blueprints

### 12.1 Claudia dashboard

Target composition:

1. compact live state and next update;
2. one concise headline explaining what Claudia is doing or what changed;
3. one primary action if the user is blocking progress;
4. a work/result stream in rows;
5. a narrow evidence or result rail when useful;
6. Ask Claudia as a secondary sheet action.

The orb may anchor the setup or live-state focal area, but the operational dashboard should not require a large atmospheric stage on every visit. Once setup is complete, information density and recent work take priority.

### 12.2 Content

- Keep the current review / scheduled / published mental model.
- Present each group as a flat list region with a compact header, count, and rows.
- Put title and “why Claudia created this” at the start; destination, status, and performance at the end.
- Use a detail/editor view with a readable central column and a supporting status rail.
- Avoid a large rounded card for every article or content idea.

### 12.3 Results and visibility

- Begin with a concise summary of what improved, declined, or needs action.
- Show metrics in an aligned strip or table before using individual metric cards.
- Use charts only when trend or comparison matters; label them directly where possible.
- Separate “evidence” from “recommended action” so a user can inspect why Claudia reached a conclusion.
- Use provider/source color only where it aids recognition; retain neutral app chrome.

### 12.4 Needs-your-input inbox

Use the structure suggested by reference 6:

- left: categories or approval queues;
- center: compact request list;
- right: selected request, evidence, recommendation, and decision controls.

On smaller screens, the selected request becomes a full-page detail or sheet. Empty states explain what will appear and whether Claudia can continue without the user.

### 12.5 Settings

Replace the crowded horizontal settings tab set with a secondary left navigation on desktop and a select or compact tab control on mobile.

Recommended groups:

- Brand: identity, positioning, voice, audience;
- Goals: outcomes and priorities;
- Publishing: authority and approval behavior;
- Work preferences: cadence and operating choices;
- Connections: publishing and measurement services;
- Billing: plan, usage, invoices;
- Advanced: diagnostic and low-frequency automation controls.

The content pane uses section headers and grouped fields. Reserve cards for brand identity, plan summary, and integration objects rather than every configuration section.

### 12.6 Connections

- Search and filter only when the catalog is large enough to justify them.
- Use a dense two-column row grid for available services on wide screens, inspired by reference 7.
- Selecting a service opens a persistent detail pane or modal with setup requirements and authority implications.
- Connected state is plain semantic text; the provider mark supplies brand recognition.
- Separate “available now” from “planned” without making planned items look interactive.

### 12.7 Billing and pricing

- Lead with the current plan, usage, reset timing, and the relevant action in one compact summary.
- Plan comparison uses two or three equal-height cards with aligned feature rows and bottom-aligned actions.
- A narrow Claudia material strip may top the cards; it is optional and should not reduce readability.
- Render “Free,” “Active,” and price metadata as plain text, not badges.
- Use neutral primary actions in-app. A colored CTA is acceptable on the public pricing page only if it remains the single accent focal point.

### 12.8 Onboarding and connection setup

- Fullscreen and distraction-free remains correct.
- Use a two-part layout: Claudia presence or preview on one side, clear setup progress and copy on the other.
- Keep steps visible but compact; distinguish active, complete, failed, and upcoming through icon/text color rather than containers.
- Significant setup confirmations can use the focused-modal pattern from reference 3.

### 12.9 Account and brand switcher

Adopt the grouped popover composition from reference 4:

1. signed-in identity;
2. account and support actions;
3. brand/workspace choices with a plain checkmark for the current item;
4. plan and usage summary;
5. upgrade or manage-plan action.

Do not mix destructive sign-out with the most common workspace actions without a divider.

## 13. Current-to-target change matrix

These are design-direction changes, not code changes made by this document.

### Layout and hierarchy

| Before | After |
| --- | --- |
| Many pages rely on a centered `max-w-7xl` card stack | Width follows the task: fluid operational workspaces, narrower settings, and a reading measure for editors |
| Horizontal settings tabs carry seven different concepts | Secondary settings navigation on desktop; compact mobile alternative |
| Large focal dashboard composition continues after initial setup | A compact operator workspace prioritizes state, work, evidence, and owner decisions |
| Repeated content is often enclosed by large rounded cards | Repeated content becomes divider-based rows inside one quiet group surface |

### Surface and shape

| Before | After |
| --- | --- |
| `rounded-3xl` is common for routine cards and skeletons | Routine cards use 14 px; overlays use up to 18 px; 24 px is exceptional |
| Equal rounded surfaces are frequently nested | Closely nested surfaces use concentric radii or remove the unnecessary inner card |
| Borders and large white cards create most hierarchy | Spacing, tonal surface levels, structural dividers, and subtle shadow-rings share the work |
| Filter-like controls can read as chips | Tabs, dropdowns, and rectangular buttons express filtering without pills or chips |

### Typography

| Before | After |
| --- | --- |
| Uppercase eyebrow labels appear in dashboard regions | Short sentence-case labels with normal or slightly increased tracking |
| Display typography appears in multiple operational regions | Cal Sans/display styling is reserved for onboarding and one true focal moment |
| Similar heading weights compete across nested cards | A semantic type hierarchy limits sizes and uses 400/500/600 consistently |
| Metrics are sometimes separated into individual cards | Aligned metric strips use tabular numbers and shared labels |

### Color and identity

| Before | After |
| --- | --- |
| Claudia atmosphere can become the dominant background | Claudia blue/cyan/lilac is confined to identity, live state, and selected artwork |
| Accent and status surfaces may carry tinted containers | Status is plain semantic text or text plus a small dot |
| Theme documentation includes badge and chip use cases | Repository rule wins: no pills, chips, badges, or pill-shaped text containers |
| Dark references could imply a separate redesign | Dark mode mirrors the same semantic hierarchy after the light-mode structure is stable |

### Interaction and motion

| Before | After |
| --- | --- |
| Full-width list rows may scale on press | Dense rows change tone; button press retains `scale(0.96)` |
| Motion treatment varies by local component | Shared durations and property-specific transitions create one interaction rhythm |
| Decorative animation can signal “AI” | Motion communicates progress, selection, opening, completion, and live state only |

## 14. Implementation map

Start with shared foundations before redesigning individual routes.

| Layer | Primary files / areas | Intended change |
| --- | --- | --- |
| Tokens and root typography | `src/app/globals.css`, `src/app/layout.tsx`, `DESIGN.md` | Semantic surface, radius, shadow, type, motion, and Claudia signal tokens |
| Global shell | `src/components/layout/app-shell.tsx`, `app-sidebar.tsx`, `app-navbar.tsx`, `brand-switcher.tsx` | Stable shell density, active rows, grouped account popover, route-aware widths |
| Shared patterns | `src/components/ui`, `src/components/feedback`, HeroUI wrappers | Row pattern, status text, section header, overlay footer, metric strip, empty state |
| Dashboard | `src/components/dashboard` | Compact operator workspace after setup; preserve focal Claudia setup state |
| Content and activity | `src/components/articles`, `src/components/activity` | Divider-based lists, consistent row anatomy, readable editor layout |
| Results | `src/app/(app)/visibility`, `src/components` visibility/report modules | Summary → evidence → action hierarchy |
| Settings and connections | `src/app/(app)/settings`, `src/components/settings`, `src/components/integrations` | Secondary navigation and denser connection rows with a detail pane |
| Inbox | `src/components/inbox` | Queue/list/detail workspace |
| Billing and pricing | `src/components/settings/billing-section.tsx`, `src/components/billing`, `src/components/marketing` | Compact usage summary and aligned plan comparison |
| Onboarding | `src/components/brand` | Focused two-part setup flow with restrained Claudia atmosphere |

## 15. Rollout sequence

### Phase 1 — foundation

- Reconcile this direction with `DESIGN.md` and remove guidance that conflicts with repository rules.
- Define semantic radius, surface shadow, Claudia signal, and motion tokens.
- Audit contrast for text, status, fields, focus rings, and dark-mode candidates.
- Create reusable row, section header, status text, and metric strip patterns.

### Phase 2 — shell and navigation

- Refine sidebar and top bar density.
- Build the account/brand popover.
- Establish route-specific content width utilities.
- Verify keyboard navigation, focus visibility, mobile off-canvas behavior, and 40/44 px hit areas.

### Phase 3 — core work surfaces

- Redesign dashboard, content lists, activity, results, and inbox around rows and panes.
- Preserve URLs, data behavior, query loading, errors, and empty states while changing presentation.
- Test with sparse, normal, and high-volume data.

### Phase 4 — settings, connections, and billing

- Introduce the settings sub-navigation.
- Convert connection catalog and detail flows.
- Align billing summary, invoices, and plan comparison.

### Phase 5 — onboarding, overlays, and dark mode

- Apply the focal visual language to onboarding and major connection dialogs.
- Normalize sheets, popovers, modals, and confirmation footers.
- Add or finish dark mode only after the light-mode component hierarchy passes review.

## 16. Acceptance checklist

### Visual system

- [ ] The app reads as one shell rather than a stack of page-specific card designs.
- [ ] Routine cards use the shared radius scale; nested radii are concentric.
- [ ] Repeated data uses rows, dividers, or tables rather than one card per item.
- [ ] Color remains rare and semantic.
- [ ] Claudia's orb/material is visible only at meaningful focal moments.
- [ ] No pills, chips, badges, or pill-shaped text containers appear.
- [ ] No Button variant containing `soft` appears.
- [ ] All interface icons come from the approved Hugeicons packages.

### Typography and content

- [ ] Text uses the semantic size hierarchy and only necessary weights.
- [ ] Operational labels use natural case; no decorative all-caps eyebrows remain.
- [ ] Headings balance, descriptions wrap prettily, and long-form text stays within 60–75 characters.
- [ ] Changing or aligned numeric values use tabular figures.
- [ ] Truncated information is available in full somewhere.

### Interaction and accessibility

- [ ] Primary action hierarchy is obvious in each decision area.
- [ ] Desktop targets are at least 40×40 px; touch targets are at least 44×44 px.
- [ ] Fields remain 16 px on mobile.
- [ ] Text and UI controls meet WCAG AA contrast on their actual surfaces.
- [ ] Focus rings are visible in light and dark candidates.
- [ ] Motion is interruptible, property-specific, and reduced-motion safe.
- [ ] Reduced-transparency mode retains legible opaque surfaces.
- [ ] Layout works at keyboard zoom and with longer content.

### Product clarity

- [ ] The user can answer “What is Claudia doing?” from the dashboard without opening another page.
- [ ] The user can distinguish evidence, recommendation, and action in results and approvals.
- [ ] Settings communicate scope and consequence before save or enable actions.
- [ ] Status never relies on color alone.
- [ ] Empty states explain what will happen next, not merely that data is absent.

## 17. Final design test

For every new or changed screen, ask:

1. What is the user's decision or job on this screen?
2. Is the shell already providing structure that a local card is repeating?
3. What is the one visually primary action?
4. Can a repeated set become aligned rows instead of separate cards?
5. Does every color, icon, image, and animation communicate real information?
6. Is Claudia present through useful behavior rather than decoration?
7. Would the hierarchy still work in grayscale, at 200% zoom, and with longer copy?

If those answers are clear, the result will carry the references' aesthetic without imitating their products.
