"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/loading-screen";
import { Reveal } from "@/components/public/reveal";

type State = "exchanging" | "ready" | "done" | "invalid";

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);

  const [state, setState] = useState<State>("exchanging");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const tokenHash = searchParams.get("token_hash");
    if (!tokenHash) {
      setState("invalid");
      router.replace("/signin");
      return;
    }

    void (async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (verifyError) {
        toast.error("Reset link is invalid or expired.");
        router.replace("/signin");
        return;
      }
      setState("ready");
    })();
  }, [searchParams, router]);

  useEffect(() => {
    if (state !== "ready") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setState("done");
    toast.success("Password updated. Signing you in...");
    router.replace("/workspaces");
  }

  if (state !== "ready" || submitting) {
    return <LoadingScreen tone="app" />;
  }

  return (
    <Reveal>
    <article className="ap-auth-card">
      <div className="ap-card-body">
        <header className="ap-head">
          <h1>Set new password</h1>
          <p>Choose a new password for your account.</p>
        </header>
        <form className="ap-form" onSubmit={onSubmit} style={{ marginTop: "1.5rem" }}>
          <label>
            New password
            <input
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="ap-status error">{error}</p> : null}
          <button className="ap-submit" type="submit" disabled={submitting}>
            {submitting ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </article>
    </Reveal>
  );
}

export default function SetPasswordPage() {
  return (
    <section className="ap-main">
      <div className="ap-auth-wrap">
        <Suspense
          fallback={
            <article className="ap-auth-card">
              <div className="ap-card-body">
                <LoadingScreen tone="public" fullScreen={false} />
              </div>
            </article>
          }
        >
          <SetPasswordContent />
        </Suspense>
      </div>
    </section>
  );
}
