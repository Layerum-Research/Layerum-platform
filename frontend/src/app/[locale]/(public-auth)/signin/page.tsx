"use client";

import { FormEvent, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api-client";
import { safeNextPath } from "@/lib/safe-next-path";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/loading-screen";
import { Reveal } from "@/components/public/reveal";

type View = "signin" | "mfa" | "mfa-recovery" | "mfa-recovery-sent" | "forgot" | "forgot-sent";

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

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingScreen tone="app" />}>
      <SignInPageContent />
    </Suspense>
  );
}

function SignInPageContent() {
  const tSignin = useTranslations("signin");

  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = safeNextPath(nextParam);
  const nextQuery =
    nextParam !== null && next === nextParam
      ? `?next=${encodeURIComponent(next)}`
      : "";
  const { signInWithPassword, signInWithOAuth, loading, session } = useAuth();
  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"github" | "google" | null>(null);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (
      isHydrated &&
      !loading &&
      session &&
      view !== "mfa" &&
      view !== "mfa-recovery" &&
      view !== "mfa-recovery-sent"
    ) {
      router.replace(next);
    }
  }, [isHydrated, loading, session, router, view, next]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    const error = await signInWithPassword(email, password);

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    // If user has verified TOTP factors, require code before entering app.
    try {
      const { data: assurance } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.nextLevel === "aal2" && assurance.currentLevel === "aal1") {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verified = (factors?.totp ?? []).find(
          (factor) => factor.status === "verified",
        );
        if (verified) {
          const { data: challenge, error: challengeError } =
            await supabase.auth.mfa.challenge({ factorId: verified.id });
          if (challengeError) throw challengeError;
          setMfaFactorId(verified.id);
          setMfaChallengeId(challenge.id);
          setMfaCode("");
          setView("mfa");
          return;
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "MFA check failed",
      );
      return;
    }

    toast.success(tSignin("tabs.signin"));
    router.push(next);
  }

  async function onMfaSubmit(event: FormEvent) {
    event.preventDefault();
    if (!mfaFactorId || !mfaChallengeId) return;
    const cleanCode = mfaCode.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setMfaSubmitting(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: cleanCode,
      });
      if (error) throw error;
      toast.success(tSignin("tabs.signin"));
      router.push(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid code");
    } finally {
      setMfaSubmitting(false);
    }
  }

  async function onRecoverySubmit(event: FormEvent) {
    event.preventDefault();
    setRecoverySubmitting(true);
    try {
      await api.requestMfaRecovery(recoveryEmail);
    } catch {
      // Always show success to prevent email enumeration
    }
    setRecoverySubmitting(false);
    setView("mfa-recovery-sent");
  }

  async function onOAuth(provider: "github" | "google") {
    setOauthProvider(provider);
    const error = await signInWithOAuth(provider, next);
    if (error) {
      toast.error(error.message);
      setOauthProvider(null);
    }
  }

  async function onForgotSubmit(event: FormEvent) {
    event.preventDefault();
    setForgotSubmitting(true);
    try {
      await api.forgotPassword(forgotEmail);
    } catch {
      // Always show success to prevent email enumeration
    }
    setForgotSubmitting(false);
    setView("forgot-sent");
  }

  if (!isHydrated) {
    return <LoadingScreen tone="app" />;
  }

  if (!loading && session) {
    return <LoadingScreen tone="app" />;
  }

  // Full-screen takeover while credentials / MFA / OAuth are being verified.
  if (submitting || mfaSubmitting || oauthProvider !== null) {
    return <LoadingScreen tone="app" />;
  }

  return (
    <section className="ap-main">
        <div className="ap-auth-wrap">
          <Reveal>
          <article className="ap-auth-card">
            <div className="ap-tabs">
              <Link className="active" href={`/signin${nextQuery}`}>
                {tSignin("tabs.signin")}
              </Link>
              <Link href={`/signup${nextQuery}`}>{tSignin("tabs.signup")}</Link>
            </div>

            <div className="ap-card-body">
              <header className="ap-head">
                <h1>{tSignin("hero.title")}</h1>
                <p>{tSignin("hero.description")}</p>
              </header>

              <div className="ap-social-stack">
                <button
                  className="ap-social"
                  type="button"
                  onClick={() => void onOAuth("github")}
                  disabled={submitting || loading || oauthProvider !== null}
                >
                  <GithubIcon />
                  {tSignin("oauth.github")}
                </button>
                <button
                  className="ap-social"
                  type="button"
                  onClick={() => void onOAuth("google")}
                  disabled={submitting || loading || oauthProvider !== null}
                >
                  <GoogleIcon />
                  {tSignin("oauth.google")}
                </button>
              </div>

              <div className="ap-divider">
                <span />
                <p>{tSignin("divider")}</p>
                <span />
              </div>

              {view === "signin" ? (
                <form className="ap-form" onSubmit={onSubmit}>
                  <label>
                    {tSignin("form.emailLabel")}
                    <input
                      placeholder={tSignin("form.emailPlaceholder")}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>
                  <div className="ap-field">
                    <div className="ap-label-row">
                      <label htmlFor="signin-password">{tSignin("form.passwordLabel")}</label>
                      <button
                        className="ap-forgot"
                        type="button"
                        onClick={() => { setForgotEmail(email); setView("forgot"); }}
                      >
                        {tSignin("form.forgot")}
                      </button>
                    </div>
                    <input
                      id="signin-password"
                      placeholder={tSignin("form.passwordPlaceholder")}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                  <button
                    className="ap-submit"
                    disabled={submitting || loading || !isHydrated || oauthProvider !== null}
                    type="submit"
                  >
                    {submitting ? tSignin("form.submitting") : tSignin("form.submit")}
                  </button>
                </form>
              ) : view === "mfa" ? (
                <form className="ap-form" onSubmit={onMfaSubmit}>
                  <label>
                    Two-factor code
                    <input
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mfaCode}
                      onChange={(event) =>
                        setMfaCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      required
                    />
                  </label>
                  <button
                    className="ap-submit"
                    disabled={mfaSubmitting || mfaCode.length !== 6}
                    type="submit"
                  >
                    {mfaSubmitting ? "Verifying..." : "Verify"}
                  </button>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ alignSelf: "center", marginTop: "4px" }}
                    onClick={() => {
                      setView("signin");
                      setMfaCode("");
                    }}
                  >
                    Back to sign in
                  </button>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ alignSelf: "center", marginTop: "4px" }}
                    onClick={() => {
                      setRecoveryEmail(email);
                      setView("mfa-recovery");
                    }}
                  >
                    Lost your authenticator?
                  </button>
                </form>
              ) : view === "mfa-recovery" ? (
                <form className="ap-form" onSubmit={onRecoverySubmit}>
                  <p className="ap-status" style={{ textAlign: "center" }}>
                    Enter your account email. If two-factor is enabled, we will send a reset link valid for 15 minutes.
                  </p>
                  <label>
                    {tSignin("form.emailLabel")}
                    <input
                      placeholder={tSignin("form.emailPlaceholder")}
                      type="email"
                      value={recoveryEmail}
                      onChange={(event) => setRecoveryEmail(event.target.value)}
                      required
                    />
                  </label>
                  <button
                    className="ap-submit"
                    disabled={recoverySubmitting}
                    type="submit"
                  >
                    {recoverySubmitting ? "Sending..." : "Send reset link"}
                  </button>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ alignSelf: "center", marginTop: "4px" }}
                    onClick={() => setView("mfa")}
                  >
                    Back to code entry
                  </button>
                </form>
              ) : view === "mfa-recovery-sent" ? (
                <div className="ap-form" style={{ textAlign: "center", paddingTop: "8px" }}>
                  <p className="ap-status success">If two-factor is enabled for this email, a reset link is on its way. It expires in 15 minutes.</p>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ marginTop: "16px" }}
                    onClick={() => setView("mfa")}
                  >
                    Back to code entry
                  </button>
                </div>
              ) : view === "forgot" ? (
                <form className="ap-form" onSubmit={onForgotSubmit}>
                  <label>
                    {tSignin("form.emailLabel")}
                    <input
                      placeholder={tSignin("form.emailPlaceholder")}
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      required
                    />
                  </label>
                  <button
                    className="ap-submit"
                    disabled={forgotSubmitting}
                    type="submit"
                  >
                    {forgotSubmitting ? tSignin("form.forgotSending") : tSignin("form.forgotSend")}
                  </button>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ alignSelf: "center", marginTop: "4px" }}
                    onClick={() => setView("signin")}
                  >
                    {tSignin("form.forgotBack")}
                  </button>
                </form>
              ) : (
                <div className="ap-form" style={{ textAlign: "center", paddingTop: "8px" }}>
                  <p className="ap-status success">{tSignin("form.forgotSuccess")}</p>
                  <button
                    className="ap-forgot"
                    type="button"
                    style={{ marginTop: "16px" }}
                    onClick={() => setView("signin")}
                  >
                    {tSignin("form.forgotBack")}
                  </button>
                </div>
              )}
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
              <h2>{tSignin("side.scopedAccess")}</h2>
              <p>{tSignin("side.scopedAccessDesc")}</p>
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
              <h2>{tSignin("side.hostedApi")}</h2>
              <p>{tSignin("side.hostedApiDesc")}</p>
            </article>
          </div>
          </Reveal>
        </div>
    </section>
  );
}
