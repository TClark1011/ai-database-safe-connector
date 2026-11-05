import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { setup: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  dts: false,
  deps: {
    alwaysBundle: [/.*/],
  },
});
