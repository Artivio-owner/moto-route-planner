import { defineConfig, devices } from "@playwright/test";

// Браузерные тесты: API подменяется в самих тестах, движок не нужен.
// Локально можно указать готовый Chromium: PW_CHROMIUM=/path/to/chrome.
const executablePath = process.env.PW_CHROMIUM;

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
