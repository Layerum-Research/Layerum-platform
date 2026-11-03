import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildAuthorizeUrl, challengeFor, generateState, generateVerifier } from "../src/auth/pkce";

test("verifier uses the allowed charset and length", () => {
  const verifier = generateVerifier();
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.notEqual(verifier, generateVerifier());
});

test("challenge is base64url sha256 of the verifier, 43 chars", () => {
  const verifier = generateVerifier();
  const challenge = challengeFor(verifier);
  assert.equal(challenge.length, 43);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("challenge matches the RFC 7636 example", () => {
  assert.equal(
    challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("state is random and url safe", () => {
  assert.match(generateState(), /^[A-Za-z0-9_-]{16,}$/);
  assert.notEqual(generateState(), generateState());
});

test("authorize url carries every required parameter", () => {
  const url = buildAuthorizeUrl({
    appUrl: "https://app.example",
    redirectUri: "http://127.0.0.1:5555/callback",
    challenge: "abc",
    state: "xyz",
  });
  assert.equal(
    url,
    "https://app.example/oauth/authorize?response_type=code&client_id=layerum-cli&redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback&code_challenge=abc&code_challenge_method=S256&state=xyz",
  );
});
