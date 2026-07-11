import type { Metadata } from "next";
import {
  ContentEmployee,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
  Publish,
  TrustBar,
} from "@/components/marketing/landing-sections";
import { QuickCheck } from "@/components/marketing/quick-check";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "seogeoaeo.ai: Hire Claudia for SEO, AEO & GEO",
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
};

export default function HomePage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <Hero />
        <QuickCheck />
        <TrustBar />
        <Features />
        <HowItWorks />
        <ContentEmployee />
        <Publish />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
