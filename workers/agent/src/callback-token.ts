export type CallbackTokenInput = {
  workflowInstanceId: string;
  workspaceId: string;
  brandId?: string | null;
  step: string;
  requestId: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createCallbackToken(
  secret: string,
  input: CallbackTokenInput,
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    v: 1,
    sub: "agent-workflow",
    workflowInstanceId: input.workflowInstanceId,
    workspaceId: input.workspaceId,
    brandId: input.brandId ?? null,
    step: input.step,
    nonce: crypto.randomUUID(),
    requestId: input.requestId,
    iat: now,
    exp: now + 120,
  };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
}

