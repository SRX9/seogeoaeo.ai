"use client";

import { Card, toast } from "@heroui/react";
import Link from "next/link";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { getErrorMessage } from "@/lib/api/fetcher";
import { authClient } from "@/lib/auth/client";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
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
        <Card.Footer className="justify-center">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Back to home
          </Link>
        </Card.Footer>
      </Card>
    </div>
  );
}
