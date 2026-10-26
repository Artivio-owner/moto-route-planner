import { describe, expect, it } from "vitest";
import { sampleState } from "./fixtures.js";
import { STATE_HASH_PREFIX, decodeState, encodeState } from "./state.js";

describe("состояние в ссылке", () => {
  it("кодирование и декодирование дают то же состояние", async () => {
    const state = sampleState(true);
    const decoded = await decodeState(await encodeState(state));
    expect(decoded).toEqual(state);
  });

  it("сохраняет режим по километрам и необязательные поля", async () => {
    const state = sampleState(false);
    delete state.fuelPriceRub;
    delete state.rubPerUsd;
    expect(await decodeState(await encodeState(state))).toEqual(state);
  });

  it("строка годится для адреса без экранирования", async () => {
    expect(await encodeState(sampleState(true))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("повреждённая ссылка даёт понятную ошибку", async () => {
    await expect(decodeState("не-ссылка")).rejects.toThrow(/Ссылка повреждена/);
    await expect(decodeState("AAAA")).rejects.toThrow(/Ссылка повреждена/);
  });

  // Спайк X-09: длина ссылки для длинного маршрута. Результат записан в docs/spikes/x09-link-length.md.
  it("Сочи — Владивосток через 25 точек укладывается в 2000 знаков", async () => {
    const encoded = await encodeState(sampleState(true));
    const url = `https://versta.example${"/"}${STATE_HASH_PREFIX}${encoded}`;
    expect(url.length).toBeLessThan(2000);
  });
});
