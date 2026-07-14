import type { Metadata } from "next";
import { PricingWorkload } from "@/components/marketing/pricing-workload";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Plans for Claudia | seogeoaeo.ai",
  description:
    "Choose a monthly workload for Claudia. Plans cover research, writing, audits, prepared site fixes, and weekly reporting.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingPage() {
  return <PricingWorkload />;
}
