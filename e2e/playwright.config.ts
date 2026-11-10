import { defineConfig } from "@playwright/test";

// Runs against the live Docker demo stack (Nginx -> NestJS -> PostgreSQL). Start it first: docker compose up -d --build --wait
export default defineConfig({
  testDir: "./tests",
  workers: 1, // one shared database; the lifecycle spec is a serial story
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8080", viewport: { width: 1440, height: 900 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
