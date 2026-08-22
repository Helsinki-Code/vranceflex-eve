"use client";

import { Menu } from "lucide-react";
import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";

type PanelProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function PublicMobileNavTrigger() {
  const [open, setOpen] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);

  async function showMenu() {
    if (!Panel) {
      const module = await import("./public-mobile-nav-panel");
      setPanel(() => module.default);
    }
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" size="icon" aria-label="Open navigation" onClick={showMenu}><Menu /></Button>
      {open && Panel ? <Panel open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
