"use client";

import { Card, toast } from "@heroui/react";
import Link from "next/link";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { getErrorMessage } from "@/lib/api/fetcher";
import { authClient } from "@/lib/auth/client";
import { CircleCheckIcon, SgaLogo } from "@/components/icons";

const valueProps = [
  "Audit your visibility across SEO, AEO & GEO",
  "Generate brand-tuned, search-optimized articles",
  "Publish to dev.to, WordPress, Ghost & Hashnode",
  "Start free — no credit card required",
];

export function LoginForm() {
  const [loading, setLoading] = useState<"google" | "github" | null>(null);

  async function signIn(provider: "google" | "github") {
    setLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        // Land in the app. The dashboard sends brand-less new users to onboarding.
        callbackURL: "/dashboard",
      });
    } catch (error) {
      setLoading(null);
      toast.danger(getErrorMessage(error, "Sign in failed. Please try again."));
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand / value panel — hidden on small screens */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-surface/40 p-12 lg:flex">
        <Link href="/" aria-label="seogeoaeo.ai home">
          <SgaLogo />
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Get found across search and AI.
          </h2>
          <p className="mt-3 text-muted">
            Set up your brand once, and your content employee handles the rest — measuring,
            writing, and publishing on autopilot.
          </p>
          <ul className="mt-8 space-y-3">
            {valueProps.map((prop) => (
              <li key={prop} className="flex items-start gap-3 text-sm text-foreground/90">
                <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
                {prop}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted">© {new Date().getFullYear()} seogeoaeo.ai</p>
      </aside>

      {/* Sign-in panel */}
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/" aria-label="seogeoaeo.ai home">
              <SgaLogo />
            </Link>
          </div>

          <Card className="w-full">
            <Card.Header>
              <Card.Title>Sign in to seogeoaeo.ai</Card.Title>
              <Card.Description>
                Use Google or GitHub to create your workspace and set up your first brand.
              </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col gap-3">
              <LoadingButton
                fullWidth
                isPending={loading === "google"}
                isDisabled={loading !== null}
                onPress={() => signIn("google")}
              >
                Continue with Google
              </LoadingButton>
              <LoadingButton
                fullWidth
                variant="secondary"
                isPending={loading === "github"}
                isDisabled={loading !== null}
                onPress={() => signIn("github")}
              >
                Continue with GitHub
              </LoadingButton>
            </Card.Content>
            <Card.Footer className="flex-col items-center gap-3">
              <p className="text-center text-xs text-muted">
                By continuing you agree to our{" "}
                <Link href="/terms" className="text-foreground/80 hover:text-foreground">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-foreground/80 hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>
              <Link href="/" className="text-sm text-muted hover:text-foreground">
                ← Back to home
              </Link>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </div>
  );
}
