import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/feedback/toaster";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const calSans = localFont({
  src: "../../font/CalSans-SemiBold.woff2",
  variable: "--font-cal-sans",
  weight: "600",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "seogeoaeo.ai | SEO and AI visibility with Claudia",
  description:
    "Claudia audits your search and AI visibility, prepares site fixes, researches useful topics, and writes content in your brand voice.",
  metadataBase: new URL("https://seogeoaeo.ai"),
  // Favicon / app icons are generated from the file-based conventions in
  // src/app (favicon.ico, icon0.svg, icon1.png, apple-icon.png).
  openGraph: {
    title: "seogeoaeo.ai | SEO and AI visibility with Claudia",
    description: "Claudia audits your search and AI visibility, prepares fixes, and writes content in your brand voice.",
    url: "https://seogeoaeo.ai",
    siteName: "seogeoaeo.ai",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Claudia's SEO and AI visibility workspace on seogeoaeo.ai",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "seogeoaeo.ai | SEO and AI visibility with Claudia",
    description: "Claudia audits your search and AI visibility, prepares fixes, and writes content in your brand voice.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light glass-light">
      <head>
        <meta name="apple-mobile-web-app-title" content="SeoGeoAeo AI" />
      </head>
      <body
        className={`${geist.variable} ${calSans.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
