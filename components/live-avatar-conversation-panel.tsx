"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type LiveAvatarConversationPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  safeEmbedUrl: string;
};

function AvatarConversation({ safeEmbedUrl }: { safeEmbedUrl: string }) {
  return (
    <div className="live-avatar-content">
      <div className="live-avatar-frame-shell">
        <iframe
          allow="microphone"
          referrerPolicy="strict-origin-when-cross-origin"
          src={safeEmbedUrl}
          title="VranceFlex LiveAvatar product guide"
        />
      </div>
      <div className="live-avatar-privacy">
        <ShieldCheck aria-hidden="true" />
        <p>
          Your microphone is used only after you start the conversation. Never share passwords,
          provider keys, or customer data.
        </p>
      </div>
      <div className="live-avatar-actions">
        <Button variant="outline" asChild><Link href="/demo">Explore the demo</Link></Button>
        <Button asChild><Link href="/pricing">View plans <ArrowRight /></Link></Button>
      </div>
    </div>
  );
}

export default function LiveAvatarConversationPanel({
  open,
  onOpenChange,
  safeEmbedUrl,
}: LiveAvatarConversationPanelProps) {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const title = "Talk through your growth idea";
  const description =
    "Ask how VranceFlex discovers buyers, verifies contacts, prepares outreach, and keeps every send under human control.";

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="live-avatar-sheet">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <AvatarConversation safeEmbedUrl={safeEmbedUrl} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="live-avatar-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <AvatarConversation safeEmbedUrl={safeEmbedUrl} />
      </DialogContent>
    </Dialog>
  );
}
