import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["src/tests/setup.ts"],
  },
});
