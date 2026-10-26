// Валюты ₽ и $: задача C-12, решение владельца А6 (курс вручную).

export const CURRENCIES = ["RUB", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SIGNS: Record<Currency, string> = { RUB: "₽", USD: "$" };

/** Перевод суммы в рублях в выбранную валюту по курсу «рублей за доллар». */
export function fromRub(amountRub: number, currency: Currency, rubPerUsd: number): number {
  if (currency === "RUB") return amountRub;
  if (!Number.isFinite(rubPerUsd) || rubPerUsd <= 0) {
    throw new RangeError(`Курс должен быть больше 0, получено ${rubPerUsd}`);
  }
  return amountRub / rubPerUsd;
}

const NBSP = String.fromCharCode(0xa0);

const formatters: Record<Currency, Intl.NumberFormat> = {
  RUB: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }),
};

/** «12 345 ₽», «150 $». Неразрывный пробел перед знаком. */
export function formatMoney(amount: number, currency: Currency): string {
  return `${formatters[currency].format(amount)}${NBSP}${CURRENCY_SIGNS[currency]}`;
}
