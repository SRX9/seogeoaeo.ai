type CloudflareRequestContext = {
  env?: Partial<CloudflareEnv>;
  ctx?: object;
  cf?: unknown;
};

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

export function getCloudflareRequestContext() {
  return (globalThis as unknown as Record<symbol, CloudflareRequestContext | undefined>)[
    cloudflareContextSymbol
  ];
}
