import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { AppError } from "#/errors";

/** The Agent User's name for one developer and Environment: `<h>_agent_<env>` (ADR 0010). */
export function agentUserName(gitEmail: string, environment: string): string {
  const hash = createHash("sha256").update(gitEmail.trim().toLowerCase()).digest("hex");
  return `${hash.slice(0, 8)}_agent_${environment}`;
}

/** Resolves an empty string when the key is unset, since git then exits non-zero. */
function gitConfigGlobal(key: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["config", "--global", key],
      (error: Readonly<Error> | null, stdout: string) => {
        resolve(error === null ? stdout.trim() : "");
      },
    );
  });
}

/**
 * Reads `user.email` from the global git config only, since the repository's config is writable
 * by the agent (ADR 0010).
 */
export async function readGlobalGitEmail(): Promise<string> {
  const email = await gitConfigGlobal("user.email");
  if (email === "") {
    throw new AppError(
      "GIT_EMAIL_MISSING",
      "No global git email is set, so the Agent User can't be named.",
      'Run `git config --global user.email "you@example.com"` in your own terminal.',
    );
  }
  return email;
}
