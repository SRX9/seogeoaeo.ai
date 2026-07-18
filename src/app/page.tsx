import type { Metadata } from "next";
import {
  ContentEmployee,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
} from "@/components/marketing/landing-sections";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Claudia: Your Organic Growth Operator | seogeoaeo.ai",
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
};

export default function HomePage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <ContentEmployee />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
