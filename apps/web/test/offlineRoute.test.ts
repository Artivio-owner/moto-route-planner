import { beforeEach, describe, expect, it } from "vitest";
import { loadLastRoute, saveLastRoute } from "../src/lib/offlineRoute";
import { route } from "./fixtures";

describe("последний маршрут без сети (X-07)", () => {
  beforeEach(() => window.localStorage.clear());

  it("возвращает сохранённый ответ только для того же запроса", () => {
    saveLastRoute("A", route, 1000);
    expect(loadLastRoute("A")).toEqual({ route, savedAt: 1000 });
    expect(loadLastRoute("B")).toBeNull();
  });

  it("повреждённая запись не ломает расчёт", () => {
    window.localStorage.setItem("versta.lastRoute.v1", "{не json");
    expect(loadLastRoute("A")).toBeNull();
  });
});
