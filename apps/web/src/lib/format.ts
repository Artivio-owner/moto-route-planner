// Форматирование чисел, дат и времени для интерфейса и PDF.
import {
  formatDuration,
  formatLocalTime,
  formatMoney,
  formatUtcOffset,
  fromRub,
  utcOffsetMinutes,
  type Currency,
} from "@versta/calc";

const kmFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export const formatKm = (km: number): string => `${kmFormat.format(km)}\u00a0км`;
export const formatLiters = (l: number): string => `${kmFormat.format(l)}\u00a0л`;
export const formatHours = (h: number): string => `${formatDuration(h)}\u00a0ч`;
export const formatNumber = (n: number): string => oneDecimal.format(n);

export function money(amountRub: number, currency: Currency, rubPerUsd: number): string {
  return formatMoney(fromRub(amountRub, currency, rubPerUsd), currency);
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
  timeZone: "UTC",
});

/** «ср, 1 июля» для даты ГГГГ-ММ-ДД. */
export function formatDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

/** «8:00 (UTC+3)». */
export function localTimeWithZone(at: Date, timeZone: string): string {
  return `${formatLocalTime(at, timeZone)} (${formatUtcOffset(utcOffsetMinutes(timeZone, at))})`;
}

export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}
