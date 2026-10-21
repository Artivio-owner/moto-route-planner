// Топливо: docs/14-trip-parameters-spec.md (разделы 1–2), задачи C-02 и C-16.

/** Доля бака, которую оставляем в резерве при расчёте запаса хода. */
export const RANGE_RESERVE = 0.1;

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} должно быть положительным числом, получено ${value}`);
  }
}

/** Запас хода, км: бак ÷ расход × 100 × (1 − резерв). */
export function rangeKm(tankL: number, consumptionLPer100Km: number): number {
  assertPositive("Объём бака", tankL);
  assertPositive("Расход", consumptionLPer100Km);
  return (tankL / consumptionLPer100Km) * 100 * (1 - RANGE_RESERVE);
}

/** Литры на маршрут для всей группы: расход одинаковый у всех мотоциклов. */
export function fuelLiters(
  distanceKm: number,
  consumptionLPer100Km: number,
  motorcycles: number,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError(`Расстояние не может быть отрицательным, получено ${distanceKm}`);
  }
  assertPositive("Расход", consumptionLPer100Km);
  assertPositive("Число мотоциклов", motorcycles);
  return ((distanceKm * consumptionLPer100Km) / 100) * motorcycles;
}

/** Стоимость топлива в валюте цены. */
export function fuelCost(liters: number, pricePerLiter: number): number {
  if (!Number.isFinite(pricePerLiter) || pricePerLiter < 0) {
    throw new RangeError(`Цена не может быть отрицательной, получено ${pricePerLiter}`);
  }
  return liters * pricePerLiter;
}
