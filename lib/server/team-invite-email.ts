import { isResendConfigured } from "../auth/config";
import { AuthConfigurationError } from "./auth-crypto";
import { platformResendCredentials, sendResendEmail } from "./resend-email";

export function assertTeamInviteEmailConfigured() {
  if (!isResendConfigured()) {
    throw new AuthConfigurationError(
      "Resend is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
}

function inviteUrl(token: string) {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  const path = `/invites/${token}`;
  return base ? `${base}${path}` : path;
}

export async function sendTeamInviteEmail({
  to,
  token,
  organizationName,
}: {
  to: string;
  token: string;
  organizationName: string;
}) {
  assertTeamInviteEmailConfigured();

  const url = inviteUrl(token);
  const subject = `You're invited to join ${organizationName} on VranceFlex`;

  await sendResendEmail(platformResendCredentials(), {
    to,
    subject,
    text: `You've been invited to join ${organizationName} on VranceFlex.\n\nAccept the invite:\n${url}\n\nThis invite expires in 7 days. If you weren't expecting this, ignore this email.`,
    html: `
        <div style="background:#f4f2ea;padding:40px 20px;font-family:Arial,sans-serif;color:#0d1e18">
          <div style="max-width:520px;margin:auto;background:#fffdf7;border:1px solid #d8d8cf;border-radius:18px;padding:38px">
            <p style="font-size:11px;letter-spacing:.14em;font-weight:700;color:#315d49">VRANCEFLEX</p>
            <h1 style="font-size:28px;letter-spacing:-.04em;margin:20px 0 12px">Join ${organizationName}</h1>
            <p style="color:#53635c;line-height:1.6">You've been invited to collaborate on VranceFlex.</p>
            <a href="${url}" style="display:inline-block;margin:24px 0;padding:14px 22px;background:#c9ff72;color:#0d1e18;font-weight:800;text-decoration:none;border-radius:12px">Accept invite</a>
            <p style="font-size:12px;color:#718078">This invite expires in 7 days. If you weren't expecting this, ignore this email.</p>
          </div>
        </div>
      `,
    tags: [{ name: "category", value: "team_invite" }],
  });
}
