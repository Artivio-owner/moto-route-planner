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

/**
 * Отметки заправок, км от старта. Выезжаем с полным баком и заправляемся,
 * когда до конца запаса хода остаётся не больше одного отрезка: заправки
 * ставятся через каждые rangeKm. С реальными АЗС: fuelStopsAtStations (v0.3, P-07).
 */
export function fuelStopsKm(distanceKm: number, range: number): number[] {
  assertPositive("Запас хода", range);
  const stops: number[] = [];
  for (let km = range; km < distanceKm; km += range) stops.push(km);
  return stops;
}

/** Участок, где до следующей АЗС дальше запаса хода. */
export interface FuelGap {
  /** Последняя заправка (или старт) перед участком, км. */
  fromKm: number;
  /** Следующая АЗС или финиш, км. */
  toKm: number;
}

/**
 * Заправки на реальных АЗС (v0.3, P-07): от каждой заправки едем до самой дальней АЗС
 * в пределах запаса хода. Если АЗС в пределах запаса нет, ставим условную заправку на
 * границе запаса и отмечаем участок без АЗС: там нужна канистра или заправка заранее.
 */
export function fuelStopsAtStations(
  distanceKm: number,
  range: number,
  stationsKm: readonly number[],
): { stops: number[]; gaps: FuelGap[] } {
  assertPositive("Запас хода", range);
  const stations = [...stationsKm].filter((k) => k > 0 && k < distanceKm).sort((a, b) => a - b);
  const stops: number[] = [];
  const gaps: FuelGap[] = [];
  let position = 0;
  while (distanceKm - position > range) {
    const reachable = stations.filter((k) => k > position + 1e-6 && k <= position + range);
    const farthest = reachable[reachable.length - 1];
    if (farthest !== undefined) {
      stops.push(farthest);
      position = farthest;
      continue;
    }
    const next = stations.find((k) => k > position + range);
    gaps.push({ fromKm: position, toKm: next ?? distanceKm });
    position += range;
    stops.push(position);
  }
  return { stops, gaps };
}
