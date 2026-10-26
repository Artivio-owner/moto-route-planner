import { describe, expect, it } from "vitest";
import { formatMoney, fromRub } from "./currency.js";

describe("валюты", () => {
  it("рубли не пересчитываются", () => {
    expect(fromRub(9000, "RUB", 90)).toBe(9000);
  });

  it("доллары по курсу", () => {
    expect(fromRub(9000, "USD", 90)).toBe(100);
  });

  it("отклоняет нулевой курс", () => {
    expect(() => fromRub(1, "USD", 0)).toThrow(RangeError);
  });

  it("формат с неразрывным пробелом", () => {
    expect(formatMoney(12345.6, "RUB")).toBe("12 346 ₽");
    expect(formatMoney(100, "USD")).toBe("100 $");
  });
});
