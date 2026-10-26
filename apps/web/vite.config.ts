/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@data": `${root}data` },
  },
  server: {
    fs: { allow: [root] },
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8080" },
  },
  preview: {
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8080" },
  },
  build: { chunkSizeWarningLimit: 1500 },
  worker: { format: "es" },
  test: { environment: "jsdom", include: ["test/**/*.test.ts"] },
});
