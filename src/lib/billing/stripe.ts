import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    // On Cloudflare Workers the SDK's default Node HTTP client runs through the
    // nodejs_compat shim and is noticeably slower than the platform's native
    // fetch. The fetch client is the documented edge setup and is the single
    // biggest win for checkout latency. Telemetry adds a blocking timing header
    // we don't need, and one retry is plenty for a user-facing checkout call.
    stripeClient = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
      telemetry: false,
      maxNetworkRetries: 1,
      timeout: 20_000,
    });
  }

  return stripeClient;
}

export function getAppUrl() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}
