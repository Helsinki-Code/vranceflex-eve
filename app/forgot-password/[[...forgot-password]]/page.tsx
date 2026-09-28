import { ForgotPasswordFlow } from "../../../components/auth-forms";
import { AuthSurface } from "../../../components/auth-surface";

export const metadata = { title: "Recover account · VranceFlex" };

export default function ForgotPasswordPage() {
  return (
    <AuthSurface
      description="We email you a code that lasts ten minutes. Resetting signs you out on every other device."
      eyebrow="Reset password"
      title="Reset your password."
    >
      <ForgotPasswordFlow />
    </AuthSurface>
  );
}
