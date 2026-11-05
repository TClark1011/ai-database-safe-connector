# Threat model: the agent's shell is sandboxed

Security assumes the Harness sandboxes the agent's shell, so it can't write outside the project, read the OS keychain or tamper with the installed bundles. An agent with unrestricted shell access, running as the user's OS account, could read keychain entries or fake a terminal session to answer the approval fallback. This project doesn't try to defend against that. It documents the requirement and, where the Harness allows, warns when the sandbox is missing.
