import type { Metadata } from "next";
import { PricingWorkload } from "@/components/marketing/pricing-workload";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Plans for Claudia | seogeoaeo.ai",
  description:
    "Every paid plan includes the same Claudia. Choose monthly work capacity for research, writing, audits, prepared fixes, and follow-up.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingPage() {
  return <PricingWorkload />;
}
