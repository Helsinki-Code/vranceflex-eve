import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "../components/theme-provider";
import { StartupLoader } from "../components/brand/startup-loader";
import { SITE_NAME, SITE_ORIGIN } from "../lib/seo/site";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: "VranceFlex — From product idea to verified pipeline.",
  description:
    "Start with a website or product idea. VranceFlex researches the market, verifies buyers and prepares personalized B2B outreach with human approval.",
  category: "business software",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: SITE_NAME,
    title: "VranceFlex — From product idea to verified pipeline.",
    description:
      "Agent-led B2B research, verified prospects and human-approved outreach through your own delivery providers.",
  },
  twitter: {
    card: "summary",
    title: "VranceFlex — From product idea to verified pipeline.",
    description:
      "Agent-led B2B research, verified prospects and human-approved outreach through your own delivery providers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", GeistSans.variable, GeistMono.variable)}
    >
      <body>
        <ThemeProvider>
          <StartupLoader />
          <noscript><style>{`.vf-startup-overlay{display:none!important}`}</style></noscript>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
