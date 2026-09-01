import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";

const featureSchema = z.object({
  research: z.string(),
  contactData: z.string(),
  sequencing: z.string(),
  delivery: z.string(),
  approval: z.string(),
  scheduling: z.string(),
  integrations: z.string(),
});

const pricingSchema = z.object({
  model: z.string(),
  summary: z.string(),
  entry: z.string(),
  enterprise: z.string(),
  freeTier: z.string(),
  source: z.string().url(),
});

const sourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const profileSchema = z.object({
  slug: z.string(),
  name: z.string(),
  website: z.string().url(),
  category: z.string(),
  positioning: z.string(),
  targetAudience: z.string(),
  pricing: pricingSchema,
  features: featureSchema,
  strengths: z.array(z.string()).min(3),
  tradeoffs: z.array(z.string()).min(3),
  bestFor: z.array(z.string()).min(3),
  notIdealFor: z.array(z.string()).min(2),
  migration: z.object({
    transfers: z.array(z.string()).min(1),
    reconfigure: z.array(z.string()).min(1),
    note: z.string(),
  }),
  sources: z.array(sourceSchema).min(1),
});

const competitorDataSchema = z.object({
  lastReviewed: z.string(),
  methodology: z.string(),
  profiles: z.array(profileSchema).min(2),
  pairComparisons: z.array(z.object({
    slug: z.string(),
    left: z.string(),
    right: z.string(),
    summary: z.string(),
  })),
});

export type CompetitorProfile = z.infer<typeof profileSchema>;
export type PairComparison = z.infer<typeof competitorDataSchema>["pairComparisons"][number];
export type CompetitorFeatureKey = keyof CompetitorProfile["features"];

const dataPath = join(process.cwd(), "content", "competitors", "profiles.yaml");
const parsed = competitorDataSchema.parse(load(readFileSync(dataPath, "utf8")));

export const competitorMethodology = parsed.methodology;
export const competitorLastReviewed = parsed.lastReviewed;
export const allProductProfiles = parsed.profiles;
export const vranceFlexProfile = parsed.profiles.find(({ slug }) => slug === "vranceflex")!;
export const competitorProfiles = parsed.profiles.filter(({ slug }) => slug !== "vranceflex");
export const pairComparisons = parsed.pairComparisons;

export const comparisonFeatureRows: Array<{ key: CompetitorFeatureKey; label: string }> = [
  { key: "research", label: "Research and ICP" },
  { key: "contactData", label: "Contact data" },
  { key: "sequencing", label: "Sequence preparation" },
  { key: "delivery", label: "Delivery model" },
  { key: "approval", label: "Human approval" },
  { key: "scheduling", label: "Scheduling" },
  { key: "integrations", label: "Integration scope" },
];

export function findProductProfile(slug: string) {
  return allProductProfiles.find((profile) => profile.slug === slug);
}

export function findCompetitorProfile(slug: string) {
  return competitorProfiles.find((profile) => profile.slug === slug);
}

export function findPairComparison(slug: string) {
  return pairComparisons.find((comparison) => comparison.slug === slug);
}

export function comparisonSlugFor(profile: CompetitorProfile) {
  return `vranceflex-vs-${profile.slug}`;
}

export function comparisonProfileFromSlug(slug: string) {
  const competitorSlug = slug.startsWith("vranceflex-vs-")
    ? slug.slice("vranceflex-vs-".length)
    : "";
  return findCompetitorProfile(competitorSlug);
}

export function alternativesSlugFor(profile: CompetitorProfile) {
  return `${profile.slug}-alternatives`;
}

export function alternativesProfileFromSlug(slug: string) {
  const competitorSlug = slug.endsWith("-alternatives")
    ? slug.slice(0, -"-alternatives".length)
    : "";
  return findCompetitorProfile(competitorSlug);
}
