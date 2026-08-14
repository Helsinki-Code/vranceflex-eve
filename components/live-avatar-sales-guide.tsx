"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, MessageCircle, Mic2, Sparkles, X } from "lucide-react";
import { GlowCard } from "./aceternity";
import { BackgroundBeams } from "./ui/background-beams";
import { normalizeLiveAvatarEmbedUrl } from "./live-avatar-embed-url";

export function LiveAvatarSalesGuide({ embedUrl }: { embedUrl?: string }) {
  const safeEmbedUrl = normalizeLiveAvatarEmbedUrl(embedUrl);
  if (!safeEmbedUrl) return null;

  return (
    <Dialog.Root>
      <div className="live-avatar-launch">
        <Dialog.Trigger className="live-avatar-trigger">
          <Sparkles size={16} aria-hidden="true" />
          Talk to a VranceFlex guide
          <Mic2 size={15} aria-hidden="true" />
        </Dialog.Trigger>
        <span>Ask about agents, lead research, approvals, or how to begin.</span>
      </div>

      <Dialog.Trigger className="live-avatar-floating-trigger" aria-label="Open the VranceFlex AI product guide">
        <span className="live-avatar-floating-status" aria-hidden="true"><i /></span>
        <span className="live-avatar-floating-copy">
          <strong>Ask VranceFlex</strong>
          <small>AI product guide</small>
        </span>
        <MessageCircle size={19} aria-hidden="true" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="live-avatar-backdrop" />
        <Dialog.Popup className="live-avatar-dialog">
          <GlowCard className="live-avatar-card" interactive={false}>
            <BackgroundBeams className="live-avatar-beams" />
            <header className="live-avatar-header">
              <div>
                <span className="live-avatar-kicker">
                  <i aria-hidden="true" /> AI product guide
                </span>
                <Dialog.Title>Talk through your growth idea</Dialog.Title>
                <Dialog.Description>
                  Ask how VranceFlex researches a market, finds buyers, and prepares outreach for human approval.
                </Dialog.Description>
              </div>
              <Dialog.Close className="live-avatar-close" aria-label="Close VranceFlex guide">
                <X size={19} aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="live-avatar-frame-shell">
              <iframe
                allow="microphone"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                src={safeEmbedUrl}
                title="VranceFlex LiveAvatar sales guide"
              />
            </div>

            <footer className="live-avatar-footer">
              <p>
                Your microphone is requested only when you start the conversation. Don&apos;t share passwords,
                provider keys, or customer data.
              </p>
              <div>
                <a className="live-avatar-secondary-action" href="/sign-up">Create an account</a>
                <a className="live-avatar-primary-action" href="/campaigns/new">
                  Start a campaign <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
            </footer>
          </GlowCard>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
