"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Bell, CircleHelp, Command as CommandIcon, CreditCard, Menu, MessageSquareText, Search, Settings2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "./motion/theme-toggle";

const links = [
  { label: "Campaigns", href: "/dashboard", icon: BarChart3 },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Replies", href: "/replies", icon: MessageSquareText },
  { label: "Settings", href: "/settings", icon: Settings2 },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <nav className="app-nav" aria-label="Application">{links.map(({ label, href, icon: Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return <Link aria-current={active ? "page" : undefined} className={cn(active && "active")} href={href} key={href} onClick={onNavigate}><Icon aria-hidden="true" /><span>{label}</span></Link>;
  })}</nav>;
}

export function AppChrome({ children, title, eyebrow, account }: { children: ReactNode; title: string; eyebrow: string; account: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const navigate = (href: string) => { setCommandOpen(false); router.push(href); };

  return <TooltipProvider delayDuration={300}>
    <div className="product-app">
      <aside className="app-sidebar">
        <Link className="brand" href="/" aria-label="VranceFlex home"><span className="brand-mark">VF</span><span>VranceFlex</span></Link>
        <div className="workspace-switcher"><span className="workspace-avatar">V</span><span><strong>VranceFlex</strong><small>Workspace</small></span></div>
        <button className="app-command-trigger" onClick={() => setCommandOpen(true)} type="button"><Search /><span>Search</span><kbd>⌘K</kbd></button>
        <NavLinks />
        <div className="sidebar-plan"><span><CreditCard /><strong>Credits & plan</strong></span><small>View balance and usage</small><Link href="/settings/billing">Manage billing</Link></div>
        <div className="sidebar-account">{account}</div>
      </aside>
      <div className="mobile-app-header">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
          <SheetContent side="left" className="app-mobile-sheet"><SheetHeader><SheetTitle>VranceFlex</SheetTitle><SheetDescription>Workspace navigation</SheetDescription></SheetHeader><NavLinks onNavigate={() => setMobileOpen(false)} /><div className="mobile-sheet-account">{account}</div></SheetContent>
        </Sheet>
        <div className="mobile-page-title"><small>{eyebrow}</small><strong>{title}</strong></div>
        <ThemeToggle />
      </div>
      <main className="app-main">
        <header className="app-header"><div><span>{eyebrow}</span><h1>{title}</h1></div><div className="app-header-actions">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Help"><CircleHelp /></Button></TooltipTrigger><TooltipContent>Help center</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Notifications"><Bell /></Button></TooltipTrigger><TooltipContent>Notifications</TooltipContent></Tooltip>
          <ThemeToggle /><Button asChild><Link href="/campaigns/new">New campaign</Link></Button>
        </div></header>
        <section className="app-surface">{children}</section>
      </main>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}><CommandInput placeholder="Search campaigns, leads, replies, or settings…" /><CommandList><CommandEmpty>No matching page or action.</CommandEmpty><CommandGroup heading="Navigate">
        {links.map(({ label, href, icon: Icon }, index) => <CommandItem key={href} onSelect={() => navigate(href)}><Icon />{label}<CommandShortcut>⌘{index + 1}</CommandShortcut></CommandItem>)}
        <CommandItem onSelect={() => navigate("/campaigns/new")}><CommandIcon />New campaign<CommandShortcut>⌘N</CommandShortcut></CommandItem>
      </CommandGroup></CommandList></CommandDialog>
    </div>
  </TooltipProvider>;
}
