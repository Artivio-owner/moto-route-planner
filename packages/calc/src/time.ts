// Местное время и часовые пояса: docs/14-trip-parameters-spec.md, раздел 5; задача C-15.
// Пояс точки (IANA, например «Asia/Vladivostok») определяет API; здесь только
// арифметика через встроенный Intl, без внешних зависимостей.

/** Смещение пояса от UTC в минутах в данный момент. */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Момент, когда в поясе timeZone наступает дата date (ГГГГ-ММ-ДД) и время minutesOfDay. */
export function zonedTimeToInstant(date: string, minutesOfDay: number, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Дата должна быть в формате ГГГГ-ММ-ДД, получено «${date}»`);
  const naiveUtc =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + minutesOfDay * 60000;
  // Два прохода, чтобы учесть переход на летнее время.
  let instant = naiveUtc - utcOffsetMinutes(timeZone, new Date(naiveUtc)) * 60000;
  instant = naiveUtc - utcOffsetMinutes(timeZone, new Date(instant)) * 60000;
  return new Date(instant);
}

/** «UTC+3», «UTC+10», «UTC−2:30». */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "−" : "+";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** Местное время «ЧЧ:ММ» в поясе. */
export function formatLocalTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** Дата ГГГГ-ММ-ДД плюс n дней. */
export function addDays(date: string, days: number): string {
  const instant = zonedTimeToInstant(date, 0, "UTC").getTime() + days * 86400000;
  return new Date(instant).toISOString().slice(0, 10);
}

/** «ч:мм» для длительности в часах: 7,5 → «7:30». */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}
