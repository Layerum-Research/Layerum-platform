export class CliError extends Error {}

export class NotLoggedInError extends CliError {
  constructor() {
    super("Not logged in. Run `layerum login`.");
  }
}

export class ApiError extends CliError {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly path: string,
  ) {
    super(message);
  }
}
