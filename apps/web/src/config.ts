// Настройки из data/ (ADR-0013: владелец меняет их через админку).
import budgetDefaultsJson from "@data/budget-defaults.json";
import countriesJson from "@data/countries.json";
import exchangeRateJson from "@data/exchange-rate.json";
import fuelPricesJson from "@data/fuel-prices.json";
import presetsJson from "@data/moto-presets.json";
import siteJson from "@data/site.json";
import tripDefaultsJson from "@data/trip-defaults.json";
import type { BudgetState, ProfileState } from "@versta/route-format";

export type FuelType = "92" | "95" | "100";

export interface Preset extends Omit<ProfileState, "presetId"> {
  id: string;
  name: string;
  allowUnpaved: boolean;
}

export const presets = presetsJson.presets as Preset[];
export const tripDefaults = tripDefaultsJson as typeof tripDefaultsJson & {
  people: 1 | 2;
  motorcycles: 1 | 2;
  currency: "RUB" | "USD";
  split: {
    mode: "km" | "manual" | "hours" | "days";
    maxKmPerDay: number;
    maxHoursPerDay: number;
    days: number;
  };
};
export const site = siteJson;
export const countries = countriesJson.countries;
export const exchangeRate = exchangeRateJson;

const fuelPrices = fuelPricesJson as {
  defaultFuel: FuelType;
  updated: string;
  countries: Record<string, Partial<Record<FuelType, number>>>;
};
export const defaultFuel = fuelPrices.defaultFuel;
export const fuelPricesUpdated = fuelPrices.updated;

/** Цена по умолчанию, ₽/л. Страны v0.2 задаются в data/fuel-prices.json (ADR-0006). */
export function defaultFuelPrice(fuel: FuelType, country = "RU"): number {
  const byCountry = fuelPrices.countries[country] ?? {};
  return byCountry[fuel] ?? byCountry["95"] ?? 75;
}

/** Есть ли своя цена топлива для страны в data/. */
export function hasCountryFuelPrice(country: string): boolean {
  return fuelPrices.countries[country] !== undefined;
}

/** «08:00» → минуты от полуночи. */
export function parseClock(text: string): number {
  const [h = "8", m = "0"] = text.split(":");
  return Number(h) * 60 + Number(m);
}

export const stopSettings = {
  dayStartMin: parseClock(tripDefaults.stops.dayStart),
  fuelStopMin: tripDefaults.stops.fuelStopMin,
  lunchMin: tripDefaults.stops.lunchMin,
  lunchAfterDrivingH: tripDefaults.stops.lunchAfterDrivingH,
};

export function presetToProfile(preset: Preset): ProfileState {
  return {
    presetId: preset.id,
    tankL: preset.tankL,
    consumptionLPer100Km: preset.consumptionLPer100Km,
    speeds: { ...preset.speeds },
    dailyLimitKm: preset.dailyLimitKm,
    dailyLimitH: preset.dailyLimitH,
    heavyDayKm: preset.heavyDayKm,
  };
}

/** Предел, после которого ссылку стоит сохранить в файл (спайк X-09). */
export const LONG_LINK_CHARS = 8000;

export const budgetDefaults = budgetDefaultsJson as {
  updated: string;
  lodging: {
    type: BudgetState["lodging"];
    pricePerRoomRub: Record<BudgetState["lodging"], number>;
  };
  food: { level: BudgetState["food"]; perPersonDayRub: Record<BudgetState["food"], number> };
  coffee: { enabled: boolean; priceRub: number };
  reservePct: number;
  finalNight: boolean;
};

export function defaultBudget(): BudgetState {
  return {
    lodging: budgetDefaults.lodging.type,
    rooms: 1,
    food: budgetDefaults.food.level,
    coffee: budgetDefaults.coffee.enabled,
    finalNight: budgetDefaults.finalNight,
    otherRub: 0,
    reservePct: budgetDefaults.reservePct,
  };
}
