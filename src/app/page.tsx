import { Hero, Pricing } from "@/components/marketing/landing-sections";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <div>
      <SiteHeader />
      <Hero />
      <Pricing />
      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-muted">
        © {new Date().getFullYear()} seogeoaeo.ai
      </footer>
    </div>
  );
}
