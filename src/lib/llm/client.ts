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
    text,
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

export async function generateJson<T>(tier: ModelTier, messages: LlmMessage[]) {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.");
  }
  const result = await postChat(config, tier, messages, { json: true });
  return {
    ...result,
    data: JSON.parse(result.text) as T,
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
