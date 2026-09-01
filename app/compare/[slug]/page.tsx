import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompetitorPairPage } from "@/components/competitor-pair-page";
import { CompetitorVsPage } from "@/components/competitor-vs-page";
import { comparisonProfileFromSlug, comparisonSlugFor, competitorProfiles, findPairComparison, findProductProfile, pairComparisons } from "@/lib/competitors/data";

export function generateStaticParams() {
  return [
    ...competitorProfiles.map((profile) => ({ slug: comparisonSlugFor(profile) })),
    ...pairComparisons.map(({ slug }) => ({ slug })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const competitor = comparisonProfileFromSlug(slug);
  if (competitor) {
    const url = `/compare/${slug}`;
    const title = `VranceFlex vs ${competitor.name}: honest B2B outreach comparison`;
    const description = `Compare VranceFlex and ${competitor.name} across research, contact data, sequencing, delivery, approval, scheduling, integrations, pricing, and best-fit teams.`;
    return { title, description, alternates: { canonical: url }, openGraph: { url, title, description } };
  }
  const pair = findPairComparison(slug);
  if (!pair) return {};
  const left = findProductProfile(pair.left)!;
  const right = findProductProfile(pair.right)!;
  const url = `/compare/${slug}`;
  const title = `${left.name} vs ${right.name}: features, pricing model, and best fit`;
  return { title, description: pair.summary, alternates: { canonical: url }, openGraph: { url, title, description: pair.summary } };
}

export default async function ComparisonDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const competitor = comparisonProfileFromSlug(slug);
  if (competitor) return <CompetitorVsPage competitor={competitor} />;
  const comparison = findPairComparison(slug);
  if (!comparison) notFound();
  const left = findProductProfile(comparison.left);
  const right = findProductProfile(comparison.right);
  if (!left || !right) notFound();
  return <CompetitorPairPage comparison={comparison} left={left} right={right} />;
}
