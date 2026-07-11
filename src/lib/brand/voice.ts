import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema";
import { getBrandProfile } from "@/lib/brand/repository";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { logInfo, logWarn } from "@/lib/logging/logger";

/**
 * C3 brand voice memory: a structured voice doc that starts from the profile's
 * tone and grows every time the user edits a draft before approving it.
 * Claudia learns the voice the way a real hire does, by being edited.
 */

export type VoiceDoc = {
  wordsWeUse: string[];
  wordsWeAvoid: string[];
  stance: string;
  exampleSentences: string[];
  /** Rules extracted from the user's edits, newest last. */
  learnedRules: string[];
};

const MAX_LEARNED_RULES = 15;
/** Skip learning on trivial tweaks: a typo fix teaches nothing about voice. */
const MIN_EDIT_DISTANCE_CHARS = 120;

export function parseVoiceDoc(json: string | null | undefined): VoiceDoc | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<VoiceDoc>;
    return {
      wordsWeUse: Array.isArray(raw.wordsWeUse) ? raw.wordsWeUse : [],
      wordsWeAvoid: Array.isArray(raw.wordsWeAvoid) ? raw.wordsWeAvoid : [],
      stance: typeof raw.stance === "string" ? raw.stance : "",
      exampleSentences: Array.isArray(raw.exampleSentences) ? raw.exampleSentences : [],
      learnedRules: Array.isArray(raw.learnedRules) ? raw.learnedRules : [],
    };
  } catch {
    return null;
  }
}

/** Render the doc as the prompt block `BrandContext.voice` carries. */
export function renderVoiceBlock(voice: VoiceDoc): string | null {
  const lines = [
    voice.wordsWeUse.length ? `Words we use: ${voice.wordsWeUse.join(", ")}` : null,
    voice.wordsWeAvoid.length ? `Words we never use: ${voice.wordsWeAvoid.join(", ")}` : null,
    voice.stance ? `Our stance: ${voice.stance}` : null,
    voice.exampleSentences.length
      ? `Sentences we would write:\n${voice.exampleSentences.map((s) => `- "${s}"`).join("\n")}`
      : null,
    voice.learnedRules.length
      ? `Rules learned from the owner's edits (follow all):\n${voice.learnedRules.map((r) => `- ${r}`).join("\n")}`
      : null,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

async function saveVoiceDoc(brandId: string, voice: VoiceDoc) {
  await getDb()
    .update(brandProfiles)
    .set({ voiceJson: JSON.stringify(voice), updatedAt: new Date() })
    .where(eq(brandProfiles.brandId, brandId));
}

/** Rough size of the diff: cheap gate so typo fixes never hit the LLM. */
function editMagnitude(before: string, after: string) {
  const beforeSet = new Set(before.split(/\s+/));
  const afterSet = new Set(after.split(/\s+/));
  let changed = 0;
  for (const word of afterSet) if (!beforeSet.has(word)) changed += word.length + 1;
  for (const word of beforeSet) if (!afterSet.has(word)) changed += word.length + 1;
  return changed;
}

/**
 * Diff a draft against the user's edited version and append generalizable
 * voice rules to the doc. Fire on approval; failures only log: an edit save
 * must never break because learning hiccupped.
 */
export async function learnVoiceFromEdit(brandId: string, before: string, after: string) {
  if (!getLlmConfig()) return;
  if (before === after || editMagnitude(before, after) < MIN_EDIT_DISTANCE_CHARS) return;

  try {
    const result = await generateJson<{ rules: string[] }>("light", [
      {
        role: "system",
        content:
          "You learn a brand's writing voice from how the owner edits AI drafts. Compare the " +
          "draft and the edited version and extract at most 3 generalizable voice rules: " +
          'phrasing, word choice, tone, structure preferences (e.g. "shorten intros", ' +
          "\"say 'clients', never 'customers'\"). Ignore factual corrections and one-off " +
          'changes. Return JSON {"rules": string[]}: an empty array when the edits teach nothing.',
      },
      {
        role: "user",
        content: `Original draft:
${before.slice(0, 6000)}

Edited by the owner:
${after.slice(0, 6000)}`,
      },
    ]);

    const rules = (result.data.rules ?? [])
      .map((rule) => rule.trim())
      .filter((rule) => rule.length > 0 && rule.length <= 200);
    if (rules.length === 0) return;

    const profile = await getBrandProfile(brandId);
    if (!profile) return;
    const voice = parseVoiceDoc(profile.voiceJson) ?? {
      wordsWeUse: [],
      wordsWeAvoid: [],
      stance: "",
      exampleSentences: [],
      learnedRules: [],
    };

    const known = new Set(voice.learnedRules.map((rule) => rule.toLowerCase()));
    const fresh = rules.filter((rule) => !known.has(rule.toLowerCase()));
    if (fresh.length === 0) return;

    voice.learnedRules = [...voice.learnedRules, ...fresh].slice(-MAX_LEARNED_RULES);
    await saveVoiceDoc(brandId, voice);
    logInfo("voice.rules_learned", { brandId, added: fresh.length });
  } catch (error) {
    logWarn("voice.learning_skipped", {
      brandId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
