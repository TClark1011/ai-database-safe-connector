import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { "fake-mcp": "src/fake-mcp.ts" },
  format: ["esm"],
  platform: "node",
  dts: false,
  deps: {
    alwaysBundle: [/.*/u],
    neverBundle: ["@napi-rs/keyring"],
  },
});
