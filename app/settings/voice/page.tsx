import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { VoiceSettingsPanel } from "../../../components/voice-settings-panel";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getVoiceBalance } from "../../../lib/server/voice-credits";
import { voiceOffer } from "../../../lib/server/voice-billing";
import { getVoiceSettings, voiceSettingsFromRow } from "../../../lib/server/voice-settings";

export const metadata = { title: "Voice calling · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function VoiceSettingsPage() {
  const actor = await requireWorkspacePage();
  const empty = { availableSeconds: 0, includedSeconds: 0, packSeconds: 0, addonActive: false, nextExpiry: null as Date | null };
  // Setup mode has no database; show the empty state rather than an error.
  const [settings, balance] = actor.demo
    ? [voiceSettingsFromRow(null), empty]
    : await Promise.all([getVoiceSettings(actor.organizationId), getVoiceBalance(actor.organizationId)]).catch((error) => {
        console.error("[voice] settings failed", error instanceof Error ? error.message : error);
        return [voiceSettingsFromRow(null), empty] as const;
      });

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Voice calling"
      description="Connect your own Twilio line, confirm consent, and set when calls may go out. Minutes are included with the add-on; packs cover any extra."
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <VoiceSettingsPanel initial={settings} balance={{ ...balance, nextExpiry: balance.nextExpiry?.toISOString() ?? null }} offer={voiceOffer()} isAdmin={actor.organizationRole === "admin"} />
    </AppShell>
  );
}
