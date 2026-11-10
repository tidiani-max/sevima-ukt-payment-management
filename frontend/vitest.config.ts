import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Component + service tests (jsdom). Pure-logic tests in src/lib/*.test.ts run on Node's built-in runner (`npm run test:unit`).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { environment: "jsdom", include: ["src/**/*.spec.{ts,tsx}"], setupFiles: ["./src/test/setup.ts"], globals: false, restoreMocks: true },
});
