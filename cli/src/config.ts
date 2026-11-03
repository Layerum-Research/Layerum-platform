import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./errors";

export type Credentials = {
  accessToken: string;
  expiresAt: string | number;
  apiUrl: string;
  user: { id: string; email: string };
};

export type Config = { workspaceId?: string };

export const CLIENT_ID = "layerum-cli";

function requiredUrl(name: "LAYERUM_APP_URL" | "LAYERUM_API_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new CliError(`${name} is not set. Set it to the URL of your Layerum server.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`${name} is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CliError(`${name} must start with http:// or https://.`);
  }
  return value.replace(/\/+$/, "");
}

export function appUrl() {
  return requiredUrl("LAYERUM_APP_URL");
}

export function apiUrl() {
  return requiredUrl("LAYERUM_API_URL");
}

export function configDir() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) throw new CliError("APPDATA is not set; cannot locate the config directory.");
    return join(appData, "layerum");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "layerum");
}

const credentialsPath = () => join(configDir(), "credentials.json");
const configPath = () => join(configDir(), "config.json");

async function readJson(path: string): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError(`${path} is not valid JSON. Delete it and try again.`);
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(dir, 0o700);
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const user = v.user as Record<string, unknown> | undefined;
  return (
    typeof v.accessToken === "string" &&
    typeof v.apiUrl === "string" &&
    (typeof v.expiresAt === "string" || typeof v.expiresAt === "number") &&
    !!user &&
    typeof user.id === "string" &&
    typeof user.email === "string"
  );
}

export async function readCredentials(): Promise<Credentials | null> {
  const value = await readJson(credentialsPath());
  if (value === null) return null;
  if (!isCredentials(value)) {
    throw new CliError(`${credentialsPath()} is malformed. Run \`layerum login --force\`.`);
  }
  return value;
}

export function writeCredentials(credentials: Credentials) {
  return writeJsonAtomic(credentialsPath(), credentials);
}

export function deleteCredentials() {
  return rm(credentialsPath(), { force: true });
}

export async function readConfig(): Promise<Config> {
  const value = await readJson(configPath());
  if (value === null) return {};
  const workspaceId = (value as Record<string, unknown>).workspaceId;
  return typeof workspaceId === "string" ? { workspaceId } : {};
}

export function writeConfig(config: Config) {
  return writeJsonAtomic(configPath(), config);
}

export async function resolveWorkspaceId(flag?: string): Promise<string | null> {
  if (flag) return flag;
  if (process.env.LAYERUM_WORKSPACE) return process.env.LAYERUM_WORKSPACE;
  return (await readConfig()).workspaceId ?? null;
}
