import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  build: { sourcemap: false, minify: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
    strictPort: true,
    // Same-origin API in development too: the browser talks only to Vite, which forwards /api to the backend container.
    proxy: { "/api": { target: process.env.VITE_DEV_PROXY_TARGET || "http://localhost:3000", changeOrigin: false } },
  },
  preview: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
  },
});
