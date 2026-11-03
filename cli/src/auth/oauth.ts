import { request } from "../api/http";
import { CLIENT_ID } from "../config";
import { CliError } from "../errors";

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string | number;
};

export async function exchangeCode(input: {
  apiUrl: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const token = await request<TokenResponse>(input.apiUrl, null, "/oauth/token", {
    method: "POST",
    body: {
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: input.redirectUri,
    },
  });
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new CliError("The token endpoint did not return an access token.");
  }
  return token;
}

export async function revokeToken(apiUrl: string, accessToken: string) {
  await request<{ success: boolean }>(apiUrl, accessToken, "/oauth/revoke", { method: "POST" });
}
