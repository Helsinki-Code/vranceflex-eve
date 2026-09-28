import { AuthSurface } from "../../../components/auth-surface";
import { InviteAcceptForm } from "../../../components/invite-accept-form";

export const metadata = { title: "Accept invite · VranceFlex" };
export const dynamic = "force-dynamic";

type PageContext = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: PageContext) {
  const { token } = await params;

  return (
    <AuthSurface
      description="Accept an invitation to collaborate on a VranceFlex workspace."
      eyebrow="Invitation"
      title="Join your team on VranceFlex."
    >
      <InviteAcceptForm token={token} />
    </AuthSurface>
  );
}
