"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingScreen } from "@/components/loading-screen";
import { Reveal } from "@/components/public/reveal";

type State = "verifying" | "done" | "invalid";

function MfaRecoveryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const recoveryToken = searchParams.get("token");
    if (!recoveryToken) {
      setState("invalid");
      return;
    }

    void (async () => {
      try {
        await api.confirmMfaRecovery(recoveryToken);
        setState("done");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Recovery link is invalid or expired.",
        );
        setState("invalid");
      }
    })();
  }, [searchParams]);

  if (state === "verifying") {
    return <LoadingScreen tone="app" />;
  }

  if (state === "done") {
    return (
      <Reveal>
      <article className="ap-auth-card">
        <div className="ap-card-body">
          <header className="ap-head">
            <h1>Two-factor reset</h1>
            <p>
              Your authenticator has been disconnected. Sign in with your
              password — you will be asked to set up a new authenticator app.
            </p>
          </header>
          <div className="ap-form" style={{ textAlign: "center", paddingTop: "8px" }}>
            <button
              className="ap-submit"
              type="button"
              onClick={() => router.push("/signin")}
            >
              Back to sign in
            </button>
          </div>
        </div>
      </article>
      </Reveal>
    );
  }

  return (
    <article className="ap-auth-card">
      <div className="ap-card-body">
        <header className="ap-head">
          <h1>Link invalid or expired</h1>
          <p>
            Recovery links are single-use and expire after 15 minutes.
            Request a new one from the sign-in page.
          </p>
        </header>
        <div className="ap-form" style={{ textAlign: "center", paddingTop: "8px" }}>
          <Link
            className="ap-submit"
            href="/signin"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function MfaRecoveryPage() {
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
          <MfaRecoveryContent />
        </Suspense>
      </div>
    </section>
  );
}
