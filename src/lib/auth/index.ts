import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ensureUserWorkspace } from "@/lib/workspace";

function socialProviders() {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : undefined;

  const github =
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }
      : undefined;

  if (!google && !github) {
    return undefined;
  }

  return { google, github };
}

function createAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
    }),
    socialProviders: socialProviders(),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureUserWorkspace(user.id, user.name);
          },
        },
      },
    },
  });
}

let cachedAuth: Auth | null = null;
const requestAuths = new WeakMap<object, Auth>();

export function getAuth() {
  const context = getCloudflareRequestContext();
  const requestKey = context?.env?.HYPERDRIVE?.connectionString ? context.ctx : undefined;

  if (requestKey) {
    const requestAuth = requestAuths.get(requestKey);
    if (requestAuth) {
      return requestAuth;
    }

    const auth = createAuth();
    requestAuths.set(requestKey, auth);
    return auth;
  }

  cachedAuth ??= createAuth();
  return cachedAuth;
}

export type Auth = ReturnType<typeof createAuth>;
