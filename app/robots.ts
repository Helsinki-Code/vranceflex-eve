import type { MetadataRoute } from "next";
import { absoluteSiteUrl, SITE_ORIGIN } from "../lib/seo/site";

const PRIVATE_PATHS = [
  "/api/",
  "/campaigns",
  "/dashboard",
  "/forgot-password",
  "/icp",
  "/invites",
  "/leads",
  "/replies",
  "/session-tasks",
  "/settings",
  "/sign-in",
  "/sign-up",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATHS],
      },
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "PerplexityBot",
        ],
        allow: "/",
        disallow: [...PRIVATE_PATHS],
      },
      {
        userAgent: ["CCBot", "anthropic-ai", "Bytespider", "cohere-ai"],
        disallow: "/",
      },
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: SITE_ORIGIN,
  };
}
