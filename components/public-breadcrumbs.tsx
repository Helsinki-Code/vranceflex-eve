import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { absoluteSiteUrl } from "@/lib/seo/site";
import { SeoJsonLd } from "@/components/seo-json-ld";

export type BreadcrumbItem = { label: string; href?: string };

export function PublicBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const allItems = [{ label: "Home", href: "/" }, ...items];

  return (
    <>
      <nav className="public-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {allItems.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              {index > 0 ? <ChevronRight aria-hidden="true" size={14} /> : null}
              {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <SeoJsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: allItems.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.label,
            item: absoluteSiteUrl(item.href ?? ""),
          })),
        }}
      />
    </>
  );
}
