import type { CredentialStore } from "#/credential-store";
import { AppError, errorMessage } from "#/errors";
import { productName } from "#/product";

type Keyring = typeof import("@napi-rs/keyring");

function keychainUnavailable(error: unknown): AppError {
  return new AppError(
    "KEYCHAIN_UNAVAILABLE",
    `The OS keychain can't be used: ${errorMessage(error)}`,
    "Unlock the OS keychain (on Linux, start a Secret Service such as GNOME Keyring), then query again.",
    { cause: error },
  );
}

/** Stores credentials in the OS keychain, pinned to Secret Service on Linux (ADR 0013). */
export function createKeyringCredentialStore(): CredentialStore {
  // Loaded on first use: the native module ships next to the bundle instead of inside it.
  let keyring: Promise<Keyring> | undefined;
  const entry = async (key: string) => {
    keyring ??= import("@napi-rs/keyring");
    const { AsyncEntry } = await keyring;
    return new AsyncEntry(productName, key, { linux: { store: "secret-service" } });
  };

  return {
    get: async (key) => {
      try {
        return await (await entry(key)).getPassword();
      } catch (error) {
        throw keychainUnavailable(error);
      }
    },
    set: async (key, value) => {
      try {
        await (await entry(key)).setPassword(value);
      } catch (error) {
        throw keychainUnavailable(error);
      }
    },
  };
}
