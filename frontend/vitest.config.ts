import { defineConfig } from "vitest/config";
export default defineConfig({
  define: { "import.meta.env.VITE_DEMO_MODE": JSON.stringify("true") },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    maxWorkers: 1,
    minWorkers: 1,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
