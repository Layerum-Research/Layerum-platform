import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { CliError } from "../src/errors";
import {
  apiUrl,
  appUrl,
  configDir,
  deleteCredentials,
  readCredentials,
  resolveWorkspaceId,
  writeConfig,
  writeCredentials,
  type Credentials,
} from "../src/config";

const credentials: Credentials = {
  accessToken: "lyr_at_test",
  expiresAt: "2030-01-01T00:00:00.000Z",
  apiUrl: "https://api.example.com",
  user: { id: "u1", email: "a@example.com" },
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "layerum-cli-"));
  process.env.XDG_CONFIG_HOME = dir;
  delete process.env.LAYERUM_WORKSPACE;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("credentials round trip", async () => {
  assert.equal(await readCredentials(), null);
  await writeCredentials(credentials);
  assert.deepEqual(await readCredentials(), credentials);
  await deleteCredentials();
  assert.equal(await readCredentials(), null);
});

test("credentials are private and written without leftovers", { skip: process.platform === "win32" }, async () => {
  await writeCredentials(credentials);
  await writeCredentials(credentials);
  assert.equal((await stat(join(configDir(), "credentials.json"))).mode & 0o777, 0o600);
  assert.equal((await stat(configDir())).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(configDir()), ["credentials.json"]);
});

test("malformed credentials fail explicitly", async () => {
  await mkdir(configDir(), { recursive: true });
  await writeFile(join(configDir(), "credentials.json"), '{"accessToken":1}');
  await assert.rejects(readCredentials(), /malformed/);
});

test("workspace resolution: flag beats env beats config", async () => {
  assert.equal(await resolveWorkspaceId(), null);
  await writeConfig({ workspaceId: "from-config" });
  assert.equal(await resolveWorkspaceId(), "from-config");
  process.env.LAYERUM_WORKSPACE = "from-env";
  assert.equal(await resolveWorkspaceId(), "from-env");
  assert.equal(await resolveWorkspaceId("from-flag"), "from-flag");
});

test("server URLs are required and must be http or https", () => {
  delete process.env.LAYERUM_APP_URL;
  delete process.env.LAYERUM_API_URL;
  assert.throws(() => appUrl(), (error: unknown) => error instanceof CliError && /LAYERUM_APP_URL is not set/.test(error.message));
  assert.throws(() => apiUrl(), (error: unknown) => error instanceof CliError && /LAYERUM_API_URL is not set/.test(error.message));
  process.env.LAYERUM_API_URL = "not a url";
  assert.throws(() => apiUrl(), /not a valid URL/);
  process.env.LAYERUM_API_URL = "ftp://example.com";
  assert.throws(() => apiUrl(), /must start with http/);
  process.env.LAYERUM_APP_URL = "https://app.example/";
  process.env.LAYERUM_API_URL = "http://localhost:4000";
  assert.equal(appUrl(), "https://app.example");
  assert.equal(apiUrl(), "http://localhost:4000");
});
