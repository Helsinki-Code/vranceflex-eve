import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicContentPage } from "@/components/public-content-page";
import { findPublicPage, productPages } from "@/lib/seo/public-content";

export function generateStaticParams() { return productPages.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = findPublicPage(productPages, (await params).slug);
  if (!page) return {};
  const url = `/product/${page.slug}`;
  return { title: `${page.title} | VranceFlex`, description: page.description, alternates: { canonical: url }, openGraph: { url, title: page.title, description: page.description } };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = findPublicPage(productPages, (await params).slug);
  if (!page) notFound();
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Product", href: "/product" }, { label: page.title }]} />;
}
