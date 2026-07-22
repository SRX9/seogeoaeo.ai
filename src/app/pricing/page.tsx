import type { Metadata } from "next";
import { PricingWorkload } from "@/components/marketing/pricing-workload";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Put Claudia, your AI employee for organic growth, to work. Choose monthly capacity for research, writing, audits, fixes, and follow-up.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingPage() {
  return <PricingWorkload />;
}
