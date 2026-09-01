"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const links = [
  { label: "Product", href: "/product" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/compare" },
  { label: "Resources", href: "/resources" },
  { label: "Demo", href: "/demo" },
] as const;

export default function PublicMobileNavPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader><SheetTitle>VranceFlex</SheetTitle><SheetDescription>Product navigation</SheetDescription></SheetHeader>
        <div className="public-mobile-nav">
          {links.map((item) => <Link href={item.href} prefetch={false} key={item.href} onClick={() => onOpenChange(false)}>{item.label}</Link>)}
          <Link href="/sign-in" prefetch={false} onClick={() => onOpenChange(false)}>Sign in</Link>
          <Button asChild><Link href="/sign-up" prefetch={false}>Start a campaign</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
