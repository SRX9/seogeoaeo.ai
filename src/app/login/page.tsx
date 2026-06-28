import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in — seogeoaeo.ai",
  description:
    "Sign in to seogeoaeo.ai to set up your brand, audit your visibility across search " +
    "and AI, and publish optimized content automatically.",
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginForm />;
}
