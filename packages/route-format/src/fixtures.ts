import type { RouteState } from "./state.js";

// Сочи — Москва — Владивосток через крупные города (координаты ориентировочные,
// только для проверки длины ссылки, X-09).
export const SOCHI_VLADIVOSTOK: [string, number, number][] = [
  ["Сочи", 43.5855, 39.7231],
  ["Краснодар", 45.0355, 38.9753],
  ["Ростов-на-Дону", 47.2357, 39.7015],
  ["Воронеж", 51.6608, 39.2003],
  ["Москва", 55.7558, 37.6173],
  ["Нижний Новгород", 56.3269, 44.0059],
  ["Казань", 55.7963, 49.1088],
  ["Уфа", 54.7388, 55.9721],
  ["Челябинск", 55.1644, 61.4368],
  ["Курган", 55.441, 65.3411],
  ["Омск", 54.9885, 73.3242],
  ["Новосибирск", 55.0084, 82.9357],
  ["Кемерово", 55.3547, 86.0873],
  ["Красноярск", 56.0153, 92.8932],
  ["Тайшет", 55.9405, 98.0026],
  ["Иркутск", 52.287, 104.305],
  ["Улан-Удэ", 51.8335, 107.5841],
  ["Чита", 52.034, 113.4994],
  ["Сковородино", 53.9871, 123.9437],
  ["Белогорск", 50.9213, 128.4739],
  ["Биробиджан", 48.7946, 132.9218],
  ["Хабаровск", 48.4802, 135.0719],
  ["Дальнереченск", 45.931, 133.7317],
  ["Уссурийск", 43.7972, 131.9519],
  ["Владивосток", 43.1155, 131.8855],
];

export function sampleState(withOvernights: boolean): RouteState {
  return {
    points: SOCHI_VLADIVOSTOK.map(([name, lat, lon], i, all) => ({
      name,
      lat,
      lon,
      ...(withOvernights && i > 0 && i < all.length - 1 ? { overnight: true } : {}),
    })),
    roundTrip: true,
    avoidUnpaved: true,
    startDate: "2027-06-01",
    people: 2,
    motorcycles: 2,
    profile: {
      presetId: "touring-enduro",
      tankL: 20,
      consumptionLPer100Km: 5.5,
      speeds: { motorway: 110, trunk: 90, regional: 80, local: 55 },
      dailyLimitKm: 450,
      dailyLimitH: 8,
      heavyDayKm: 550,
    },
    split: withOvernights ? { mode: "manual" } : { mode: "km", maxKmPerDay: 450 },
    currency: "USD",
    fuelType: "95",
    fuelPriceRub: 74.5,
    rubPerUsd: 92.3,
  };
}
