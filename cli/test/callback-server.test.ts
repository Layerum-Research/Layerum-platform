import assert from "node:assert/strict";
import { test } from "node:test";
import { startCallbackServer } from "../src/auth/callback-server";

const STATE = "expected-state";

process.env.LAYERUM_APP_URL = "https://app.example";

test("accepts a callback with the right state and returns the code", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  const res = await fetch(`${server.redirectUri}?code=abc123&state=${STATE}`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://app.example/oauth/complete?status=success");
  assert.equal(await wait, "abc123");
});

test("rejects a state mismatch", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  const res = await fetch(`${server.redirectUri}?code=abc123&state=wrong`, { redirect: "manual" });
  assert.equal(res.headers.get("location"), "https://app.example/oauth/complete?status=error");
  await assert.rejects(wait, /state mismatch/);
});

test("rejects a callback without state", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  await fetch(`${server.redirectUri}?code=abc123`, { redirect: "manual" });
  await assert.rejects(wait, /state mismatch/);
});

test("serves 404 for other paths and keeps waiting", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  const base = server.redirectUri.replace("/callback", "");
  assert.equal((await fetch(`${base}/`)).status, 404);
  assert.equal((await fetch(`${base}/callback/extra`)).status, 404);
  await fetch(`${server.redirectUri}?code=ok&state=${STATE}`, { redirect: "manual" });
  assert.equal(await wait, "ok");
});

test("binds to the loopback address", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  assert.match(server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  await fetch(`${server.redirectUri}?code=ok&state=${STATE}`, { redirect: "manual" });
  await wait;
});

test("times out with a clear error", async () => {
  const server = await startCallbackServer(STATE, 50);
  await assert.rejects(server.waitForCode(), /timed out/);
});

test("redirects a cancelled login to the cancelled result", async () => {
  const server = await startCallbackServer(STATE);
  const wait = server.waitForCode();
  const res = await fetch(`${server.redirectUri}?error=access_denied&state=${STATE}`, { redirect: "manual" });
  assert.equal(res.headers.get("location"), "https://app.example/oauth/complete?status=cancelled");
  await assert.rejects(wait, /cancelled/);
});
