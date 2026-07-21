import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to seogeoaeo.ai to set up your brand, audit your visibility across search " +
    "and AI, and publish optimized content automatically.",
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  // Already signed in: there's nothing to do here; the app layout routes
  // brand-less users on to onboarding from the dashboard.
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const { callbackURL } = await searchParams;
  const safeCallbackURL = callbackURL === "/contact" ? "/contact" : "/dashboard";

  return <LoginForm callbackURL={safeCallbackURL} />;
}
