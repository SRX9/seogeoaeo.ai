import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/feedback/toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "seogeoaeo.ai — Autonomous SEO, GEO & AEO on autopilot",
  description:
    "Supercharge your search presence with autonomous SEO, GEO, and AEO. Research high-intent topics, generate search-optimized articles, and publish automatically to dev.to, Ghost, Hashnode, WordPress, and more.",
  metadataBase: new URL("https://seogeoaeo.ai"),
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico" }
    ],
    apple: "/favicon.png",
  },
  openGraph: {
    title: "seogeoaeo.ai — Autonomous SEO, GEO & AEO on autopilot",
    description: "Supercharge your search presence with autonomous SEO, GEO, and AEO.",
    url: "https://seogeoaeo.ai",
    siteName: "seogeoaeo.ai",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "seogeoaeo.ai (SGA) — Autonomous SEO, GEO & AEO Platform",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "seogeoaeo.ai — Autonomous SEO, GEO & AEO on autopilot",
    description: "Supercharge your search presence with autonomous SEO, GEO, and AEO.",
    images: ["/og-image.png"],
  },
};

// Runs before paint to set the Glass theme classes from the saved preference
// (or the OS setting), avoiding a light/dark flash on load.
// We apply BOTH the base mode class (`light`/`dark` — supplies the foreground
// text palette) and the Glass mode class (`glass-*` — refines surfaces); the
// Glass theme deliberately omits `--foreground`, so the base class is required.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var e=document.documentElement;e.classList.remove("light","dark","glass-light","glass-dark");e.classList.add(t,t==="dark"?"glass-dark":"glass-light");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light glass-light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
