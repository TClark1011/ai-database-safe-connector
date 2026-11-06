# @napi-rs/keyring across operating systems

Ticket: #13 (child of map #4). Context: ADR 0005 (OS keychain), ADR 0008 (GitHub Release zip per OS with the keychain native module).

## Answer

- **Prebuilt binaries: yes.** v2.1.2 (npm, MIT, modified 2026-10-19) ships one prebuilt `.node` per platform as separate npm packages listed in `optionalDependencies`. Covered: macOS arm64 and x64, Windows x64/arm64/ia32 (msvc), Linux x64/arm64 (gnu and musl), plus riscv64-gnu, arm-gnueabihf and freebsd-x64. No compile step for users.
- **Bundling with tsdown: the `.node` file cannot live inside the `.mjs`.** The generated `index.js` loader `require()`s a native file at runtime. Recommended path for ADR 0008: keep the package external (tsdown's default for `dependencies`/`optionalDependencies`) and ship, per OS zip, `mcp.mjs`/`setup.mjs` plus a `node_modules/@napi-rs/keyring` (loader) and that OS's `@napi-rs/keyring-<triple>` package next to them. Alternative: inline the JS loader and ship the `.node` as a sibling file (loader tries `./keyring.<triple>.node` first) or point `NAPI_RS_NATIVE_LIBRARY_PATH` at it. The alternative is UNTESTED here.
- **Linux: Secret Service first, silent fallback to kernel keyutils.** keyutils is in-memory and lost on reboot, so on headless Linux (no D-Bus / no keyring daemon) a credential saved by `setup` can vanish. For ADR 0005 ("Linux Secret Service") pin the store: `{ linux: { store: 'secret-service' } }` so it throws instead of silently falling back. Headless Linux then cannot use the keychain at all; the project needs a decision on that (see Open questions).
- Linux binaries statically link libdbus (AFL-2.1 OR GPL-2.0-or-later); each Linux platform package ships `LICENSE.third-party.md`. Include those notices in the release zip.

## Details

### Platform packages (from `npm view @napi-rs/keyring optionalDependencies`, 2.1.2)

`darwin-x64`, `darwin-arm64`, `linux-x64-gnu`, `linux-x64-musl`, `linux-arm64-gnu`, `linux-arm64-musl`, `linux-arm-gnueabihf`, `linux-riscv64-gnu`, `win32-x64-msvc`, `win32-arm64-msvc`, `win32-ia32-msvc`, `freebsd-x64`.

- The loader source also references android and `darwin-universal`, but these are not in `optionalDependencies`, so they are not published prebuilds for this version (inferred).
- Unpacked sizes: darwin-arm64 about 0.6 MB, win32-x64-msvc about 2.0 MB, linux-x64-gnu about 3.4 MB.
- `engines.node` is `>= 10`; no conflict with Node 24+.
- It is a binding over keyring-rs, with a keytar-compatible API (`keytar.js`) and `Entry`/`AsyncEntry` classes with `setPassword`/`getPassword`/`deletePassword`.

### Native file loading (read from the published `index.js`, 2.1.2)

Order, per platform: (1) `NAPI_RS_NATIVE_LIBRARY_PATH` env var if set; (2) `require('./keyring.<triple>.node')` beside `index.js`; (3) `require('@napi-rs/keyring-<triple>')` (the platform package). On Linux it detects musl vs glibc at runtime (filesystem, process report, then `ldd --version`). `NAPI_RS_ENFORCE_VERSION_CHECK` makes it fail on loader/binary version mismatch.

- All paths are dynamic `require`s of `.node` files; a bundler cannot embed a native addon into JS output.
- tsdown default: `dependencies`, `peerDependencies`, `optionalDependencies` are external; `deps.alwaysBundle` forces bundling, `deps.neverBundle` forces external. The tsdown deps page does not mention `.node` addons.
- Implication for the monorepo: list `@napi-rs/keyring` in the `dependencies` of the package that uses it so tsdown keeps it external, or set `deps.neverBundle` explicitly. `.mjs` output uses ESM, so the CJS loader is loaded via `import`, which Node handles for external packages (not tested here).
- Per-OS zip must contain the right platform package. With pnpm, install only needs the matching optional package for that OS; the release workflow must install per target (cross-OS install may need pnpm `supportedArchitectures`, unverified).
- Not verified: whether `mcp.mjs` run from `~/.claude/ai-database-safety-experiment/` resolves `node_modules/` beside it (standard Node resolution says yes, since resolution walks up from the file).

### Linux caveats

- Auto-selection: Secret Service (gnome-keyring, KWallet, KeePassXC etc.) tried first; if none available, silently falls back to keyutils.
- keyutils: kernel keyring, in-memory, not persisted across reboots (README).
- Pinning a store makes the constructor throw if unavailable; no fallback.
- Secret Service needs a D-Bus session bus and a running provider. Headless servers, containers, WSL without a daemon, and SSH sessions usually lack one (general knowledge, not confirmed in the cited docs). Locked-collection unlock prompts are also a possible issue (unverified).
- keyring-rs docs.rs page only confirms Linux store crates (dbus secret service, zbus secret service, keyutils) exist; the keyring-rs wiki was not fetched, so its Linux notes are unverified.
- Security note for ADR 0007: keyutils entries are readable by same-user processes via the kernel keyring (assumption, not verified); the threat model already assumes a sandboxed agent shell.

## Open questions

- Headless Linux policy: fail with a clear error, or allow keyutils for the session? Needs a decision.
- Prototype test: tsdown build of an entry importing `@napi-rs/keyring`, run from an extracted zip, on macOS, Windows and Linux. Not done.
- Windows/macOS behaviour (Credential Manager value size limits, Keychain access prompts for unsigned binaries) not researched.

## Sources

- https://github.com/Brooooooklyn/keyring-node (README: platforms, Linux store pinning, keyutils note, libdbus licensing)
- https://www.npmjs.com/package/@napi-rs/keyring (package metadata read via `npm view` and the published 2.1.2 tarball `index.js`)
- https://tsdown.dev/options/dependencies (external/bundled defaults, `deps` options)
- https://docs.rs/keyring/latest/keyring/ (keyring-rs crate; Linux store crates)
- https://github.com/open-source-cooperative/keyring-rs/wiki/Keyring (linked from docs.rs; not fetched)
