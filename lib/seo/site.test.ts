import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  resolveRobots,
  resolveSitemap,
} from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import middleware from "../../middleware";

describe("public search architecture", () => {
  it("publishes the completed canonical public architecture", () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);

    expect(paths).toEqual(expect.arrayContaining([
      "/",
      "/product",
      "/product/lead-verification",
      "/solutions/agencies",
      "/integrations/resend",
      "/pricing",
      "/demo",
      "/resources/guides/recurring-outreach",
      "/resources/glossary",
      "/trust/responsible-outreach",
      "/security",
      "/contact",
      "/privacy",
      "/terms",
    ]));
    expect(paths).not.toContain("/customers");
    expect(paths).not.toContain("/campaigns");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("references the sitemap and blocks private route families", () => {
    const policy = robots();
    const ruleGroups = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const rules = ruleGroups[0];

    expect(new URL(String(policy.sitemap)).pathname).toBe("/sitemap.xml");
    expect(rules?.disallow).toEqual(
      expect.arrayContaining([
        "/api/",
        "/campaigns",
        "/dashboard",
        "/settings",
        "/sign-in",
        "/sign-up",
      ]),
    );

    const aiSearchGroup = ruleGroups.find((group) =>
      Array.isArray(group?.userAgent) && group.userAgent.includes("OAI-SearchBot"),
    );
    const trainingGroup = ruleGroups.find((group) =>
      Array.isArray(group?.userAgent) && group.userAgent.includes("CCBot"),
    );

    expect(aiSearchGroup?.allow).toBe("/");
    expect(aiSearchGroup?.disallow).toContain("/campaigns");
    expect(trainingGroup?.disallow).toBe("/");
  });

  it("publishes AI-readable site guidance without exposing private routes", () => {
    const llms = readFileSync("public/llms.txt", "utf8");

    expect(llms).toContain("# VranceFlex");
    expect(llms).toContain("https://vranceflex.online/product/lead-verification");
    expect(llms).toContain("https://vranceflex.online/resources/guides/recurring-outreach");
    expect(llms).not.toContain("https://vranceflex.online/campaigns");
    expect(llms).not.toContain("https://vranceflex.online/settings");
  });

  it("adds an HTTP noindex directive to private and authentication pages", () => {
    const privateResponse = middleware(
      new NextRequest("https://vranceflex.online/sign-in"),
    );
    const publicResponse = middleware(
      new NextRequest("https://vranceflex.online/demo"),
    );

    expect(privateResponse.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(publicResponse.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("serializes valid minimal robots and sitemap documents", () => {
    const sitemapXml = resolveSitemap(sitemap());
    const robotsText = resolveRobots(robots());

    expect(sitemapXml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(sitemapXml.match(/<url>/g)).toHaveLength(sitemap().length);
    expect(sitemapXml).not.toContain("<priority>");
    expect(sitemapXml).not.toContain("<changefreq>");
    expect(robotsText).toContain("Sitemap:");
    expect(robotsText).toContain("Disallow: /campaigns");
  });
});
