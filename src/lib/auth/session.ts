import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

export type Session = {
  user: SessionUser;
};

/**
 * The local-preview auth bypass. Hard-fenced from production builds: the flag
 * hands any anonymous request a full session (and, via getBillingContext, an
 * active plan with credits), so a stray `AUTH_DEV_BYPASS=true` on the deployed
 * worker must be inert rather than an open door.
 */
export function isAuthDevBypass(): boolean {
  return process.env.AUTH_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production";
}

export async function getSession(): Promise<Session | null> {
  if (isAuthDevBypass()) {
    return {
      user: {
        id: "dev-user",
        email: "dev@seo-ai.local",
        name: "Dev User",
      },
    };
  }

  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}
