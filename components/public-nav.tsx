import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./motion/theme-toggle";
import { PublicMobileNavTrigger } from "./public-mobile-nav-trigger";
import { BrandLockup } from "./brand/vranceflex-logo";

const links = [
  { label: "Product", href: "/product" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "Demo", href: "/demo" },
] as const;

export function PublicNav({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  return <nav className="nav-shell" aria-label="Primary navigation">
    <Link className="brand" href="/" prefetch={false} aria-label="VranceFlex home"><BrandLockup /></Link>
    <div className="nav-links">{backHref ? <Link className="settings-back" href={backHref} prefetch={false}><ArrowLeft />{backLabel ?? "Back"}</Link> : <>{links.map((item) => <Link href={item.href} prefetch={false} key={item.href}>{item.label}</Link>)}<Link href="/sign-in" prefetch={false}>Sign in</Link></>}</div>
    <div className="nav-actions"><ThemeToggle /><Button asChild><Link href="/sign-up" prefetch={false}>Start a campaign <ArrowRight /></Link></Button></div>
    <div className="nav-mobile-actions"><ThemeToggle /><PublicMobileNavTrigger /></div>
  </nav>;
}
