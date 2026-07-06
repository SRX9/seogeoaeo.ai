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

export async function getSession(): Promise<Session | null> {
  if (process.env.AUTH_DEV_BYPASS === "true") {
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
