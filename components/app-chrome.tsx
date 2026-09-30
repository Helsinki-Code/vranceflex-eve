"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, Check, ChevronsUpDown, CreditCard, LoaderCircle, LogOut, Mail, Menu, MessageSquareText, Plus, Search, Settings2, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "./motion/theme-toggle";
import { BrandLockup } from "./brand/vranceflex-logo";
import { ProductMotion } from "./product/motion";

export type ShellAccount = { workspace: string; workspaceId: string; role: string; name: string; email: string; demo: boolean; workspaces: Array<{ id: string; name: string; role: string }>; workspaceSlots?: { used: number; limit: number } | null };
export type ShellPlan = { name: string | null; active: boolean; status: string; available: number; included: number };

const links = [
  { label: "Campaigns", href: "/dashboard", icon: BarChart3, match: ["/dashboard", "/campaigns"] },
  { label: "Leads", href: "/leads", icon: Users, match: ["/leads"] },
  { label: "ICP report", href: "/icp", icon: Target, match: ["/icp"] },
  { label: "Replies", href: "/replies", icon: MessageSquareText, match: ["/replies"] },
  { label: "Settings", href: "/settings", icon: Settings2, match: ["/settings"] },
] as const;

function isActive(pathname: string, match: readonly string[]) {
  return match.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

function NavLinks({ onNavigate, layoutId }: { onNavigate?: () => void; layoutId: string }) {
  const pathname = usePathname();
  return <nav className="grid gap-0.5" aria-label="Application">{links.map(({ label, href, icon: Icon, match }, index) => {
    const active = isActive(pathname, match);
    return <Link aria-current={active ? "page" : undefined} href={href} key={href} onClick={onNavigate}
      className={cn("group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
      {active ? <motion.span layoutId={layoutId} className="absolute inset-0 rounded-md border border-border bg-card" transition={{ type: "spring", stiffness: 520, damping: 42 }} /> : null}
      {active ? <motion.span layoutId={`${layoutId}-bar`} className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary" transition={{ type: "spring", stiffness: 520, damping: 42 }} /> : null}
      <Icon aria-hidden="true" className="relative size-4 shrink-0" />
      <span className="relative flex-1">{label}</span>
      <PendingDot />
      <kbd className="relative hidden font-mono text-[10px] text-muted-foreground/60 group-hover:inline">⌘{index + 1}</kbd>
    </Link>;
  })}</nav>;
}

function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden="true" className="relative size-1.5 animate-pulse rounded-full bg-primary" /> : null;
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function PlanCard({ plan }: { plan: ShellPlan | null }) {
  if (!plan) {
    return <Link href="/settings/billing" className="block rounded-md border border-border bg-card p-3 text-xs transition-colors hover:border-input">
      <span className="flex items-center gap-2 font-medium text-foreground"><CreditCard className="size-3.5" />Plans & credits</span>
      <span className="mt-1 block text-muted-foreground">Compare plans and usage</span>
    </Link>;
  }
  const percent = plan.included ? Math.min(100, Math.round((Math.min(plan.available, plan.included) / plan.included) * 100)) : 0;
  const warning = plan.status === "past_due";
  return <Link href="/settings/billing" className="block rounded-md border border-border bg-card p-3 text-xs transition-colors hover:border-input">
    <span className="flex items-center justify-between gap-2">
      <span className="font-medium text-foreground">{plan.active ? plan.name : "No active plan"}</span>
      {warning ? <span className="text-warning">Payment due</span> : plan.active ? <span className="text-muted-foreground">Plan</span> : <span className="text-primary">Choose plan</span>}
    </span>
    {plan.active ? <>
      <span className="mt-2 flex items-baseline justify-between font-mono tabular-nums"><span className="text-base text-foreground">{plan.available.toLocaleString()}</span><span className="text-muted-foreground">credits</span></span>
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.6 }} /></span>
    </> : <span className="mt-1 block text-muted-foreground">Research is paused until a plan is active.</span>}
  </Link>;
}

function AccountBlock({ account }: { account: ShellAccount }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.push("/sign-in"); router.refresh(); }
  };
  return <div className="flex items-center gap-2.5 border-t border-rule pt-3">
    <Link href="/settings/account" aria-label="Account settings" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-[11px] font-medium text-primary">{initials(account.name)}</Link>
    <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-sm text-foreground">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{account.email}</span></span>
    {account.demo ? null : <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8 min-h-8 text-muted-foreground" aria-label="Sign out" disabled={busy} onClick={() => void signOut()}><LogOut /></Button></TooltipTrigger><TooltipContent>Sign out</TooltipContent></Tooltip>}
  </div>;
}

function WorkspaceBadge({ name }: { name: string }) {
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground font-mono text-xs font-semibold text-background">{initials(name)}</span>;
}

function NewWorkspaceDialog({ open, onOpenChange, slots, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; slots: { used: number; limit: number }; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = (await response.json()) as { error?: string; name?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't create the workspace.");
      toast.success(`${data.name ?? "Workspace"} created.`);
      setName("");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the workspace.");
    } finally {
      setBusy(false);
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>A separate space for a client or team, with its own campaigns, leads and delivery accounts. It shares this plan&apos;s credits and limits. {slots.used} of {slots.limit} workspaces in use.</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm font-medium">Name<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme (client)" minLength={2} maxLength={120} required /></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? <LoaderCircle className="animate-spin" /> : null}Create workspace</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function WorkspaceSwitcher({ account, onNavigate }: { account: ShellAccount; onNavigate?: () => void }) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const slots = account.workspaceSlots ?? null;
  const canCreate = Boolean(slots && slots.used < slots.limit && account.role === "admin");
  const label = <><WorkspaceBadge name={account.workspace} /><span className="min-w-0 flex-1 text-left leading-tight"><span className="block truncate text-sm font-medium text-foreground">{account.workspace}</span><span className="block truncate text-xs capitalize text-muted-foreground">{account.role}</span></span></>;
  if (account.workspaces.length <= 1 && !canCreate) {
    return <Link href="/settings/team" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60">{label}</Link>;
  }
  const afterChange = () => { onNavigate?.(); router.push("/dashboard"); router.refresh(); };
  const switchTo = async (organizationId: string) => {
    if (organizationId === account.workspaceId) return;
    setSwitching(organizationId);
    try {
      const response = await fetch("/api/auth/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't switch workspace.");
      afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't switch workspace.");
    } finally {
      setSwitching(null);
    }
  };
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-normal text-muted-foreground">Workspaces{slots ? <span className="font-mono">{slots.used}/{slots.limit}</span> : null}</DropdownMenuLabel>
        {account.workspaces.map((workspace) => <DropdownMenuItem key={workspace.id} onSelect={() => void switchTo(workspace.id)} className="gap-2.5">
          <WorkspaceBadge name={workspace.name} />
          <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-sm">{workspace.name}</span><span className="block text-xs capitalize text-muted-foreground">{workspace.role}</span></span>
          {switching === workspace.id ? <LoaderCircle className="size-3.5 animate-spin" /> : workspace.id === account.workspaceId ? <Check className="size-3.5 text-primary" /> : null}
        </DropdownMenuItem>)}
        <DropdownMenuSeparator />
        {canCreate ? <DropdownMenuItem onSelect={() => setCreating(true)}><Plus className="size-3.5" />New workspace</DropdownMenuItem> : null}
        <DropdownMenuItem asChild><Link href="/settings/team" onClick={onNavigate}><Users className="size-3.5" />Team & roles</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {canCreate && slots ? <NewWorkspaceDialog open={creating} onOpenChange={setCreating} slots={slots} onCreated={afterChange} /> : null}
  </>;
}

function SidebarBody({ account, plan, onNavigate, onSearch, layoutId }: { account: ShellAccount; plan: ShellPlan | null; onNavigate?: () => void; onSearch: () => void; layoutId: string }) {
  return <div className="flex h-full flex-col gap-5">
    <WorkspaceSwitcher account={account} onNavigate={onNavigate} />
    <button onClick={onSearch} type="button" className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground">
      <Search className="size-4" /><span className="flex-1 text-left">Search</span><kbd className="font-mono text-[10px]">⌘K</kbd>
    </button>
    <NavLinks onNavigate={onNavigate} layoutId={layoutId} />
    <div className="mt-auto grid gap-3">
      <PlanCard plan={plan} />
      <AccountBlock account={account} />
    </div>
  </div>;
}

export function AppChrome({ children, title, eyebrow, description, actions, account, plan }: { children: ReactNode; title: string; eyebrow: string; description?: ReactNode; actions?: ReactNode; account: ShellAccount; plan: ShellPlan | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") { event.preventDefault(); setCommandOpen((value) => !value); return; }
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const index = Number(key) - 1;
      if (index >= 0 && index < links.length) { event.preventDefault(); router.push(links[index].href); }
      // ⌘⇧N so the browser's own ⌘N (new window) keeps working.
      if (key === "n" && event.shiftKey) { event.preventDefault(); router.push("/campaigns/new"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const navigate = (href: string) => { setCommandOpen(false); router.push(href); };
  const meta = eyebrow.toLowerCase();

  return <TooltipProvider delayDuration={300}>
    <ProductMotion>
      <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule px-3 py-5 lg:flex">
          <Link className="px-1.5 [&_svg]:h-6 [&_svg]:w-auto" href="/" aria-label="VranceFlex home"><BrandLockup /></Link>
          <SidebarBody account={account} plan={plan} onSearch={() => setCommandOpen(true)} layoutId="nav-desktop" />
        </aside>

        <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-background/95 px-3 backdrop-blur-sm lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-9 min-h-9" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="sr-only"><SheetTitle>VranceFlex</SheetTitle><SheetDescription>Workspace navigation</SheetDescription></SheetHeader>
              <SidebarBody account={account} plan={plan} onNavigate={() => setMobileOpen(false)} onSearch={() => { setMobileOpen(false); setCommandOpen(true); }} layoutId="nav-mobile" />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate font-mono text-[11px] text-muted-foreground">{meta}</p><p className="truncate text-sm font-semibold">{title}</p></div>
          <ThemeToggle className="size-9" />
        </div>

        <main className="min-w-0">
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-rule bg-background/90 px-8 backdrop-blur-sm lg:flex">
            <p className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground"><span className="truncate">{meta}</span><span aria-hidden="true">/</span><span className="truncate text-foreground">{title.toLowerCase()}</span></p>
            <div className="flex items-center gap-1.5">
              <Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon" className="size-9 min-h-9 text-muted-foreground"><Link href="/resources/guides" aria-label="Guides"><BookOpen /></Link></Button></TooltipTrigger><TooltipContent>Guides</TooltipContent></Tooltip>
              <ThemeToggle className="size-9 border-transparent bg-transparent" />
              <Button asChild size="sm" className="ml-1"><Link href="/campaigns/new"><Plus />New campaign</Link></Button>
            </div>
          </header>
          <motion.section key={pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="mx-auto w-full max-w-[76rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
                {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </motion.section>
        </main>

        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Jump to a page or action…" />
          <CommandList>
            <CommandEmpty>No matching page or action.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {links.map(({ label, href, icon: Icon }, index) => <CommandItem key={href} onSelect={() => navigate(href)}><Icon />{label}<CommandShortcut>⌘{index + 1}</CommandShortcut></CommandItem>)}
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => navigate("/campaigns/new")}><Plus />New campaign<CommandShortcut>⌘⇧N</CommandShortcut></CommandItem>
              <CommandItem onSelect={() => navigate("/settings/billing")}><CreditCard />Plans & credits</CommandItem>
              <CommandItem onSelect={() => navigate("/settings/team")}><Users />Invite teammates</CommandItem>
              <CommandItem onSelect={() => navigate("/settings/sending")}><Mail />Connect a sending mailbox</CommandItem>
              <CommandItem onSelect={() => navigate("/settings/integrations")}><Settings2 />Connect Resend or Twilio</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
        <Toaster position="bottom-right" />
      </div>
    </ProductMotion>
  </TooltipProvider>;
}
