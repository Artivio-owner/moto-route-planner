import { describe, expect, it } from "vitest";
import { readHistory, saveToHistory, type HistoryStore } from "../src/state/history";

function memory(): HistoryStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const DAY = 86400000;

describe("история на 30 дней (X-08)", () => {
  it("новые записи сверху, тот же маршрут не дублируется", () => {
    const store = memory();
    saveToHistory({ encoded: "a", title: "Сочи — Москва", startDate: "2026-07-01" }, 1000, store);
    saveToHistory({ encoded: "b", title: "Тверь — Псков", startDate: "2026-07-01" }, 2000, store);
    const list = saveToHistory(
      { encoded: "c", title: "Сочи — Москва", startDate: "2026-07-02" },
      3000,
      store,
    );
    expect(list.map((e) => e.encoded)).toEqual(["c", "b"]);
  });

  it("записи старше 30 дней удаляются", () => {
    const store = memory();
    saveToHistory({ encoded: "old", title: "Старый", startDate: "2026-01-01" }, 0, store);
    saveToHistory({ encoded: "new", title: "Новый", startDate: "2026-02-01" }, 20 * DAY, store);
    expect(readHistory(31 * DAY, store).map((e) => e.encoded)).toEqual(["new"]);
  });

  it("не больше 10 записей", () => {
    const store = memory();
    for (let i = 0; i < 15; i++)
      saveToHistory({ encoded: `r${i}`, title: `Маршрут ${i}`, startDate: "2026-07-01" }, i, store);
    expect(readHistory(20, store)).toHaveLength(10);
  });

  it("без хранилища история пуста, ошибок нет", () => {
    expect(readHistory(0, null)).toEqual([]);
  });
});
