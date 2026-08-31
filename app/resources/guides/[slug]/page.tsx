import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicContentPage } from "@/components/public-content-page";
import { findPublicPage, guidePages } from "@/lib/seo/public-content";

export function generateStaticParams() { return guidePages.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = findPublicPage(guidePages, (await params).slug);
  if (!page) return {};
  const url = `/resources/guides/${page.slug}`;
  return { title: `${page.title} | VranceFlex`, description: page.description, alternates: { canonical: url }, openGraph: { type: "article", url, title: page.title, description: page.description } };
}

export default async function GuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = findPublicPage(guidePages, (await params).slug);
  if (!page) notFound();
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Resources", href: "/resources" }, { label: "Guides", href: "/resources/guides" }, { label: page.title }]} />;
}
