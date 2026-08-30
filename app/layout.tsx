import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "../components/theme-provider";
import { StartupLoader } from "../components/brand/startup-loader";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "VranceFlex — From product idea to verified pipeline.",
  description:
    "Start with a website or product idea. VranceFlex researches the market, verifies buyers and prepares personalized B2B outreach with human approval.",
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
