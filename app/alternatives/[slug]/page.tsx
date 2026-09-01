import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompetitorAlternativePage } from "@/components/competitor-alternative-page";
import { CompetitorAlternativesPage } from "@/components/competitor-alternatives-page";
import { alternativesProfileFromSlug, alternativesSlugFor, competitorProfiles, findCompetitorProfile } from "@/lib/competitors/data";

export function generateStaticParams() {
  return competitorProfiles.flatMap((profile) => [
    { slug: profile.slug },
    { slug: alternativesSlugFor(profile) },
  ]);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const profile = findCompetitorProfile(slug);
  const pluralProfile = alternativesProfileFromSlug(slug);
  if (pluralProfile) {
    const url = `/alternatives/${slug}`;
    const title = `${pluralProfile.name} alternatives: 5 credible options compared`;
    const description = `Compare five ${pluralProfile.name} alternatives across research, contact data, sequencing, delivery, approval, scheduling, pricing model, and best-fit use cases.`;
    return { title, description, alternates: { canonical: url }, openGraph: { url, title, description } };
  }
  if (!profile) return {};
  const url = `/alternatives/${profile.slug}`;
  const title = `${profile.name} alternative for approval-led B2B outreach`;
  const description = `Evaluate VranceFlex as a ${profile.name} alternative, including workflow differences, pricing model, honest limitations, best-fit teams, and migration boundaries.`;
  return { title, description, alternates: { canonical: url }, openGraph: { url, title, description } };
}

export default async function AlternativeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const pluralProfile = alternativesProfileFromSlug(slug);
  if (pluralProfile) return <CompetitorAlternativesPage competitor={pluralProfile} />;
  const profile = findCompetitorProfile(slug);
  if (!profile) notFound();
  return <CompetitorAlternativePage competitor={profile} />;
}
