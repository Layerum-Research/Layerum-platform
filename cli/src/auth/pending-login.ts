import { CliError } from "../errors";
import { completeManualLogin, startManualLogin, type LoginResult, type ManualLogin } from "./login";

export const PENDING_LOGIN_TTL_MS = 10 * 60_000;

let pending: { login: ManualLogin; expiresAt: number } | null = null;

export function beginPendingLogin(now = Date.now()): string {
  const login = startManualLogin();
  pending = { login, expiresAt: now + PENDING_LOGIN_TTL_MS };
  return login.url;
}

export async function finishPendingLogin(code: string, now = Date.now()): Promise<LoginResult> {
  const current = pending;
  if (!current) {
    throw new CliError("No manual login is pending. Call `login` with method \"code\" first.");
  }
  if (now > current.expiresAt) {
    pending = null;
    throw new CliError("The pending login expired. Call `login` with method \"code\" again.");
  }
  const trimmed = code.trim();
  if (!trimmed) throw new CliError("The code is empty. Ask the user for the code shown in the browser.");
  pending = null;
  try {
    return await completeManualLogin(current.login, trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `${message} The code is single-use, so start again by calling \`login\` with method "code".`,
    );
  }
}
