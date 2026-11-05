import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { mcp: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  dts: false,
  deps: {
    alwaysBundle: [/.*/u],
  },
});
