"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/loading-screen";
import { safeNextPath } from "@/lib/safe-next-path";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackShell />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);

  const code = searchParams.get("code");
  const authError = searchParams.get("error");
  const authErrorDescription = searchParams.get("error_description");
  const nextPath = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (authError) {
      toast.error(authErrorDescription ?? "OAuth sign in failed.");
      router.replace("/signin");
      return;
    }

    if (!code) {
      toast.error("Missing OAuth code.");
      router.replace("/signin");
      return;
    }

    void (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        toast.error(error.message);
        router.replace("/signin");
        return;
      }
      router.replace(nextPath);
    })();
  }, [authError, authErrorDescription, code, nextPath, router]);

  return <AuthCallbackShell />;
}

function AuthCallbackShell() {
  return (
    <LoadingScreen tone="app">
      <p className="loading-screen-fallback">
        If redirect fails, <Link href="/signin" prefetch={false}>return to sign in</Link>.
      </p>
    </LoadingScreen>
  );
}
