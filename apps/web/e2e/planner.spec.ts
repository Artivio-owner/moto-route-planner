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
  await page.route("**/api/weather**", (r) => {
    const date = new URL(r.request().url()).searchParams.get("date");
    return r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        weather: {
          kind: "forecast",
          date,
          tempMaxC: 22,
          tempMinC: 11,
          precipitationMm: 7,
          windMaxKmh: 20,
          weatherCode: 61,
        },
      }),
    });
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
  // Пока владелец не указал ссылку на донат, блока поддержки нет.
  await expect(page.getByRole("complementary", { name: "Поддержать разработчика" })).toHaveCount(0);
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
  await expect(sheet.getByText(/дождь, \+11…\+22 °C/).first()).toBeVisible();
  await expect(sheet.getByText(/Возможен дождь/).first()).toBeVisible();
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
    page.getByRole("button", { name: "GPX", exact: true }).click(),
  ]);
  const gpxText = readFileSync((await gpx.path()) as string, "utf8");
  expect(gpxText).toContain('<gpx version="1.1"');
  expect(gpxText).toContain("<name>Старт</name>");
});

async function readPdfHead(download: { path(): Promise<string | null> }): Promise<string> {
  const path = await download.path();
  return path ? readFileSync(path).subarray(0, 5).toString("latin1") : "";
}

test("разбивка по числу дней и закат в дне", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await page
    .getByRole("group", { name: "Дни" })
    .getByRole("button", { name: "По числу дней" })
    .click();
  const days = page.getByLabel(/Уложиться в/);
  await days.fill("3");
  await days.press("Enter");
  await expect(page.getByRole("list", { name: "Дни поездки" }).getByRole("listitem")).toHaveCount(
    3,
  );
  await expect(page.getByText(/закат \d\d:\d\d/).first()).toBeVisible();
});

test("дневка: день отдыха в путевом листе и в ссылке (C-11)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await page
    .getByRole("group", { name: "Дни" })
    .getByRole("button", { name: "По числу дней" })
    .click();
  const daysField = page.getByLabel(/Уложиться в/);
  await daysField.fill("2");
  await daysField.press("Enter");
  const items = page.getByRole("list", { name: "Дни поездки" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  let url = page.url();
  await page.getByRole("button", { name: "Дневка после этого дня" }).click();
  await expect(items).toHaveCount(3);
  await expect(page.getByText(/День 2 · .* · дневка/)).toBeVisible();
  await expect(page.getByText(/из них дневок: 1/)).toBeVisible();
  url = await nextUrl(page, url);
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await fresh.goto(url);
  await expect(fresh.getByText(/· дневка/)).toBeVisible();
  await fresh.getByRole("button", { name: "Убрать дневку" }).click();
  await expect(fresh.getByRole("list", { name: "Дни поездки" }).getByRole("listitem")).toHaveCount(
    2,
  );
});

test("импорт GPX: точки из файла, маршрут строится (X-05)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="Test"><trk><trkseg>
    <trkpt lat="55.0" lon="37.0"/><trkpt lat="55.0" lon="37.8"/><trkpt lat="55.0" lon="38.7"/>
  </trkseg></trk></gpx>`;
  await page.getByLabel("GPX-файл").setInputFiles({
    name: "track.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx),
  });
  await expect(page.locator(".toast")).toContainText("GPX загружен");
  await expect(page.getByRole("combobox", { name: "Откуда, точка 1" })).toHaveValue("Деревня");
  await expect(page.getByRole("combobox", { name: "Куда, точка 3" })).toBeVisible();
  await expect(page.getByText(/День 1 ·/)).toBeVisible();
});

test("импорт GPX: понятная ошибка для чужого файла", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await page.getByLabel("GPX-файл").setInputFiles({
    name: "notes.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("просто текст"),
  });
  await expect(page.locator(".toast")).toContainText("Не удалось открыть GPX: Это не GPX-файл");
});

test("избегание платных и магистралей уходит в запрос и в ссылку (M-02)", async ({ page }) => {
  await mockApi(page);
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/route")) bodies.push(r.postDataJSON() as Record<string, unknown>);
  });
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await expect(page.getByText(/День 1 ·/)).toBeVisible();
  await expect(page).toHaveURL(/#r=/);
  let url = page.url();
  await page.getByLabel("Избегать платных дорог").check();
  url = await nextUrl(page, url);
  await page.getByLabel("Избегать автомагистралей").check();
  url = await nextUrl(page, url);
  await expect.poll(() => bodies.at(-1)?.["avoidMotorways"]).toBe(true);
  expect(bodies.at(-1)?.["avoidToll"]).toBe(true);
  await expect(page.getByText(/Если объезда нет/)).toBeVisible();
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await fresh.goto(url);
  await expect(fresh.getByLabel("Избегать платных дорог")).toBeChecked();
  await expect(fresh.getByLabel("Избегать автомагистралей")).toBeChecked();
});

test("граница: предупреждение и цены топлива по странам (R-10)", async ({ page }) => {
  await mockApi(page);
  const abroad = JSON.parse(route) as { zones: { fromKm: number; timeZone: string }[] };
  abroad.zones = [
    { fromKm: 0, timeZone: "Europe/Samara" },
    { fromKm: 60, timeZone: "Asia/Oral" },
  ];
  await page.route("**/api/route", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(abroad) }),
  );
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await expect(page.getByText(/Граница: Россия → Казахстан/)).toBeVisible();
  await expect(page.getByText(/Страны: Россия → Казахстан/)).toBeVisible();
});

test("без сети: последний расчёт из сохранённой копии (X-07)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await expect(page.getByText(/День 1 ·/)).toBeVisible();
  await expect(page).toHaveURL(/#r=/);
  await page.route("**/api/**", (r) => r.abort("internetdisconnected"));
  await page.reload();
  await expect(page.getByText(/Нет сети: показан расчёт, сохранённый/)).toBeVisible();
  await expect(page.getByText(/День 1 ·/)).toBeVisible();
});

test("АЗС и ночлег вдоль маршрута (P-07)", async ({ page }) => {
  await mockApi(page);
  const withPois = JSON.parse(route) as Record<string, unknown>;
  withPois.pois = [
    { kind: "fuel", name: "Тест-АЗС", lat: 55, lon: 37.5, km: 30, offKm: 0.1 },
    { kind: "guest_house", name: "Гостевой дом «Привал»", lat: 55, lon: 37.9, km: 88, offKm: 0.8 },
  ];
  await page.route("**/api/route", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(withPois) }),
  );
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await page
    .getByRole("group", { name: "Дни" })
    .getByRole("button", { name: "По числу дней" })
    .click();
  const days = page.getByLabel(/Уложиться в/);
  await days.fill("2");
  await days.press("Enter");
  await expect(page.getByText(/АЗС на участке 1/)).toBeVisible();
  await expect(page.getByText(/Ночлег у финиша: Гостевой дом «Привал»/)).toBeVisible();
  await expect(page.getByText(/заправки на АЗС из OpenStreetMap/)).toBeVisible();
});

/** Ссылка обновляется асинхронно: ждём, пока адрес изменится. */
async function nextUrl(page: Page, previous: string): Promise<string> {
  await expect.poll(() => page.url()).not.toBe(previous);
  return page.url();
}

test("бюджет в путевом листе и сохранение в ссылке", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plan");
  await pick(page, "Откуда, точка 1", "Старт");
  await pick(page, "Куда, точка 2", "Финиш");
  await expect(page.getByText("бюджет поездки")).toBeVisible();
  await expect(page).toHaveURL(/#r=/);
  let url = page.url();
  await page.getByRole("group", { name: "Жильё" }).getByRole("button", { name: "Кемпинг" }).click();
  url = await nextUrl(page, url);
  const other = page.getByLabel(/^Прочее/);
  await other.fill("1500");
  await other.press("Enter");
  await expect(page.locator(".budget-table")).toContainText("Прочее");
  url = await nextUrl(page, url);
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await fresh.goto(url);
  await expect(
    fresh.getByRole("group", { name: "Жильё" }).getByRole("button", { name: "Кемпинг" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(fresh.locator(".budget-table")).toContainText("Прочее");
});

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
