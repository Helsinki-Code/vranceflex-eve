import Link from "next/link";
import { Button } from "./ui/button";

export function AuthConfigurationPanel() {
  return (
    <section className="grid gap-4">
      <p className="font-mono text-xs text-muted-foreground">setup required</p>
      <h2 className="text-xl font-semibold tracking-tight">Sign-in isn&apos;t configured on this deployment</h2>
      <p className="text-sm leading-6 text-muted-foreground">Accounts stay closed until the hosting environment has <span className="font-mono text-xs">DATABASE_URL</span>, <span className="font-mono text-xs">AUTH_SECRET</span> and the platform Resend key for one-time codes.</p>
      <Button asChild variant="outline" className="justify-self-start"><Link href="/">Back to the site</Link></Button>
    </section>
  );
}
