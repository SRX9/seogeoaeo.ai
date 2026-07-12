export type ModelTier = "light" | "heavy" | "image";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type LlmTextResult = {
  text: string;
  model: string;
  tier: ModelTier;
  usage?: LlmUsage;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  models: Record<ModelTier, string>;
};

/**
 * Strip long dash punctuation from model output at every chat-completion
 * boundary. This keeps generated copy consistent even when a provider ignores
 * the writing instructions in a prompt.
 */
export function sanitizeLlmText(text: string): string {
  return text
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+--\s+/g, ", ");
}

export function getLlmConfig(): LlmConfig | null {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const light = process.env.LLM_LIGHT_MODEL;
  const heavy = process.env.LLM_HEAVY_MODEL;
  const image = process.env.LLM_IMAGE_MODEL;

  if (!baseUrl || !apiKey || !light || !heavy || !image) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    models: { light, heavy, image },
  };
}

function modelForTier(config: LlmConfig, tier: ModelTier) {
  return config.models[tier];
}

async function postChat(
  config: LlmConfig,
  tier: ModelTier,
  messages: LlmMessage[],
  options?: { json?: boolean },
): Promise<LlmTextResult> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelForTier(config, tier),
      messages,
      ...(options?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("LLM returned an empty response");
  }

  return {
    text: sanitizeLlmText(text),
    model: modelForTier(config, tier),
    tier,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens ?? 0,
          completionTokens: payload.usage.completion_tokens ?? 0,
          totalTokens: payload.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

export async function generateText(tier: ModelTier, messages: LlmMessage[]) {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.");
  }
  return postChat(config, tier, messages);
}

/**
 * Parse a model's "JSON" output tolerantly: some providers ignore
 * `response_format` and wrap the payload in a ```json fence (or add prose
 * around it). Try verbatim first, then the fenced block, then the outermost
 * JSON object/array: a genuinely malformed payload still throws.
 */
export function parseModelJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced.trim()) as T;
      } catch {
        // fall through to the outermost-braces attempt
      }
    }
    const start = trimmed.search(/[{[]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error(`LLM returned non-JSON output: ${trimmed.slice(0, 200)}`);
  }
}

export async function generateJson<T>(tier: ModelTier, messages: LlmMessage[]) {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.");
  }
  const result = await postChat(config, tier, messages, { json: true });
  return {
    ...result,
    data: parseModelJson<T>(result.text),
  };
}

export async function generateImage(prompt: string) {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.");
  }

  const response = await fetch(`${config.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelForTier(config, "image"),
      prompt,
      n: 1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const image = payload.data?.[0];
  if (!image?.url && !image?.b64_json) {
    throw new Error("Image generation returned no image");
  }

  return {
    url: image.url,
    b64Json: image.b64_json,
    model: modelForTier(config, "image"),
    tier: "image" as const,
  };
}
