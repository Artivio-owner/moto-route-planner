// Восход и закат по координатам и дате: задача C-06. Формулы солнечной астрономии
// (алгоритм вида NOAA/Meeus, упрощённый), точность около 1–2 минут на широтах до 65°.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
/** Высота центра солнца при восходе и закате с учётом рефракции и радиуса диска. */
const SUN_ALTITUDE = -0.833;

export interface SunTimes {
  /** null, если солнце в этот день не восходит или не заходит. */
  sunrise: Date | null;
  sunset: Date | null;
  /** Полярный день или ночь. */
  polar: "day" | "night" | null;
}

const toJulian = (ms: number): number => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * DAY_MS);

/** Восход и закат для календарной даты ГГГГ-ММ-ДД в точке (lat, lon). */
export function sunTimes(date: string, lat: number, lon: number): SunTimes {
  const [y, m, d] = date.split("-").map(Number);
  // Полдень по UTC этой даты, сдвинутый к местному солнечному полудню.
  const noonUtc = Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12) - (lon / 360) * DAY_MS;
  const n = Math.round(toJulian(noonUtc) - J2000 - 0.0009 + lon / 360);
  const approxTransit = J2000 + 0.0009 - lon / 360 + n;
  const meanAnomaly = (357.5291 + 0.98560028 * (approxTransit - J2000)) * RAD;
  const center =
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly)) *
    RAD;
  const eclipticLon = meanAnomaly + center + 102.9372 * RAD + Math.PI;
  const transit =
    approxTransit + 0.0053 * Math.sin(meanAnomaly) - 0.0069 * Math.sin(2 * eclipticLon);
  const declination = Math.asin(Math.sin(eclipticLon) * Math.sin(23.4397 * RAD));
  const cosHourAngle =
    (Math.sin(SUN_ALTITUDE * RAD) - Math.sin(lat * RAD) * Math.sin(declination)) /
    (Math.cos(lat * RAD) * Math.cos(declination));
  if (cosHourAngle < -1) return { sunrise: null, sunset: null, polar: "day" };
  if (cosHourAngle > 1) return { sunrise: null, sunset: null, polar: "night" };
  const hourAngle = Math.acos(cosHourAngle) / (2 * Math.PI);
  return {
    sunrise: fromJulian(transit - hourAngle),
    sunset: fromJulian(transit + hourAngle),
    polar: null,
  };
}
