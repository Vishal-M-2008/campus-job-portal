import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./src/test/setupEnv.ts"],
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
