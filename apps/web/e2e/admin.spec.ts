import { expect, test } from "@playwright/test";

// Админка Sveltia CMS (ADR-0013): страница открывается, вход по токену доступен,
// конфигурация без предупреждений схемы.
test("админка открывается без ошибок конфигурации", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (
      m.text().includes("configuration schema") ||
      (m.type() === "error" && m.text().includes("config"))
    ) {
      warnings.push(m.text());
    }
  });
  await page.goto("/admin/");
  await expect(page.getByRole("button", { name: /Access Token|токена доступа/i })).toBeVisible({
    timeout: 20000,
  });
  expect(warnings).toEqual([]);
});
