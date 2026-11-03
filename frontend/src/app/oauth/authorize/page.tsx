"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/loading-screen";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api-client";
import { resolveAvatarUrl, resolveDisplayName } from "@/lib/user-profile";
import { useAuth } from "@/providers/auth-provider";
import { Brand, CodeView, ConnectionRow, Permissions, Shell } from "./parts";

const CLIENT_ID = "layerum-cli";
const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

type AuthorizeRequest = {
  redirectUri: URL | null;
  codeChallenge: string;
  state: string;
};

function parseRequest(params: URLSearchParams): AuthorizeRequest | null {
  const redirect = params.get("redirect_uri") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const state = params.get("state") ?? "";

  if (params.get("response_type") !== "code") return null;
  if (params.get("client_id") !== CLIENT_ID) return null;
  if (params.get("code_challenge_method") !== "S256") return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return null;
  if (!state) return null;

  if (redirect === OOB_REDIRECT_URI) {
    return { redirectUri: null, codeChallenge, state };
  }

  let uri: URL;
  try {
    uri = new URL(redirect);
  } catch {
    return null;
  }
  if (uri.protocol !== "http:") return null;
  if (uri.hostname !== "127.0.0.1" && uri.hostname !== "localhost") return null;
  if (!/^\d+$/.test(uri.port)) return null;
  if (uri.pathname !== "/callback") return null;
  if (uri.search || uri.hash || uri.username || uri.password) return null;

  return { redirectUri: uri, codeChallenge, state };
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<LoadingScreen tone="app" />}>
      <OAuthAuthorizeContent />
    </Suspense>
  );
}

function OAuthAuthorizeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session, user, loading, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const request = useMemo(() => parseRequest(searchParams), [searchParams]);
  const currentPath = `${pathname}?${searchParams.toString()}`;
  const signInPath = `/signin?next=${encodeURIComponent(currentPath)}`;

  const shouldSignIn = !loading && Boolean(request) && !session;

  useEffect(() => {
    if (shouldSignIn) router.replace(signInPath);
  }, [shouldSignIn, router, signInPath]);

  if (loading) return <LoadingScreen tone="app" />;

  if (!request) {
    return (
      <Shell>
        <Brand />
        <header className="ap-head">
          <h1>Invalid authorization request</h1>
        </header>
      </Shell>
    );
  }

  if (!session) {
    return <LoadingScreen tone="app" />;
  }

  const email = user?.email ?? null;
  const name = resolveDisplayName({
    full_name: null,
    email,
    user_metadata: user?.user_metadata ?? null,
  });
  const avatarUrl = resolveAvatarUrl({
    avatar_url: null,
    user_metadata: user?.user_metadata ?? null,
  });

  async function onAuthorize() {
    if (!request || !session) return;
    setPending(true);
    setErrorMessage("");
    try {
      const result = await api.authorizeOAuthClient(session.access_token, {
        client_id: CLIENT_ID,
        redirect_uri: request.redirectUri?.href ?? OOB_REDIRECT_URI,
        code_challenge: request.codeChallenge,
        code_challenge_method: "S256",
        state: request.state,
      });
      if (!request.redirectUri) {
        if (!result.code || result.redirect_url) {
          throw new Error("Invalid authorization response");
        }
        setCode(result.code);
        setPending(false);
        return;
      }
      if (!result.redirect_url || result.code) {
        throw new Error("Invalid authorization response");
      }
      let target: URL;
      try {
        target = new URL(result.redirect_url);
      } catch {
        throw new Error("Invalid authorization response");
      }
      if (
        target.origin !== request.redirectUri.origin ||
        target.pathname !== request.redirectUri.pathname
      ) {
        throw new Error("Invalid authorization response");
      }
      window.location.assign(target.href);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Authorization failed",
      );
      setPending(false);
    }
  }

  function onCancel() {
    if (!request) return;
    if (!request.redirectUri) {
      setCancelled(true);
      return;
    }
    const target = new URL(request.redirectUri.href);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("state", request.state);
    window.location.assign(target.href);
  }

  if (code) {
    return (
      <Shell>
        <CodeView code={code} />
      </Shell>
    );
  }

  if (cancelled) {
    return (
      <Shell>
        <Brand />
        <header className="ap-head">
          <h1>Authorization cancelled</h1>
          <p>You can close this tab.</p>
        </header>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <Brand />
      <ConnectionRow />
      <header className="ap-head oa-head">
        <h1>Authorize Layerum CLI</h1>
        <p>
          The Layerum command line tool and MCP server are asking to access
          your Layerum account. They let you and your AI tools work with your
          workspaces from the terminal.
        </p>
      </header>

      <div className="oa-account">
        <UserAvatar name={name} email={email} avatarUrl={avatarUrl} size={32} />
        <div className="oa-account-text">
          <span className="oa-account-label">Signed in as</span>
          <span className="oa-account-email">{email ?? name}</span>
        </div>
        <button
          className="oa-signout"
          type="button"
          disabled={pending}
          onClick={() => void signOut()}
        >
          Not you? Sign out
        </button>
      </div>

      <Permissions />

      <div className="oa-meta">
        <p>Access lasts 90 days. You can revoke it anytime in Account → Connected apps.</p>
        <p>Only continue if you started this login yourself from your terminal or AI tool.</p>
      </div>

      {errorMessage ? (
        <p className="ap-status error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="oa-actions">
        <button
          className="ap-submit"
          type="button"
          disabled={pending}
          onClick={() => void onAuthorize()}
        >
          {pending ? "Authorizing..." : "Authorize"}
        </button>
        <button
          className="oa-secondary"
          type="button"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </Shell>
  );
}
