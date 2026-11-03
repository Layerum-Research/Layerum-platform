import { fetchMe, getMe } from "../api/auth";
import type { Me, Workspace } from "../api/types";
import { selectOnlyWorkspace } from "../api/workspaces";
import { apiUrl, appUrl, readCredentials, writeCredentials } from "../config";
import { NotLoggedInError } from "../errors";
import { startCallbackServer } from "./callback-server";
import { exchangeCode } from "./oauth";
import { OOB_REDIRECT_URI, buildAuthorizeUrl, challengeFor, generateState, generateVerifier } from "./pkce";

export type LoginResult = { user: { id: string; email: string }; workspace: Workspace | null };

export type LoginFlow = { url: string; completion: Promise<LoginResult> };

export async function currentSession(): Promise<Me | null> {
  if (!(await readCredentials())) return null;
  try {
    return await getMe();
  } catch (error) {
    if (error instanceof NotLoggedInError) return null;
    throw error;
  }
}

export async function completeLogin(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<LoginResult> {
  const api = apiUrl();
  const token = await exchangeCode({
    apiUrl: api,
    code: input.code,
    codeVerifier: input.verifier,
    redirectUri: input.redirectUri,
  });
  const me = await fetchMe(api, token.access_token);
  const user = { id: me.id, email: me.email };
  await writeCredentials({
    accessToken: token.access_token,
    expiresAt: token.expires_at,
    apiUrl: api,
    user,
  });
  return { user, workspace: await selectOnlyWorkspace() };
}

export type ManualLogin = { url: string; verifier: string };

export function startManualLogin(): ManualLogin {
  const app = appUrl();
  apiUrl();
  const verifier = generateVerifier();
  const url = buildAuthorizeUrl({
    appUrl: app,
    redirectUri: OOB_REDIRECT_URI,
    challenge: challengeFor(verifier),
    state: generateState(),
  });
  return { url, verifier };
}

export function completeManualLogin(login: ManualLogin, code: string) {
  return completeLogin({ code, verifier: login.verifier, redirectUri: OOB_REDIRECT_URI });
}

export async function startLogin(): Promise<LoginFlow> {
  const app = appUrl();
  apiUrl();
  const verifier = generateVerifier();
  const state = generateState();
  const server = await startCallbackServer(state);
  const url = buildAuthorizeUrl({
    appUrl: app,
    redirectUri: server.redirectUri,
    challenge: challengeFor(verifier),
    state,
  });

  const completion = (async (): Promise<LoginResult> => {
    const code = await server.waitForCode();
    return completeLogin({ code, verifier, redirectUri: server.redirectUri });
  })();
  // Prevents an unhandled rejection if the caller only attaches its handler later; callers still receive the error.
  completion.catch(() => undefined);

  return { url, completion };
}
