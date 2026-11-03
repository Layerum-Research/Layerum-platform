import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { getMe } from "../api/auth";
import { revokeToken } from "../auth/oauth";
import { openBrowser } from "../auth/browser";
import { completeManualLogin, type LoginResult, currentSession, startLogin, startManualLogin } from "../auth/login";
import { CliError } from "../errors";
import { deleteCredentials, readCredentials, writeConfig } from "../config";
import { printJson } from "../output";
import { globals, handle } from "./run";

async function promptForCode(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const code = (await rl.question("Paste the code from the browser: ")).trim();
    if (!code) throw new CliError("No code entered.");
    return code;
  } finally {
    rl.close();
  }
}

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("Log in with your browser")
    .option("--force", "log in again even if already logged in")
    .option("--code", "show a code in the browser and paste it here (for SSH and containers)")
    .action(
      handle(async (options: { force?: boolean; code?: boolean }, command: Command) => {
        const { json } = globals(command);
        if (!options.force) {
          const me = await currentSession();
          if (me) {
            if (json) printJson({ loggedIn: true, user: { id: me.id, email: me.email } });
            else console.log(`Already logged in as ${me.email}. Use --force to log in again.`);
            return;
          }
        }

        let result: LoginResult;
        if (options.code) {
          if (!process.stdin.isTTY) {
            throw new CliError("`layerum login --code` needs an interactive terminal to paste the code into.");
          }
          const login = startManualLogin();
          console.error("Open this URL, authorize, and copy the code it shows:");
          console.error(login.url);
          await openBrowser(login.url);
          result = await completeManualLogin(login, await promptForCode());
        } else {
          const flow = await startLogin();
          console.error("Opening your browser to log in. If it does not open, visit:");
          console.error(flow.url);
          console.error("On a machine without a usable browser, run `layerum login --code` instead.");
          await openBrowser(flow.url);
          result = await flow.completion;
        }

        if (json) {
          printJson({ loggedIn: true, user: result.user, workspace: result.workspace });
          return;
        }
        console.log(`Logged in as ${result.user.email}.`);
        if (result.workspace) console.log(`Using workspace ${result.workspace.name}.`);
        else console.log("Pick a workspace with `layerum workspaces` and `layerum use <workspace>`.");
      }),
    );

  program
    .command("logout")
    .description("Log out and revoke the token")
    .action(
      handle(async (_options: unknown, command: Command) => {
        const { json } = globals(command);
        const credentials = await readCredentials();
        if (!credentials) {
          if (json) printJson({ loggedOut: false, reason: "not logged in" });
          else console.log("Not logged in.");
          return;
        }

        let revokeError: string | null = null;
        try {
          await revokeToken(credentials.apiUrl, credentials.accessToken);
        } catch (error) {
          revokeError = error instanceof Error ? error.message : String(error);
        }
        await deleteCredentials();
        await writeConfig({});

        if (json) printJson({ loggedOut: true, revoked: revokeError === null, revokeError });
        else console.log("Logged out.");
        if (revokeError) {
          console.error(`Server-side revoke failed (${revokeError}); the token may stay valid until it expires.`);
        }
      }),
    );

  program
    .command("whoami")
    .description("Show the logged-in user")
    .action(
      handle(async (_options: unknown, command: Command) => {
        const me = await getMe();
        if (globals(command).json) {
          printJson(me);
          return;
        }
        console.log(`${me.full_name ? `${me.full_name} <${me.email}>` : me.email}`);
        console.log(`id: ${me.id}`);
      }),
    );
}
