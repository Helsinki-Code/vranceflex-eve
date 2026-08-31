import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "../lib/seo/site";
import {
  guidePages,
  integrationPages,
  productPages,
  solutionPages,
  trustPages,
} from "../lib/seo/public-content";

const INDEXABLE_PUBLIC_PATHS = [
  "/",
  "/product",
  ...productPages.map(({ slug }) => `/product/${slug}`),
  "/solutions",
  ...solutionPages.map(({ slug }) => `/solutions/${slug}`),
  "/integrations",
  ...integrationPages.map(({ slug }) => `/integrations/${slug}`),
  "/pricing",
  "/demo",
  "/resources",
  "/resources/guides",
  ...guidePages.map(({ slug }) => `/resources/guides/${slug}`),
  "/resources/glossary",
  "/trust",
  "/security",
  ...trustPages.map(({ slug }) => `/trust/${slug}`),
  "/company",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PUBLIC_PATHS.map((path) => ({
    url: absoluteSiteUrl(path),
  }));
}
