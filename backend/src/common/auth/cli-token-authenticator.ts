export abstract class CliTokenAuthenticator {
  abstract authenticate(token: string): Promise<string>;
}
