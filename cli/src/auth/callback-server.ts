import { timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { appUrl } from "../config";
import { CliError } from "../errors";

export type CallbackServer = {
  redirectUri: string;
  waitForCode: () => Promise<string>;
};

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

type Outcome = "success" | "cancelled" | "error";

function redirectToResult(res: ServerResponse, outcome: Outcome) {
  res.writeHead(302, {
    Location: `${appUrl()}/oauth/complete?status=${outcome}`,
    "Cache-Control": "no-store",
    Connection: "close",
  });
  res.end();
}

function send(res: ServerResponse, status: number, body: string, contentType: string) {
  res.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "no-store",
    Connection: "close",
  });
  res.end(body);
}

function sameState(received: string | null, expected: string) {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function startCallbackServer(
  state: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CallbackServer> {
  return new Promise((resolveStart, rejectStart) => {
    let settle: (result: { code: string } | { error: CliError }) => void = () => {};
    const outcome = new Promise<string>((resolve, reject) => {
      settle = (result) => ("code" in result ? resolve(result.code) : reject(result.error));
    });
    // The caller may attach its handler after this promise has already rejected.
    outcome.catch(() => undefined);

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        send(res, 404, "Not found", "text/plain");
        return;
      }
      if (req.method !== "GET") {
        send(res, 405, "Method not allowed", "text/plain");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      let failure: CliError | null = null;
      let cancelled = false;
      if (!sameState(url.searchParams.get("state"), state)) {
        failure = new CliError("Login failed: state mismatch. Run `layerum login` again.");
      } else if (error === "access_denied") {
        failure = new CliError("Login was cancelled in the browser.");
        cancelled = true;
      } else if (error) {
        failure = new CliError(`Login failed: ${error.slice(0, 200)}`);
      } else if (!code) {
        failure = new CliError("Login failed: the callback had no authorization code.");
      }

      if (failure) {
        redirectToResult(res, cancelled ? "cancelled" : "error");
        settle({ error: failure });
      } else {
        redirectToResult(res, "success");
        settle({ code: code as string });
      }
      server.close();
      server.closeAllConnections();
      clearTimeout(timer);
    });

    const timer = setTimeout(() => {
      settle({ error: new CliError("Login timed out after 5 minutes. Run `layerum login` again.") });
      server.close();
      server.closeAllConnections();
    }, timeoutMs);

    server.once("error", (error) => {
      clearTimeout(timer);
      rejectStart(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolveStart({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode: () => outcome,
      });
    });
  });
}
