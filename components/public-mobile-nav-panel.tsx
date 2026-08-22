"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const links = [
  { label: "Agents", href: "/#agents" },
  { label: "Workflow", href: "/#workflow" },
  { label: "Trust", href: "/#trust" },
  { label: "Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
] as const;

export default function PublicMobileNavPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader><SheetTitle>VranceFlex</SheetTitle><SheetDescription>Product navigation</SheetDescription></SheetHeader>
        <div className="public-mobile-nav">
          {links.map((item) => <Link href={item.href} prefetch={false} key={item.href} onClick={() => onOpenChange(false)}>{item.label}</Link>)}
          <Link href="/sign-in" prefetch={false} onClick={() => onOpenChange(false)}>Sign in</Link>
          <Button asChild><Link href="/campaigns/new" prefetch={false}>Start a campaign</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
