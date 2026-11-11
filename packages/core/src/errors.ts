export type ErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "UNKNOWN_ENVIRONMENT"
  | "RESTRICTED_ENVIRONMENT_UNSUPPORTED"
  | "GIT_EMAIL_MISSING"
  | "ADMIN_CREDENTIALS_MISSING"
  | "KEYCHAIN_UNAVAILABLE"
  | "SYNC_FAILED"
  | "NO_AGENT_ACCESS"
  | "QUERY_FAILED"
  | "QUERY_TIMED_OUT";

/**
 * A failure shown to a human or the agent: a stable `code` that never changes meaning, the cause
 * as the message, and the `nextStep` that fixes it.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly nextStep: string;

  constructor(
    code: ErrorCode,
    message: string,
    nextStep: string,
    options?: Readonly<ErrorOptions>,
  ) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.nextStep = nextStep;
  }
}

/** The message of anything thrown, for wrapping it in an `AppError`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Renders an error as plain text: `[CODE] cause` then `Next step: ...`. */
export function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return `[${error.code}] ${error.message}\nNext step: ${error.nextStep}`;
  }
  return `[UNEXPECTED] ${errorMessage(error)}\nNext step: Report this as a bug.`;
}
