import { AuthSurface } from "../../../components/auth-surface";
import { SignInForm } from "../../../components/auth-forms";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Sign in · VranceFlex" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <AuthSurface
      description="Pick up where your campaigns left off: new replies, sequences waiting for approval, and leads that finished verifying."
      eyebrow="Sign in"
      title="Your campaigns are where you left them."
    >
      <SignInForm nextPath={nextPath} />
    </AuthSurface>
  );
}
