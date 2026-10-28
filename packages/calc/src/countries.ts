// Страны вдоль маршрута: v0.2 (ADR-0006, ADR-0012), задачи R-10 и C-12.
// Страна определяется по часовому поясу IANA: границы поясов в базе tz-lookup
// проведены по государственным границам, поэтому для наших стран этого хватает.
// Точность у самой границы ограничена упрощённой базой поясов (не проверено на местности).

/** Пояса стран покрытия v0.1–v0.2 и соседей. Пояса, не вошедшие сюда, дают null. */
const ZONE_COUNTRY: Record<string, string> = {
  "Europe/Kaliningrad": "RU",
  "Europe/Moscow": "RU",
  "Europe/Kirov": "RU",
  "Europe/Volgograd": "RU",
  "Europe/Astrakhan": "RU",
  "Europe/Saratov": "RU",
  "Europe/Ulyanovsk": "RU",
  "Europe/Samara": "RU",
  "Asia/Yekaterinburg": "RU",
  "Asia/Omsk": "RU",
  "Asia/Novosibirsk": "RU",
  "Asia/Barnaul": "RU",
  "Asia/Tomsk": "RU",
  "Asia/Novokuznetsk": "RU",
  "Asia/Krasnoyarsk": "RU",
  "Asia/Irkutsk": "RU",
  "Asia/Chita": "RU",
  "Asia/Yakutsk": "RU",
  "Asia/Khandyga": "RU",
  "Asia/Vladivostok": "RU",
  "Asia/Ust-Nera": "RU",
  "Asia/Magadan": "RU",
  "Asia/Sakhalin": "RU",
  "Asia/Srednekolymsk": "RU",
  "Asia/Kamchatka": "RU",
  "Asia/Anadyr": "RU",
  "Asia/Almaty": "KZ",
  "Asia/Qostanay": "KZ",
  "Asia/Aqtobe": "KZ",
  "Asia/Aqtau": "KZ",
  "Asia/Atyrau": "KZ",
  "Asia/Oral": "KZ",
  "Asia/Qyzylorda": "KZ",
  "Asia/Tbilisi": "GE",
  "Europe/Istanbul": "TR",
  "Europe/Minsk": "BY",
  "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA",
  "Asia/Baku": "AZ",
  "Asia/Yerevan": "AM",
  "Asia/Ulaanbaatar": "MN",
  "Asia/Hovd": "MN",
  "Asia/Shanghai": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Bishkek": "KG",
  "Asia/Tashkent": "UZ",
  "Asia/Samarkand": "UZ",
  "Europe/Helsinki": "FI",
  "Europe/Tallinn": "EE",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
  "Europe/Oslo": "NO",
  "Europe/Sofia": "BG",
  "Europe/Athens": "GR",
  "Asia/Tehran": "IR",
  "Asia/Damascus": "SY",
  "Asia/Baghdad": "IQ",
  "Asia/Pyongyang": "KP",
};

export const COUNTRY_NAMES: Record<string, string> = {
  RU: "Россия",
  KZ: "Казахстан",
  GE: "Грузия",
  TR: "Турция",
  BY: "Беларусь",
  UA: "Украина",
  AZ: "Азербайджан",
  AM: "Армения",
  MN: "Монголия",
  CN: "Китай",
  KG: "Киргизия",
  UZ: "Узбекистан",
  FI: "Финляндия",
  EE: "Эстония",
  LV: "Латвия",
  LT: "Литва",
  PL: "Польша",
  NO: "Норвегия",
  BG: "Болгария",
  GR: "Греция",
  IR: "Иран",
  SY: "Сирия",
  IQ: "Ирак",
  KP: "КНДР",
};

/** Код страны ISO 3166-1 alpha-2 по поясу IANA или null, если пояс не в списке. */
export function countryOfZone(timeZone: string): string | null {
  return ZONE_COUNTRY[timeZone] ?? null;
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export interface CountryMark {
  fromKm: number;
  /** null: страна не определена (пояс вне списка). */
  country: string | null;
}

/** Отметки смены страны из отметок поясов: соседние пояса одной страны склеиваются. */
export function countryMarks(
  zones: readonly { fromKm: number; timeZone: string }[],
): CountryMark[] {
  const marks: CountryMark[] = [];
  for (const zone of zones) {
    const country = countryOfZone(zone.timeZone);
    if (marks.length && marks[marks.length - 1]?.country === country) continue;
    marks.push({ fromKm: zone.fromKm, country });
  }
  return marks;
}

/** Цена топлива с какого километра (C-12, значения по странам в v0.2). */
export interface PriceMark {
  fromKm: number;
  priceRub: number;
}

/** Стоимость литров на участке [fromKm, toKm] при ценах по отметкам; расход равномерный по км. */
export function fuelCostByMarks(
  marks: readonly PriceMark[],
  fromKm: number,
  toKm: number,
  liters: number,
): number {
  const length = toKm - fromKm;
  if (length <= 0 || liters <= 0) return 0;
  let cost = 0;
  marks.forEach((mark, i) => {
    const start = Math.max(fromKm, i === 0 ? -Infinity : mark.fromKm);
    const end = Math.min(toKm, marks[i + 1]?.fromKm ?? Infinity);
    if (end > start) cost += ((end - start) / length) * liters * mark.priceRub;
  });
  return cost;
}
