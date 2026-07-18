import { z } from "zod";
import { getDb } from "@/lib/db";
import { agentLlmCalls } from "@/lib/db/schema";
import { logInfo, logWarn } from "@/lib/logging/logger";
import { recordLlmTrace } from "@/lib/observability/trace";

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
  retryCount: number;
  terminationReason: string | null;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  models: Record<ModelTier, string>;
};

export type LlmErrorClass =
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "authentication"
  | "moderation"
  | "invalid_request"
  | "invalid_response"
  | "circuit_open";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly errorClass: LlmErrorClass,
    readonly retryable: boolean,
    readonly status: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

type LlmCallContext = {
  workspaceId?: string;
  brandId?: string;
  stepExecutionId?: string;
};

export type LlmCallOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  /** Sampling controls. JSON calls default to temperature 0. */
  temperature?: number;
  /** Provider-supported deterministic sampling seed. */
  seed?: number;
  promptVersion?: string;
  context?: LlmCallContext;
  /** Explicit fallback only; it must be declared at the same safety tier. */
  fallbackModel?: string;
  fallbackSafetyTier?: ModelTier;
};

export type LlmJsonOptions<T> = LlmCallOptions & {
  /** Every structured response must cross a concrete runtime contract. */
  schema: z.ZodType<T>;
  maxRepairAttempts?: number;
};

const chatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      refusal: z.string().nullable().optional(),
    }).passthrough(),
    finish_reason: z.string().nullable().optional(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

const imageResponseSchema = z.object({
  data: z.array(z.object({
    url: z.string().url().optional(),
    b64_json: z.string().min(1).optional(),
  }).passthrough()).min(1),
}).passthrough();

const MAX_SUCCESS_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 3;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 30_000;

type CircuitState = { consecutiveFailures: number; openUntil: number };
const circuits = new Map<string, CircuitState>();

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

  if (!baseUrl || !apiKey || !light || !heavy || !image) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    models: { light, heavy, image },
  };
}

function modelForTier(config: LlmConfig, tier: ModelTier) {
  return config.models[tier];
}

function providerFor(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "configured-provider";
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new LlmError("LLM response exceeded the bounded body limit", "invalid_response", false);
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(0, seconds * 1_000));
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.min(30_000, Math.max(0, at - Date.now())) : null;
}

function responseError(status: number, body: string, retryAfter: number | null): LlmError {
  const bounded = body.trim().slice(0, 2_000);
  const suffix = bounded ? `: ${bounded}` : "";
  if (
    /content[_ -]?policy|content[_ -]?filter|moderation|safety[_ -]?(?:policy|system)|responsible ai/i.test(
      bounded,
    )
  ) {
    return new LlmError(`LLM request blocked by moderation (${status})${suffix}`, "moderation", false, status);
  }
  if (status === 429) {
    return new LlmError(`LLM rate limited (${status})${suffix}`, "rate_limited", true, status, retryAfter);
  }
  if (status === 408) {
    return new LlmError(`LLM request timed out (${status})${suffix}`, "timeout", true, status, retryAfter);
  }
  if (status >= 500) {
    return new LlmError(`LLM provider unavailable (${status})${suffix}`, "provider_unavailable", true, status, retryAfter);
  }
  if (status === 401 || status === 403) {
    return new LlmError(`LLM authentication failed (${status})`, "authentication", false, status);
  }
  return new LlmError(`LLM request rejected (${status})${suffix}`, "invalid_request", false, status);
}

function normalizeFetchError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) {
    return new LlmError("LLM request timed out", "timeout", true);
  }
  return new LlmError(`LLM network request failed: ${message.slice(0, 500)}`, "network", true);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertCircuitClosed(key: string) {
  const state = circuits.get(key);
  if (!state || state.openUntil <= Date.now()) return;
  throw new LlmError("LLM circuit is temporarily open", "circuit_open", true, null, state.openUntil - Date.now());
}

function recordCircuitSuccess(key: string) {
  circuits.delete(key);
}

function recordCircuitFailure(key: string) {
  const previous = circuits.get(key) ?? { consecutiveFailures: 0, openUntil: 0 };
  const consecutiveFailures = previous.consecutiveFailures + 1;
  circuits.set(key, {
    consecutiveFailures,
    openUntil: consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() + CIRCUIT_OPEN_MS : 0,
  });
}

function shouldTripCircuit(error: LlmError) {
  return error.retryable || error.errorClass === "invalid_response";
}

async function recordCall(metadata: {
  config: LlmConfig;
  model: string;
  tier: ModelTier;
  options: LlmCallOptions;
  status: "completed" | "failed";
  errorClass?: LlmErrorClass;
  latencyMs: number;
  retryCount: number;
  usage?: LlmUsage;
  terminationReason?: string | null;
}) {
  const provider = providerFor(metadata.config.baseUrl);
  const event = {
    provider,
    model: metadata.model,
    tier: metadata.tier,
    promptVersion: metadata.options.promptVersion ?? "legacy",
    status: metadata.status,
    errorClass: metadata.errorClass ?? null,
    latencyMs: metadata.latencyMs,
    retryCount: metadata.retryCount,
    promptTokens: metadata.usage?.promptTokens ?? null,
    completionTokens: metadata.usage?.completionTokens ?? null,
    totalTokens: metadata.usage?.totalTokens ?? null,
    terminationReason: metadata.terminationReason ?? null,
  };
  logInfo("llm.call", event);
  const callId = crypto.randomUUID();
  try {
    await getDb().insert(agentLlmCalls).values({
      id: callId,
      workspaceId: metadata.options.context?.workspaceId ?? null,
      brandId: metadata.options.context?.brandId ?? null,
      stepExecutionId: metadata.options.context?.stepExecutionId ?? null,
      ...event,
    });
  } catch (error) {
    logWarn("llm.call_record_failed", {
      provider,
      model: metadata.model,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
    return;
  }
  try {
    await recordLlmTrace({
      callId,
      workspaceId: metadata.options.context?.workspaceId,
      brandId: metadata.options.context?.brandId,
      stepExecutionId: metadata.options.context?.stepExecutionId,
      ...event,
    });
  } catch (error) {
    logWarn("llm.trace_record_failed", {
      callId,
      provider,
      model: metadata.model,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
  }
}

async function postChatModel(
  config: LlmConfig,
  tier: ModelTier,
  model: string,
  messages: LlmMessage[],
  options: LlmCallOptions & { json?: boolean },
): Promise<LlmTextResult> {
  const startedAt = Date.now();
  const circuitKey = `${providerFor(config.baseUrl)}:${model}`;
  assertCircuitClosed(circuitKey);
  const maxRetries = options.maxRetries ?? DEFAULT_RETRIES;
  let lastError: LlmError | null = null;
  let lastAttempt = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastAttempt = attempt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? (options.json ? 0 : undefined),
          ...(options.seed !== undefined ? { seed: options.seed } : {}),
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await readBoundedBody(response, MAX_ERROR_BODY_BYTES);
        throw responseError(response.status, body, retryAfterMs(response));
      }
      const raw = await readBoundedBody(response, MAX_SUCCESS_BODY_BYTES);
      clearTimeout(timer);
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new LlmError("LLM returned malformed response JSON", "invalid_response", false);
      }
      const payload = chatResponseSchema.safeParse(decoded);
      if (!payload.success) {
        throw new LlmError("LLM response failed runtime schema validation", "invalid_response", false);
      }
      const choice = payload.data.choices[0];
      const text = choice?.message.content?.trim();
      if (
        !text &&
        (choice?.message.refusal || /content[_ -]?filter|moderation|safety/i.test(choice?.finish_reason ?? ""))
      ) {
        throw new LlmError("LLM response was blocked by moderation", "moderation", false);
      }
      if (!text) throw new LlmError("LLM returned an empty response", "invalid_response", false);
      const usage = payload.data.usage
        ? {
            promptTokens: payload.data.usage.prompt_tokens ?? 0,
            completionTokens: payload.data.usage.completion_tokens ?? 0,
            totalTokens: payload.data.usage.total_tokens ?? 0,
          }
        : undefined;
      const result: LlmTextResult = {
        text: sanitizeLlmText(text),
        model,
        tier,
        usage,
        retryCount: attempt,
        terminationReason: choice?.finish_reason ?? null,
      };
      recordCircuitSuccess(circuitKey);
      await recordCall({
        config,
        model,
        tier,
        options,
        status: "completed",
        latencyMs: Date.now() - startedAt,
        retryCount: attempt,
        usage,
        terminationReason: result.terminationReason,
      });
      return result;
    } catch (error) {
      clearTimeout(timer);
      lastError = normalizeFetchError(error);
      if (!lastError.retryable || attempt >= maxRetries) break;
      const exponential = Math.min(5_000, 250 * 2 ** attempt);
      const jittered = Math.round(exponential * (0.8 + Math.random() * 0.4));
      await wait(lastError.retryAfterMs ?? jittered);
    }
  }

  const error = lastError ?? new LlmError("LLM call failed", "network", true);
  if (shouldTripCircuit(error)) recordCircuitFailure(circuitKey);
  await recordCall({
    config,
    model,
    tier,
    options,
    status: "failed",
    errorClass: error.errorClass,
    latencyMs: Date.now() - startedAt,
    retryCount: lastAttempt,
  });
  throw error;
}

async function postChat(
  config: LlmConfig,
  tier: ModelTier,
  messages: LlmMessage[],
  options: LlmCallOptions & { json?: boolean } = {},
) {
  if (options.fallbackModel && options.fallbackSafetyTier !== tier) {
    throw new LlmError("LLM fallback safety tier does not match the requested tier", "invalid_request", false);
  }
  try {
    return await postChatModel(config, tier, modelForTier(config, tier), messages, options);
  } catch (error) {
    const normalized = normalizeFetchError(error);
    if (!options.fallbackModel || !normalized.retryable) throw normalized;
    return postChatModel(config, tier, options.fallbackModel, messages, {
      ...options,
      fallbackModel: undefined,
    });
  }
}

export async function generateText(
  tier: ModelTier,
  messages: LlmMessage[],
  options: LlmCallOptions = {},
) {
  const config = getLlmConfig();
  if (!config) {
    throw new LlmError(
      "LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.",
      "invalid_request",
      false,
    );
  }
  return postChat(config, tier, messages, options);
}

/** Tolerant extraction followed by caller-provided runtime validation. */
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
        // Continue to the bounded outermost object/array extraction.
      }
    }
    const start = trimmed.search(/[{[]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        // Fall through to the normalized malformed-output error below.
      }
    }
    throw new LlmError(
      `LLM returned non-JSON output: ${trimmed.slice(0, 200)}`,
      "invalid_response",
      false,
    );
  }
}

export async function generateJson<T>(
  tier: ModelTier,
  messages: LlmMessage[],
  options: LlmJsonOptions<T>,
) {
  const config = getLlmConfig();
  if (!config) {
    throw new LlmError(
      "LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.",
      "invalid_request",
      false,
    );
  }
  const schema = options.schema;
  const maxRepairAttempts = Math.min(1, Math.max(0, options.maxRepairAttempts ?? 1));
  let result = await postChat(config, tier, messages, { ...options, json: true });
  for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
    try {
      const parsed = parseModelJson<unknown>(result.text);
      const validated = schema.safeParse(parsed);
      if (validated.success) return { ...result, data: validated.data };
    } catch (error) {
      if (repairAttempt >= maxRepairAttempts) throw error;
    }
    if (repairAttempt >= maxRepairAttempts) break;
    logWarn("llm.json_repair", {
      tier,
      model: result.model,
      promptVersion: options.promptVersion ?? "legacy",
      repairAttempt: repairAttempt + 1,
    });
    result = await postChat(
      config,
      tier,
      [
        ...messages,
        { role: "assistant", content: result.text.slice(0, 50_000) },
        {
          role: "user",
          content: "Return corrected JSON only. Preserve the requested facts and satisfy the response schema.",
        },
      ],
      { ...options, json: true },
    );
  }
  throw new LlmError("LLM JSON failed runtime schema validation", "invalid_response", false);
}

export async function generateImage(prompt: string, options: LlmCallOptions = {}) {
  const config = getLlmConfig();
  if (!config) {
    throw new LlmError(
      "LLM is not configured. Set LLM_BASE_URL, LLM_API_KEY, and model env vars.",
      "invalid_request",
      false,
    );
  }
  const model = modelForTier(config, "image");
  const startedAt = Date.now();
  const circuitKey = `${providerFor(config.baseUrl)}:${model}`;
  assertCircuitClosed(circuitKey);
  const maxRetries = options.maxRetries ?? DEFAULT_RETRIES;
  let lastError: LlmError | null = null;
  let lastAttempt = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastAttempt = attempt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.baseUrl}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, n: 1 }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw responseError(
          response.status,
          await readBoundedBody(response, MAX_ERROR_BODY_BYTES),
          retryAfterMs(response),
        );
      }
      const raw = await readBoundedBody(response, MAX_SUCCESS_BODY_BYTES);
      clearTimeout(timer);
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new LlmError("Image provider returned malformed response JSON", "invalid_response", false);
      }
      const payload = imageResponseSchema.safeParse(decoded);
      if (!payload.success) {
        throw new LlmError("Image response failed runtime schema validation", "invalid_response", false);
      }
      const image = payload.data.data[0]!;
      if (!image.url && !image.b64_json) {
        throw new LlmError("Image generation returned no image", "invalid_response", false);
      }
      recordCircuitSuccess(circuitKey);
      await recordCall({
        config,
        model,
        tier: "image",
        options,
        status: "completed",
        latencyMs: Date.now() - startedAt,
        retryCount: attempt,
      });
      return { url: image.url, b64Json: image.b64_json, model, tier: "image" as const };
    } catch (error) {
      clearTimeout(timer);
      lastError = normalizeFetchError(error);
      if (!lastError.retryable || attempt >= maxRetries) break;
      await wait(lastError.retryAfterMs ?? Math.min(5_000, 250 * 2 ** attempt));
    }
  }
  const error = lastError ?? new LlmError("Image generation failed", "network", true);
  if (shouldTripCircuit(error)) recordCircuitFailure(circuitKey);
  await recordCall({
    config,
    model,
    tier: "image",
    options,
    status: "failed",
    errorClass: error.errorClass,
    latencyMs: Date.now() - startedAt,
    retryCount: lastAttempt,
  });
  throw error;
}
