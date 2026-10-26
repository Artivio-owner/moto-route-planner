import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("./fixtures/route.json", import.meta.url), "utf8");

const places: Record<string, { name: string; description: string; lat: number; lon: number }> = {
  Старт: { name: "Старт", description: "Московская область, Россия", lat: 55.0, lon: 37.0 },
  Финиш: { name: "Финиш", description: "Московская область, Россия", lat: 55.0, lon: 38.7 },
};

async function mockApi(page: Page) {
  await page.route("**/api/route", (r) =>
    r.fulfill({ contentType: "application/json", body: route }),
  );
  await page.route("**/api/geocode**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const found = Object.values(places).filter((p) => p.name.startsWith(q.slice(0, 3)));
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ places: found }) });
  });
  await page.route("**/api/reverse**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ place: { name: "Деревня", description: "", lat: 55, lon: 37.5 } }),
    }),
  );
}

async function pick(page: Page, field: string, text: string) {
  const input = page.getByRole("combobox", { name: field });
  await input.fill(text);
  await page.getByRole("option", { name: new RegExp(text) }).click();
}

test("лендинг ведёт в планировщик", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Рассчитайте мотопоездку");
  await page.getByRole("link", { name: "Построить маршрут" }).first().click();
  await expect(page.getByRole("heading", { name: "Маршрут" })).toBeVisible();
});

test("маршрут, дни, ссылка, PDF и GPX", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");

  const sheet = page.locator("section[aria-labelledby=sheet-title]");
  await expect(sheet.locator(".figure").first()).toHaveText("131 км");
  await expect(page.getByText(/День 1 ·/)).toBeVisible();
  await expect(sheet.getByText("ориентировочно").first()).toBeVisible();
  await expect(page).toHaveURL(/\/plan#r=[A-Za-z0-9_-]+$/);

  // Два мотоцикла: литров вдвое больше.
  await page.getByRole("group", { name: "Мотоциклов" }).getByRole("button", { name: "2" }).click();
  await expect(sheet.getByText("(на 2 мотоцикла)")).toBeVisible();

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Скачать PDF" }).click(),
  ]);
  expect((await pdf.path()) && (await readPdfHead(pdf))).toBe("%PDF-");

  const [gpx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "GPX" }).click(),
  ]);
  const gpxText = readFileSync((await gpx.path()) as string, "utf8");
  expect(gpxText).toContain('<gpx version="1.1"');
  expect(gpxText).toContain("<name>Старт</name>");
});

async function readPdfHead(download: { path(): Promise<string | null> }): Promise<string> {
  const path = await download.path();
  return path ? readFileSync(path).subarray(0, 5).toString("latin1") : "";
}

test("ссылка восстанавливает маршрут", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await expect(page).toHaveURL(/#r=/);
  const url = page.url();
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await fresh.goto(url);
  await expect(fresh.getByRole("combobox", { name: "Откуда, точка 1" })).toHaveValue("Старт");
  await expect(fresh.getByText(/День 1 ·/)).toBeVisible();
});

test("повреждённая ссылка: понятное сообщение", async ({ page }) => {
  await page.goto("/plan#r=broken");
  await expect(page.getByRole("alert").first()).toContainText("Ссылка повреждена");
});

test("нет горизонтальной прокрутки", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
