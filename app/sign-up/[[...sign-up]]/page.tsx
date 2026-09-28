import { SignUpFlow } from "../../../components/auth-forms";
import { AuthSurface } from "../../../components/auth-surface";

export const metadata = { title: "Create account · VranceFlex" };

export default function SignUpPage() {
  return (
    <AuthSurface
      description="Create a workspace, confirm your email with a six-digit code, and start your first campaign from a URL or an idea."
      eyebrow="Create account"
      title="Set up a workspace for your team."
    >
      <SignUpFlow />
    </AuthSurface>
  );
}
