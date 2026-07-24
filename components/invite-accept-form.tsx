"use client";

import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type InvitePreview = {
  email: string;
  role: string;
  organizationName: string;
};

type AcceptResult =
  | { status: "joined"; organizationId: string }
  | { status: "joined_with_session"; organizationId: string }
  | { status: "requires_sign_in"; email: string }
  | { status: "requires_account_details"; email: string };

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "The request could not be completed.");
  }
  return data;
}

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [needsAccountDetails, setNeedsAccountDetails] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    requestJson<{ invite: InvitePreview }>(`/api/invites/${token}/accept`)
      .then((data) => setPreview(data.invite))
      .catch((requestError) =>
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : "This invite is invalid or has expired.",
        ),
      );
  }, [token]);

  async function accept(body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<AcceptResult>(`/api/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      if (result.status === "joined" || result.status === "joined_with_session") {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (result.status === "requires_sign_in") {
        setSignInRequired(true);
        return;
      }
      if (result.status === "requires_account_details") {
        setNeedsAccountDetails(true);
        return;
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The invite could not be accepted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitAccountDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await accept({ name: form.get("name"), password: form.get("password") });
  }

  if (loadError) {
    return (
      <div className="first-party-auth-form auth-complete">
        <h2>This invite isn&apos;t valid</h2>
        <p>{loadError}</p>
        <a className="auth-submit" href="/sign-in">
          Go to sign in <ArrowRight size={16} />
        </a>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="first-party-auth-form auth-complete">
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  }

  if (signInRequired) {
    return (
      <div className="first-party-auth-form auth-complete">
        <span><ShieldCheck size={21} /></span>
        <h2>Sign in to accept</h2>
        <p>An account already exists for {preview.email}. Sign in, then return to this link.</p>
        <a
          className="auth-submit"
          href={`/sign-in?next=${encodeURIComponent(`/invites/${token}`)}`}
        >
          Go to sign in <ArrowRight size={16} />
        </a>
      </div>
    );
  }

  if (needsAccountDetails) {
    return (
      <form className="first-party-auth-form" onSubmit={submitAccountDetails}>
        <div className="auth-form-heading">
          <span><ShieldCheck size={15} /> Join {preview.organizationName}</span>
          <h2>Create your account</h2>
          <p>Finish setting up your account for {preview.email}.</p>
        </div>
        {error ? <div className="auth-form-error" role="alert">{error}</div> : null}
        <label>
          <span>Your name</span>
          <input autoComplete="name" name="name" required />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="new-password"
            minLength={10}
            name="password"
            required
            type="password"
          />
          <small>At least 10 characters with a letter and number.</small>
        </label>
        <button className="auth-submit" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="spin" size={17} /> : (
            <>Create account and join <ArrowRight size={16} /></>
          )}
        </button>
      </form>
    );
  }

  return (
    <div className="first-party-auth-form auth-complete">
      <div className="auth-form-heading">
        <span><ShieldCheck size={15} /> Team invite</span>
        <h2>Join {preview.organizationName}</h2>
        <p>
          You&apos;ve been invited as <strong>{preview.role}</strong> for {preview.email}.
        </p>
      </div>
      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}
      <button className="auth-submit" disabled={busy} onClick={() => void accept()} type="button">
        {busy ? <LoaderCircle className="spin" size={17} /> : (
          <>Accept invite <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}
