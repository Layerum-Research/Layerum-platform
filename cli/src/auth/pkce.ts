import { createHash, randomBytes } from "node:crypto";
import { CLIENT_ID } from "../config";

export const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export function generateVerifier() {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState() {
  return randomBytes(16).toString("base64url");
}

export function buildAuthorizeUrl(input: {
  appUrl: string;
  redirectUri: string;
  challenge: string;
  state: string;
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: input.redirectUri,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    state: input.state,
  });
  return `${input.appUrl}/oauth/authorize?${params.toString()}`;
}
