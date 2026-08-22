"use client";

import { MessageCircle, Mic2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { normalizeLiveAvatarEmbedUrl } from "./live-avatar-embed-url";

type ConversationPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  safeEmbedUrl: string;
};

export function LiveAvatarSalesGuide({ embedUrl }: { embedUrl?: string }) {
  const safeEmbedUrl = normalizeLiveAvatarEmbedUrl(embedUrl);
  const [open, setOpen] = useState(false);
  const [inlineVisible, setInlineVisible] = useState(true);
  const [ConversationPanel, setConversationPanel] = useState<ComponentType<ConversationPanelProps> | null>(null);
  const inlineLaunchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const launch = inlineLaunchRef.current;
    if (!launch) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInlineVisible(entry.isIntersecting),
      { rootMargin: "0px 0px 120px 0px", threshold: 0.05 },
    );
    observer.observe(launch);
    return () => observer.disconnect();
  }, []);

  if (!safeEmbedUrl) return null;

  async function openConversation() {
    if (!ConversationPanel) {
      const module = await import("./live-avatar-conversation-panel");
      setConversationPanel(() => module.default);
    }
    setOpen(true);
  }

  return (
    <>
      <div className="live-avatar-launch" ref={inlineLaunchRef}>
        <button className="live-avatar-inline-trigger" type="button" onClick={openConversation}>
          <Sparkles aria-hidden="true" />Talk to a VranceFlex guide<Mic2 aria-hidden="true" />
        </button>
        <span>Ask about research, verification, approval, scheduling, or delivery.</span>
      </div>
      <button
        className={`live-avatar-floating-trigger${inlineVisible ? " is-hidden" : ""}`}
        type="button"
        aria-label="Open the VranceFlex conversational product guide"
        aria-hidden={inlineVisible}
        tabIndex={inlineVisible ? -1 : 0}
        onClick={openConversation}
      >
        <span className="live-avatar-floating-status" aria-hidden="true" />
        <span className="live-avatar-floating-copy"><strong>Ask VranceFlex</strong><small>AI product guide</small></span>
        <MessageCircle aria-hidden="true" />
      </button>
      {open && ConversationPanel ? (
        <ConversationPanel open={open} onOpenChange={setOpen} safeEmbedUrl={safeEmbedUrl} />
      ) : null}
    </>
  );
}
