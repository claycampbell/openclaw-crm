import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme-provider";
import { PlausibleScript } from "@/components/analytics/plausible-script";
import { GA4Script } from "@/components/analytics/ga4-script";
import { AmplitudeScript } from "@/components/analytics/amplitude-script";
import { CookieConsent } from "@/components/analytics/cookie-consent";
import { Toaster } from "@/components/ui/sonner";
import { baseUrl } from "@/lib/base-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Aria",
    template: "%s | Aria",
  },
  description:
    "The CRM your AI agent already knows how to use. Open-source, self-hosted, with native Aria Bot integration.",
  metadataBase: new URL(baseUrl),
  openGraph: {
    title: "Aria",
    description:
      "The CRM your AI agent already knows how to use. Open-source, self-hosted, with native Aria Bot integration.",
    siteName: "Aria",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aria",
    description:
      "The CRM your AI agent already knows how to use. Open-source, self-hosted, with native Aria Bot integration.",
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${GeistSans.variable} font-sans`}>
        <PlausibleScript />
        <GA4Script />
        <AmplitudeScript />
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
        <CookieConsent />
      </body>
    </html>
  );
}
