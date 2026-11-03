import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { challengeFor, OOB_REDIRECT_URI } from "../src/auth/pkce";
import { completeManualLogin, startManualLogin } from "../src/auth/login";
import { PENDING_LOGIN_TTL_MS, beginPendingLogin, finishPendingLogin } from "../src/auth/pending-login";
import { readCredentials } from "../src/config";

async function mockApi(tokenStatus = 200) {
  const bodies: Record<string, unknown>[] = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/oauth/token") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      bodies.push(JSON.parse(raw));
      if (tokenStatus !== 200) return send(tokenStatus, { message: "Invalid or expired code" });
      return send(200, { access_token: "tok", token_type: "Bearer", expires_in: 3600, expires_at: 9999999999 });
    }
    if (req.url === "/auth/me") return send(200, { id: "u1", email: "a@b.c", full_name: null });
    if (req.url === "/workspaces") {
      return send(200, [
        { role: "owner", workspace: { id: "w1", name: "Acme", slug: "acme", logo_url: null, created_at: "x" } },
      ]);
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { bodies, url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function isolate(apiUrl: string) {
  process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), "layerum-test-"));
  process.env.LAYERUM_API_URL = apiUrl;
  process.env.LAYERUM_APP_URL = "https://app.example";
}

test("manual authorize URL uses the oob redirect and no loopback address", async () => {
  await isolate("https://api.example");
  const { url, verifier } = startManualLogin();
  const params = new URL(url).searchParams;
  assert.equal(params.get("redirect_uri"), OOB_REDIRECT_URI);
  assert.equal(params.get("code_challenge"), challengeFor(verifier));
  assert.doesNotMatch(url, /127\.0\.0\.1|localhost/);
});

test("manual completion exchanges with the oob redirect and the stored verifier", async () => {
  const api = await mockApi();
  await isolate(api.url);
  try {
    const login = startManualLogin();
    const result = await completeManualLogin(login, "the-code");
    assert.deepEqual(api.bodies[0], {
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: login.verifier,
      client_id: "layerum-cli",
      redirect_uri: OOB_REDIRECT_URI,
    });
    assert.equal(result.user.email, "a@b.c");
    assert.equal(result.workspace?.name, "Acme");
    assert.equal((await readCredentials())?.accessToken, "tok");
  } finally {
    api.close();
  }
});

test("finishing without a pending login fails", async () => {
  await assert.rejects(finishPendingLogin("code"), /No manual login is pending/);
});

test("a pending login expires", async () => {
  beginPendingLogin(1000);
  await assert.rejects(finishPendingLogin("code", 1000 + PENDING_LOGIN_TTL_MS + 1), /expired/);
  await assert.rejects(finishPendingLogin("code"), /No manual login is pending/);
});

test("a failed exchange keeps the API message and clears the pending login", async () => {
  const api = await mockApi(400);
  await isolate(api.url);
  try {
    beginPendingLogin();
    await assert.rejects(finishPendingLogin(" bad "), /Invalid or expired code.*start again/);
    assert.equal(api.bodies[0].code, "bad");
    await assert.rejects(finishPendingLogin("bad"), /No manual login is pending/);
  } finally {
    api.close();
  }
});
