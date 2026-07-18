export type HostResolver = (hostname: string, signal?: AbortSignal) => Promise<string[]>;

export type EgressDecision = {
  allowed: boolean;
  normalizedUrl: string | null;
  hostname: string | null;
  addresses: string[];
  reason: string;
};

export class CrawlBudget {
  private totalRequests = 0;
  private totalBytes = 0;
  private readonly hostRequests = new Map<string, number>();

  constructor(
    readonly workspaceKey: string,
    private readonly limits: {
      maxRequests: number;
      maxRequestsPerHost: number;
      maxBytes: number;
      deadline: number;
    },
  ) {}

  takeRequest(hostname: string): void {
    if (Date.now() >= this.limits.deadline) throw new Error("Workspace crawl time budget exceeded");
    const hostCount = this.hostRequests.get(hostname) ?? 0;
    if (this.totalRequests >= this.limits.maxRequests) {
      throw new Error("Workspace crawl request budget exceeded");
    }
    if (hostCount >= this.limits.maxRequestsPerHost) {
      throw new Error("Per-host crawl request budget exceeded");
    }
    this.totalRequests += 1;
    this.hostRequests.set(hostname, hostCount + 1);
  }

  addBytes(bytes: number): void {
    this.totalBytes += Math.max(0, bytes);
    if (this.totalBytes > this.limits.maxBytes) {
      throw new Error("Workspace crawl byte budget exceeded");
    }
  }
}

export function createCrawlBudget(
  workspaceKey = "anonymous",
  options: Partial<{
    maxRequests: number;
    maxRequestsPerHost: number;
    maxBytes: number;
    totalTimeoutMs: number;
  }> = {},
): CrawlBudget {
  return new CrawlBudget(workspaceKey, {
    maxRequests: options.maxRequests ?? 50,
    maxRequestsPerHost: options.maxRequestsPerHost ?? 30,
    maxBytes: options.maxBytes ?? 20 * 1024 * 1024,
    deadline: Date.now() + (options.totalTimeoutMs ?? 60_000),
  });
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  return bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? bytes
    : null;
}

function isBlockedIpv4(value: string): boolean {
  const bytes = parseIpv4(value);
  if (!bytes) return false;
  const [a = 0, b = 0] = bytes;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function expandIpv6(value: string): number[] | null {
  let input = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const ipv4Tail = input.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const bytes = parseIpv4(ipv4Tail);
    if (!bytes) return null;
    input = input.slice(0, -ipv4Tail.length) +
      `${((bytes[0] ?? 0) << 8 | (bytes[1] ?? 0)).toString(16)}:` +
      `${((bytes[2] ?? 0) << 8 | (bytes[3] ?? 0)).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array.from({ length: fill }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const numbers = groups.map((group) => Number.parseInt(group || "0", 16));
  return numbers.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? numbers
    : null;
}

function isBlockedIpv6(value: string): boolean {
  const groups = expandIpv6(value);
  if (!groups) return false;
  const first = groups[0] ?? 0;
  const allZero = groups.every((group) => group === 0);
  const loopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const mappedIpv4 = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mappedIpv4) {
    const last = groups[6] ?? 0;
    const final = groups[7] ?? 0;
    return isBlockedIpv4(
      `${last >> 8}.${last & 0xff}.${final >> 8}.${final & 0xff}`,
    );
  }
  return (
    allZero ||
    loopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && groups[1] === 0x0db8)
  );
}

export function isBlockedAddress(address: string): boolean {
  return isBlockedIpv4(address) || isBlockedIpv6(address);
}

export function isSameSite(left: URL, right: URL): boolean {
  const normalize = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "");
  return normalize(left.hostname) === normalize(right.hostname);
}

async function resolveDnsJson(hostname: string, signal?: AbortSignal): Promise<string[]> {
  const query = async (type: "A" | "AAAA") => {
    const url = new URL("https://cloudflare-dns.com/dns-query");
    url.searchParams.set("name", hostname);
    url.searchParams.set("type", type);
    const response = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal,
    });
    if (!response.ok) throw new Error(`DNS resolution failed with ${response.status}`);
    const data = await response.json() as { Answer?: Array<{ type?: number; data?: string }> };
    return (data.Answer ?? []).flatMap((answer) => {
      if ((answer.type === 1 || answer.type === 28) && typeof answer.data === "string") {
        return [answer.data];
      }
      return [];
    });
  };
  const [ipv4, ipv6] = await Promise.all([query("A"), query("AAAA")]);
  return [...new Set([...ipv4, ...ipv6])];
}

export async function assessEgressUrl(
  input: string | URL,
  options: {
    resolver?: HostResolver;
    signal?: AbortSignal;
    requireDnsResolution?: boolean;
  } = {},
): Promise<EgressDecision> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { allowed: false, normalizedUrl: null, hostname: null, addresses: [], reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, normalizedUrl: null, hostname: null, addresses: [], reason: "unsupported_scheme" };
  }
  if (url.username || url.password) {
    return { allowed: false, normalizedUrl: null, hostname: null, addresses: [], reason: "userinfo_not_allowed" };
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80") ||
      (url.protocol === "https:" && url.port && url.port !== "443")) {
    return { allowed: false, normalizedUrl: null, hostname: null, addresses: [], reason: "non_standard_port" };
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { allowed: false, normalizedUrl: null, hostname, addresses: [], reason: "blocked_hostname" };
  }

  const literal = parseIpv4(hostname) || expandIpv6(hostname) ? [hostname] : [];
  let addresses = literal;
  if (addresses.length === 0 && options.requireDnsResolution !== false) {
    try {
      addresses = await (options.resolver ?? resolveDnsJson)(hostname, options.signal);
    } catch {
      return { allowed: false, normalizedUrl: null, hostname, addresses: [], reason: "dns_resolution_failed" };
    }
    if (addresses.length === 0) {
      return { allowed: false, normalizedUrl: null, hostname, addresses: [], reason: "dns_no_public_address" };
    }
  }
  if (addresses.some(isBlockedAddress)) {
    return { allowed: false, normalizedUrl: null, hostname, addresses, reason: "private_or_reserved_address" };
  }
  url.hostname = hostname;
  url.hash = "";
  return {
    allowed: true,
    normalizedUrl: url.toString(),
    hostname,
    addresses,
    reason: "public_http_destination",
  };
}

export async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Response exceeds ${maxBytes} byte limit`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response byte limit exceeded");
        throw new Error(`Response exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Validated, redirect-aware, bounded fetch for crawler-adjacent probes. */
export async function safePublicFetch(
  input: string | URL,
  init: RequestInit = {},
  options: {
    fetchImpl?: typeof fetch;
    resolver?: HostResolver;
    maxBytes?: number;
    maxRedirects?: number;
    sameSiteWith?: string | URL;
    budget?: CrawlBudget;
    workspaceBudgetKey?: string;
    discardBody?: boolean;
  } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = Math.min(5, Math.max(0, options.maxRedirects ?? 3));
  const root = options.sameSiteWith ? new URL(options.sameSiteWith) : new URL(input);
  const budget = options.budget ?? createCrawlBudget(options.workspaceBudgetKey, {
    maxRequests: maxRedirects + 1,
    maxRequestsPerHost: maxRedirects + 1,
    maxBytes,
    totalTimeoutMs: 30_000,
  });
  let current = new URL(input, root);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const decision = await assessEgressUrl(current, {
      resolver: options.resolver,
      signal: init.signal ?? undefined,
      requireDnsResolution: !options.fetchImpl || Boolean(options.resolver),
    });
    if (!decision.allowed || !decision.normalizedUrl) {
      throw new Error(`Blocked crawler destination: ${decision.reason}`);
    }
    current = new URL(decision.normalizedUrl);
    if (!isSameSite(root, current)) throw new Error("Cross-site crawler fetch blocked");
    budget.takeRequest(current.hostname);
    const response = await fetchImpl(current.toString(), { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    if (options.discardBody) {
      await response.body?.cancel("body not required");
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    if (init.method?.toUpperCase() === "HEAD" || !response.body) return response;
    const body = await readLimitedBody(response, maxBytes);
    budget.addBytes(new TextEncoder().encode(body).byteLength);
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  throw new Error(`Too many redirects (>${maxRedirects})`);
}
