import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicContentPage } from "@/components/public-content-page";
import { findPublicPage, integrationPages } from "@/lib/seo/public-content";

export function generateStaticParams() { return integrationPages.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = findPublicPage(integrationPages, (await params).slug);
  if (!page) return {};
  const url = `/integrations/${page.slug}`;
  return { title: `${page.title} | VranceFlex`, description: page.description, alternates: { canonical: url }, openGraph: { url, title: page.title, description: page.description } };
}

export default async function IntegrationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = findPublicPage(integrationPages, (await params).slug);
  if (!page) notFound();
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Integrations", href: "/integrations" }, { label: page.title }]} />;
}
