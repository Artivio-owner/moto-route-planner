// Состояние маршрута в ссылке: ADR-0005, задачи X-02 и X-09.
// Сервер маршруты не хранит, поэтому всё, что нужно для пересчёта, лежит в адресе
// после «#»: эта часть не уходит на сервер и не попадает в его журналы.

export const STATE_VERSION = 1;

export interface RoutePoint {
  name: string;
  lat: number;
  lon: number;
  /** Ночёвка в этой точке (ручная разбивка по дням). */
  overnight?: boolean;
}

export interface ProfileState {
  presetId: string;
  tankL: number;
  consumptionLPer100Km: number;
  speeds: { motorway: number; trunk: number; regional: number; local: number };
  dailyLimitKm: number;
  dailyLimitH: number;
  heavyDayKm: number;
}

/** Бюджет (C-05). Цены задаются, только если пользователь их изменил. */
export interface BudgetState {
  lodging: "hotel3" | "hotel4" | "hotel5" | "guesthouse" | "camping";
  rooms: 1 | 2;
  food: "economy" | "medium" | "high";
  coffee: boolean;
  finalNight: boolean;
  otherRub: number;
  reservePct: number;
  roomPriceRub?: number;
  foodPriceRub?: number;
  coffeePriceRub?: number;
}

const LODGING_CODES: BudgetState["lodging"][] = [
  "hotel3",
  "hotel4",
  "hotel5",
  "guesthouse",
  "camping",
];
const FOOD_CODES: BudgetState["food"][] = ["economy", "medium", "high"];

export interface RouteState {
  points: RoutePoint[];
  /** Маршрут с возвратом: флаг, а не новые точки (ADR-0011). */
  roundTrip: boolean;
  avoidUnpaved: boolean;
  /** Избегать платных дорог и автомагистралей (M-02); в ссылке флаги 4 и 8. */
  avoidToll?: boolean;
  avoidMotorways?: boolean;
  /** Дата старта ГГГГ-ММ-ДД. */
  startDate: string;
  people: 1 | 2;
  motorcycles: 1 | 2;
  profile: ProfileState;
  split:
    | { mode: "km"; maxKmPerDay: number }
    | { mode: "manual" }
    | { mode: "hours"; maxHoursPerDay: number }
    | { mode: "days"; days: number };
  currency: "RUB" | "USD";
  fuelType: "92" | "95" | "100";
  /** Цена, если пользователь её изменил; иначе берётся значение по умолчанию. */
  fuelPriceRub?: number;
  rubPerUsd?: number;
  budget?: BudgetState;
  /** Дневки (C-11): номера ходовых дней, после которых день отдыха. */
  restAfterDays?: number[];
}

const COORD_SCALE = 1e5; // ≈ 1 м

/**
 * Компактный вид: короткие ключи, координаты целыми числами с разностями
 * от предыдущей точки. Порядок полей в массивах фиксирован версией.
 */
type Packed = [
  version: number,
  points: [name: string, dLat: number, dLon: number, overnight: 0 | 1][],
  flags: number,
  startDate: string,
  people: number,
  motorcycles: number,
  profile: [string, number, number, number, number, number, number, number, number, number],
  /** Число: км в день (0 = вручную); массив [1, часы] или [2, дни] для новых режимов. */
  split: number | [code: number, value: number],
  currency: number,
  fuelType: string,
  fuelPriceRub: number | null,
  rubPerUsd: number | null,
  budget?:
    | null
    | [
        lodging: number,
        rooms: number,
        food: number,
        flags: number,
        otherRub: number,
        reservePct: number,
        roomPrice: number | null,
        foodPrice: number | null,
        coffeePrice: number | null,
      ],
  restAfterDays?: number[],
];

function packSplit(split: RouteState["split"]): Packed[7] {
  switch (split.mode) {
    case "km":
      return split.maxKmPerDay;
    case "manual":
      return 0;
    case "hours":
      return [1, split.maxHoursPerDay];
    case "days":
      return [2, split.days];
  }
}

function unpackSplit(raw: unknown): RouteState["split"] {
  if (isFiniteNumber(raw)) return raw > 0 ? { mode: "km", maxKmPerDay: raw } : { mode: "manual" };
  if (Array.isArray(raw) && isFiniteNumber(raw[1]) && raw[1] > 0) {
    if (raw[0] === 1) return { mode: "hours", maxHoursPerDay: raw[1] };
    if (raw[0] === 2) return { mode: "days", days: Math.round(raw[1]) };
  }
  throw new Error("Ссылка повреждена: разбивка по дням");
}

function packBudget(b: BudgetState): NonNullable<Packed[12]> {
  return [
    LODGING_CODES.indexOf(b.lodging),
    b.rooms,
    FOOD_CODES.indexOf(b.food),
    (b.coffee ? 1 : 0) | (b.finalNight ? 2 : 0),
    b.otherRub,
    b.reservePct,
    b.roomPriceRub ?? null,
    b.foodPriceRub ?? null,
    b.coffeePriceRub ?? null,
  ];
}

function unpackBudget(raw: unknown): BudgetState {
  if (!Array.isArray(raw) || raw.length !== 9) throw new Error("Ссылка повреждена: бюджет");
  const [lodging, rooms, food, flags, other, reserve, roomPrice, foodPrice, coffeePrice] =
    raw as unknown[];
  const lodgingType = LODGING_CODES[lodging as number];
  const foodLevel = FOOD_CODES[food as number];
  if (!lodgingType || !foodLevel || (rooms !== 1 && rooms !== 2) || !isFiniteNumber(flags)) {
    throw new Error("Ссылка повреждена: бюджет");
  }
  if (!isFiniteNumber(other) || !isFiniteNumber(reserve))
    throw new Error("Ссылка повреждена: бюджет");
  const budget: BudgetState = {
    lodging: lodgingType,
    rooms,
    food: foodLevel,
    coffee: (flags & 1) === 1,
    finalNight: (flags & 2) === 2,
    otherRub: other,
    reservePct: reserve,
  };
  if (isFiniteNumber(roomPrice)) budget.roomPriceRub = roomPrice;
  if (isFiniteNumber(foodPrice)) budget.foodPriceRub = foodPrice;
  if (isFiniteNumber(coffeePrice)) budget.coffeePriceRub = coffeePrice;
  return budget;
}

function pack(state: RouteState): Packed {
  let prevLat = 0;
  let prevLon = 0;
  const points = state.points.map((p): [string, number, number, 0 | 1] => {
    const lat = Math.round(p.lat * COORD_SCALE);
    const lon = Math.round(p.lon * COORD_SCALE);
    const packed: [string, number, number, 0 | 1] = [
      p.name,
      lat - prevLat,
      lon - prevLon,
      p.overnight ? 1 : 0,
    ];
    prevLat = lat;
    prevLon = lon;
    return packed;
  });
  const { profile: pr } = state;
  return [
    STATE_VERSION,
    points,
    (state.roundTrip ? 1 : 0) |
      (state.avoidUnpaved ? 2 : 0) |
      (state.avoidToll ? 4 : 0) |
      (state.avoidMotorways ? 8 : 0),
    state.startDate,
    state.people,
    state.motorcycles,
    [
      pr.presetId,
      pr.tankL,
      pr.consumptionLPer100Km,
      pr.speeds.motorway,
      pr.speeds.trunk,
      pr.speeds.regional,
      pr.speeds.local,
      pr.dailyLimitKm,
      pr.dailyLimitH,
      pr.heavyDayKm,
    ],
    packSplit(state.split),
    state.currency === "USD" ? 1 : 0,
    state.fuelType,
    state.fuelPriceRub ?? null,
    state.rubPerUsd ?? null,
    // Хвост необязателен: старые ссылки без бюджета и дневок короче.
    ...(state.restAfterDays?.length
      ? [state.budget ? packBudget(state.budget) : null, state.restAfterDays]
      : state.budget
        ? [packBudget(state.budget)]
        : []),
  ] as Packed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unpack(raw: unknown): RouteState {
  if (!Array.isArray(raw) || raw[0] !== STATE_VERSION || raw.length < 12 || raw.length > 14) {
    throw new Error("Ссылка повреждена или создана другой версией сервиса");
  }
  const [
    ,
    points,
    flags,
    startDate,
    people,
    motorcycles,
    profile,
    split,
    currency,
    fuelType,
    price,
    rate,
    budget,
    restAfterDays,
  ] = raw as Packed;
  if (!Array.isArray(points) || !Array.isArray(profile) || profile.length !== 10) {
    throw new Error("Ссылка повреждена");
  }
  let lat = 0;
  let lon = 0;
  const decodedPoints = points.map(([name, dLat, dLon, overnight]) => {
    if (typeof name !== "string" || !isFiniteNumber(dLat) || !isFiniteNumber(dLon)) {
      throw new Error("Ссылка повреждена: точка маршрута");
    }
    lat += dLat;
    lon += dLon;
    const point: RoutePoint = { name, lat: lat / COORD_SCALE, lon: lon / COORD_SCALE };
    if (overnight === 1) point.overnight = true;
    return point;
  });
  const [presetId, tankL, consumption, motorway, trunk, regional, local, limitKm, limitH, heavyKm] =
    profile;
  const numbers = [tankL, consumption, motorway, trunk, regional, local, limitKm, limitH, heavyKm];
  if (typeof presetId !== "string" || !numbers.every(isFiniteNumber)) {
    throw new Error("Ссылка повреждена: параметры");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    ![1, 2].includes(people) ||
    ![1, 2].includes(motorcycles)
  ) {
    throw new Error("Ссылка повреждена: параметры поездки");
  }
  if (!["92", "95", "100"].includes(fuelType)) throw new Error("Ссылка повреждена: топливо");
  const state: RouteState = {
    points: decodedPoints,
    roundTrip: (flags & 1) === 1,
    avoidUnpaved: (flags & 2) === 2,
    startDate,
    people: people as 1 | 2,
    motorcycles: motorcycles as 1 | 2,
    profile: {
      presetId,
      tankL,
      consumptionLPer100Km: consumption,
      speeds: { motorway, trunk, regional, local },
      dailyLimitKm: limitKm,
      dailyLimitH: limitH,
      heavyDayKm: heavyKm,
    },
    split: unpackSplit(split),
    currency: currency === 1 ? "USD" : "RUB",
    fuelType: fuelType as RouteState["fuelType"],
  };
  if ((flags & 4) === 4) state.avoidToll = true;
  if ((flags & 8) === 8) state.avoidMotorways = true;
  if (isFiniteNumber(price)) state.fuelPriceRub = price;
  if (isFiniteNumber(rate)) state.rubPerUsd = rate;
  if (budget !== undefined && budget !== null) state.budget = unpackBudget(budget);
  if (restAfterDays !== undefined) {
    if (
      !Array.isArray(restAfterDays) ||
      !restAfterDays.every((n) => Number.isInteger(n) && n >= 1)
    ) {
      throw new Error("Ссылка повреждена: дневки");
    }
    if (restAfterDays.length) state.restAfterDays = restAfterDays;
  }
  return state;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Состояние → строка для адреса (после «#r=»). */
export async function encodeState(state: RouteState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack(state)));
  return toBase64Url(await transform(json, new CompressionStream("deflate-raw")));
}

/** Строка из адреса → состояние. Бросает Error с понятным текстом, если ссылка повреждена. */
export async function decodeState(encoded: string): Promise<RouteState> {
  let json: string;
  try {
    json = new TextDecoder().decode(
      await transform(fromBase64Url(encoded), new DecompressionStream("deflate-raw")),
    );
  } catch {
    throw new Error("Ссылка повреждена: не удалось распаковать маршрут");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Ссылка повреждена: не удалось прочитать маршрут");
  }
  return unpack(raw);
}

export const STATE_HASH_PREFIX = "#r=";
