import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { hooks: "src/hooks.ts" },
  format: ["esm"],
  platform: "node",
  dts: false,
  deps: {
    alwaysBundle: [/.*/],
  },
});
