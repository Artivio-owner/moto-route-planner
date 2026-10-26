// Бюджет поездки: docs/07-budget-spec.md, задача C-05.
// Бюджет = Топливо + Жильё + Еда + Кофе на заправках + Прочее (+ резерв в процентах).

export const LODGING_TYPES = ["hotel3", "hotel4", "hotel5", "guesthouse", "camping"] as const;
export type LodgingType = (typeof LODGING_TYPES)[number];

export const LODGING_LABELS: Record<LodgingType, string> = {
  hotel3: "Отель 3★",
  hotel4: "Отель 4★",
  hotel5: "Отель 5★",
  guesthouse: "Гостевой дом",
  camping: "Кемпинг",
};

export const FOOD_LEVELS = ["economy", "medium", "high"] as const;
export type FoodLevel = (typeof FOOD_LEVELS)[number];

export const FOOD_LABELS: Record<FoodLevel, string> = {
  economy: "Эконом",
  medium: "Средний",
  high: "Высокий",
};

export interface BudgetInput {
  /** Дней в пути (еда считается на каждый). */
  days: number;
  /** Ночей между днями (дни минус 1). */
  nights: number;
  /** Ночь в конечной точке добавляется переключателем. */
  finalNight: boolean;
  people: number;
  /** Номеров на ночь: 1 или 2. */
  rooms: number;
  roomPriceRub: number;
  foodPerPersonDayRub: number;
  fuelCostRub: number;
  fuelStops: number;
  coffee: boolean;
  coffeePriceRub: number;
  /** Платные дороги, паромы и прочее, вводится вручную. */
  otherRub: number;
  /** Резерв на ремонт и непредвиденное, % от суммы статей. */
  reservePct: number;
}

export interface Budget {
  fuel: number;
  lodging: number;
  food: number;
  coffee: number;
  other: number;
  reserve: number;
  total: number;
  perPerson: number;
  nightsPaid: number;
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name}: значение не может быть отрицательным`);
}

export function computeBudget(input: BudgetInput): Budget {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === "number") assertNonNegative(name, value);
  }
  const nightsPaid = input.nights + (input.finalNight ? 1 : 0);
  const fuel = input.fuelCostRub;
  // Жильё за номер, а не за человека (спецификация 07).
  const lodging = nightsPaid * input.rooms * input.roomPriceRub;
  const food = input.days * input.people * input.foodPerPersonDayRub;
  const coffee = input.coffee ? input.fuelStops * input.people * input.coffeePriceRub : 0;
  const other = input.otherRub;
  const subtotal = fuel + lodging + food + coffee + other;
  const reserve = (subtotal * input.reservePct) / 100;
  const total = subtotal + reserve;
  return {
    fuel,
    lodging,
    food,
    coffee,
    other,
    reserve,
    total,
    perPerson: total / Math.max(1, input.people),
    nightsPaid,
  };
}
