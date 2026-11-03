"use client";

import { FormEvent, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { safeNextPath } from "@/lib/safe-next-path";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/loading-screen";
import { Reveal } from "@/components/public/reveal";

type Status = "idle" | "error";
type Phase = "form" | "code";

function GithubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .08 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21.8 12.23c0-.73-.06-1.24-.2-1.77H12v3.73h5.64c-.12.93-.77 2.34-2.2 3.28l-.02.12 3.03 2.4.2.02c1.83-1.72 2.89-4.25 2.89-7.78Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.93 6.77-2.53l-3.23-2.53c-.86.62-2.01 1.05-3.54 1.05-2.7 0-4.99-1.83-5.81-4.36l-.11.01-3.15 2.49-.04.11A10.24 10.24 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.2 13.63A6.28 6.28 0 0 1 5.9 12c0-.57.1-1.11.28-1.63l-.01-.12L3 7.73l-.1.05A10.4 10.4 0 0 0 2 12c0 1.52.36 2.96.99 4.22l3.21-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.01c1.94 0 3.24.86 3.98 1.58l2.91-2.91C17.07 2.96 14.76 2 12 2a10.24 10.24 0 0 0-9.11 5.78l3.25 2.57C7.01 7.83 9.3 6.01 12 6.01Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingScreen tone="app" />}>
      <SignUpPageContent />
    </Suspense>
  );
}

function SignUpPageContent() {
  const tSignup = useTranslations("signup");

  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = safeNextPath(nextParam);
  const nextQuery =
    nextParam !== null && next === nextParam
      ? `?next=${encodeURIComponent(next)}`
      : "";
  const { signUpWithPassword, signInWithOAuth, loading, session } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"github" | "google" | null>(
    null,
  );
  const [phase, setPhase] = useState<Phase>("form");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (isHydrated && !loading && session) {
      router.replace(next);
    }
  }, [isHydrated, loading, session, router, next]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (fullName.trim().length < 2 || password.trim().length < 8) {
      setStatus("error");
      setStatusMessage(tSignup("messages.validationError"));
      return;
    }

    setSubmitting(true);
    setStatus("idle");
    setStatusMessage("");

    const result = await signUpWithPassword({ email, password, fullName });

    setSubmitting(false);

    if (result.error) {
      setStatus("error");
      setStatusMessage(result.error.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      setPhase("code");
    }
  }

  async function onVerifyCode(event: FormEvent) {
    event.preventDefault();
    setCodeError("");

    if (code.trim().length === 0) {
      setCodeError("Enter the code we emailed you.");
      return;
    }

    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });
    setVerifying(false);

    if (error) {
      setCodeError("Invalid or expired code. Please try again.");
      return;
    }

    toast.success("Email confirmed. Signing you in...");
    router.push(next);
  }

  async function onResendCode() {
    setResending(true);
    const result = await signUpWithPassword({ email, password, fullName });
    setResending(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Sent a new code to your email.");
  }

  async function onOAuth(provider: "github" | "google") {
    setOauthProvider(provider);
    const error = await signInWithOAuth(provider, next);
    if (error) {
      toast.error(error.message);
      setOauthProvider(null);
    }
  }

  if (!isHydrated) {
    return <LoadingScreen tone="app" />;
  }

  if (!loading && session) {
    return <LoadingScreen tone="app" />;
  }

  // Full-screen takeover while account / code / OAuth are being verified.
  if (submitting || verifying || oauthProvider !== null) {
    return <LoadingScreen tone="app" />;
  }

  if (phase === "code") {
    return (
      <section className="ap-main">
        <div className="ap-auth-wrap">
          <article className="ap-auth-card">
            <div className="ap-card-body">
              <header className="ap-head">
                <h1>Check your inbox</h1>
                <p>Enter the confirmation code we sent to {email}.</p>
              </header>
              <form className="ap-form" onSubmit={onVerifyCode} style={{ marginTop: "1.5rem" }}>
                <label>
                  Confirmation code
                  <input
                    placeholder="Enter code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoFocus
                    required
                  />
                </label>
                {codeError ? <p className="ap-status error">{codeError}</p> : null}
                <button className="ap-submit" type="submit" disabled={verifying}>
                  {verifying ? "Verifying..." : "Confirm"}
                </button>
              </form>
              <p className="ap-terms">
                Didn&apos;t get a code?{" "}
                <button
                  type="button"
                  onClick={() => void onResendCode()}
                  disabled={resending}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#e5e2e1",
                    textDecoration: "underline",
                    cursor: resending ? "default" : "pointer",
                  }}
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
              </p>
            </div>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="ap-main">
        <div className="ap-auth-wrap">
          <Reveal>
          <article className="ap-auth-card">
            <div className="ap-tabs">
              <Link href={`/signin${nextQuery}`}>{tSignup("tabs.signin")}</Link>
              <Link className="active" href={`/signup${nextQuery}`}>
                {tSignup("tabs.signup")}
              </Link>
            </div>

            <div className="ap-card-body">
              <header className="ap-head">
                <h1>{tSignup("hero.title")}</h1>
                <p>{tSignup("hero.description")}</p>
              </header>

              <div className="ap-social-stack">
                <button
                  className="ap-social"
                  type="button"
                  onClick={() => void onOAuth("github")}
                  disabled={submitting || loading || oauthProvider !== null}
                >
                  <GithubIcon />
                  {tSignup("oauth.github")}
                </button>
                <button
                  className="ap-social"
                  type="button"
                  onClick={() => void onOAuth("google")}
                  disabled={submitting || loading || oauthProvider !== null}
                >
                  <GoogleIcon />
                  {tSignup("oauth.google")}
                </button>
              </div>

              <div className="ap-divider">
                <span />
                <p>{tSignup("divider")}</p>
                <span />
              </div>

              <form className="ap-form" onSubmit={onSubmit}>
                <label>
                  {tSignup("form.fullNameLabel")}
                  <input
                    placeholder={tSignup("form.fullNamePlaceholder")}
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </label>
                <label>
                  {tSignup("form.emailLabel")}
                  <input
                    placeholder={tSignup("form.emailPlaceholder")}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  {tSignup("form.passwordLabel")}
                  <input
                    placeholder={tSignup("form.passwordPlaceholder")}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <button
                  className="ap-submit"
                  type="submit"
                  disabled={
                    submitting || loading || !isHydrated || oauthProvider !== null
                  }
                >
                  {submitting ? tSignup("form.submitting") : tSignup("form.submit")}
                </button>
              </form>

              {status === "error" ? (
                <p className="ap-status error">{statusMessage}</p>
              ) : null}

              <p className="ap-terms">
                {tSignup("terms.prefix")}{" "}
                <Link href={`/signin${nextQuery}`}>{tSignup("terms.link")}</Link>.
              </p>
            </div>
          </article>

          <div className="ap-metadata">
            <article>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="12"
                viewBox="0 0 10 12"
                fill="none"
              >
                <path
                  d="M4.66667 11.6667C3.31528 11.3264 2.19965 10.551 1.31979 9.34062C0.439931 8.13021 0 6.78611 0 5.30833V1.75L4.66667 0L9.33333 1.75V5.30833C9.33333 6.78611 8.8934 8.13021 8.01354 9.34062C7.13368 10.551 6.01806 11.3264 4.66667 11.6667ZM4.66667 10.4417C5.67778 10.1208 6.51389 9.47917 7.175 8.51667C7.83611 7.55417 8.16667 6.48472 8.16667 5.30833V2.55208L4.66667 1.23958L1.16667 2.55208V5.30833C1.16667 6.48472 1.49722 7.55417 2.15833 8.51667C2.81944 9.47917 3.65556 10.1208 4.66667 10.4417Z"
                  fill="#C0C1FF"
                />
              </svg>
              <h2>{tSignup("side.scopedAccess")}</h2>
              <p>{tSignup("side.scopedAccessDesc")}</p>
            </article>
            <article>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="12"
                viewBox="0 0 10 12"
                fill="none"
              >
                <path
                  d="M3.82083 9.45L6.83958 5.83333H4.50625L4.92917 2.52292L2.23125 6.41667H4.25833L3.82083 9.45ZM2.33333 11.6667L2.91667 7.58333H0L5.25 0H6.41667L5.83333 4.66667H9.33333L3.5 11.6667H2.33333Z"
                  fill="#FFB783"
                />
              </svg>
              <h2>{tSignup("side.hostedApi")}</h2>
              <p>{tSignup("side.hostedApiDesc")}</p>
            </article>
          </div>
          </Reveal>
        </div>
    </section>
  );
}
