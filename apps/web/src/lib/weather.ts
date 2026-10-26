// Погода в путевом листе: описание и предупреждения (C-07, C-13).
import { tripDefaults } from "../config";
import type { DayWeather } from "./api";

const one = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const signed = (t: number): string => `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.round(Math.abs(t))}`;

/** Коды погоды WMO, которые отдаёт Open-Meteo. */
export function weatherLabel(code: number | undefined): string {
  if (code === undefined) return "";
  if (code === 0) return "ясно";
  if (code <= 3) return "облачно";
  if (code <= 48) return "туман";
  if (code <= 57) return "морось";
  if (code <= 67) return "дождь";
  if (code <= 77) return "снег";
  if (code <= 82) return "ливень";
  if (code <= 86) return "снегопад";
  return "гроза";
}

/** «облачно, +13…+24 °C, осадки 2,5 мм (40%), ветер до 18 км/ч». */
export function describeWeather(w: DayWeather): string {
  const parts = [
    weatherLabel(w.weatherCode),
    `${signed(w.tempMinC)}…${signed(w.tempMaxC)} °C`,
    `осадки ${one.format(w.precipitationMm)} мм${w.precipitationProbability !== undefined ? ` (${w.precipitationProbability}%)` : ""}`,
    `ветер до ${Math.round(w.windMaxKmh)} км/ч`,
  ];
  return parts.filter(Boolean).join(", ");
}

export function weatherSource(w: DayWeather): string {
  return w.kind === "forecast"
    ? "прогноз"
    : `климатическая норма${w.years ? ` за ${w.years} лет` : ""}`;
}

/** Предупреждения по порогам из data/trip-defaults.json (вопрос 21). */
export function weatherWarnings(w: DayWeather, limits = tripDefaults.weather): string[] {
  const warnings: string[] = [];
  const wet =
    w.precipitationMm >= limits.rainMm ||
    (w.precipitationProbability !== undefined &&
      w.precipitationProbability >= limits.rainProbability);
  if (wet)
    warnings.push(
      "Возможен дождь: возьмите дождевик, на мокрой дороге закладывайте больше времени",
    );
  if (w.windMaxKmh >= limits.windKmh)
    warnings.push(`Сильный ветер до ${Math.round(w.windMaxKmh)} км/ч`);
  if (w.tempMinC < limits.coldC)
    warnings.push(`Холодно: до ${signed(w.tempMinC)} °C, нужна тёплая экипировка`);
  if (w.tempMaxC > limits.hotC)
    warnings.push(`Жарко: до ${signed(w.tempMaxC)} °C, чаще отдыхайте и пейте воду`);
  if (w.weatherCode !== undefined && w.weatherCode >= 95)
    warnings.push("Гроза: переждите, если застанет в пути");
  return warnings;
}
