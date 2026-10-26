import { describe, expect, it } from "vitest";
import { computeBudget, type BudgetInput } from "./budget.js";

const base: BudgetInput = {
  days: 3,
  nights: 2,
  finalNight: false,
  people: 2,
  rooms: 1,
  roomPriceRub: 5000,
  foodPerPersonDayRub: 2000,
  fuelCostRub: 9000,
  fuelStops: 5,
  coffee: false,
  coffeePriceRub: 200,
  otherRub: 0,
  reservePct: 0,
};

describe("бюджет (критерии приёмки спецификации 07)", () => {
  it("3 дня, 2 человека, 1 номер: жильё за номер на 2 ночи, а не за двоих", () => {
    expect(computeBudget(base).lodging).toBe(10000);
  });

  it("кофе на заправках: 5 заправок × людей × цена", () => {
    expect(computeBudget({ ...base, coffee: true }).coffee).toBe(5 * 2 * 200);
  });

  it("маршрут в один день: жильё 0, еда за 1 день", () => {
    const b = computeBudget({ ...base, days: 1, nights: 0 });
    expect(b.lodging).toBe(0);
    expect(b.food).toBe(2 * 2000);
  });

  it("ночь в конечной точке добавляется переключателем", () => {
    expect(computeBudget({ ...base, finalNight: true }).nightsPaid).toBe(3);
  });

  it("резерв в процентах от суммы статей и итог на человека", () => {
    const b = computeBudget({ ...base, reservePct: 10, otherRub: 1000 });
    const subtotal = 9000 + 10000 + 12000 + 1000;
    expect(b.reserve).toBeCloseTo(subtotal * 0.1);
    expect(b.total).toBeCloseTo(subtotal * 1.1);
    expect(b.perPerson).toBeCloseTo((subtotal * 1.1) / 2);
  });

  it("отрицательные значения отклоняются", () => {
    expect(() => computeBudget({ ...base, otherRub: -1 })).toThrow(RangeError);
  });
});
