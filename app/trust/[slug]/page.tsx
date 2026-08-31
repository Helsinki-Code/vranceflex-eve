import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicContentPage } from "@/components/public-content-page";
import { findPublicPage, trustPages } from "@/lib/seo/public-content";

export function generateStaticParams() { return trustPages.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = findPublicPage(trustPages, (await params).slug);
  if (!page) return {};
  const url = `/trust/${page.slug}`;
  return { title: `${page.title} | VranceFlex`, description: page.description, alternates: { canonical: url }, openGraph: { url, title: page.title, description: page.description } };
}

export default async function TrustDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = findPublicPage(trustPages, (await params).slug);
  if (!page) notFound();
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Trust", href: "/trust" }, { label: page.title }]} />;
}
