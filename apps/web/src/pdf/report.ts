// PDF путевой лист, базовая версия v0.1 (ADR-0012): титул, сводка, карта, таблица по дням,
// километраж по дням, источники. Спецификация: docs/11-pdf-report-spec.md.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { FOOD_LABELS, LODGING_LABELS, countryName, formatLocalTime } from "@versta/calc";
import { site } from "../config";
import type { DayWeather, LonLat } from "../lib/api";
import { describeWeather, weatherSource, weatherWarnings } from "../lib/weather";
import {
  formatDate,
  formatHours,
  formatKm,
  formatLiters,
  localTimeWithZone,
  money,
  pluralDays,
} from "../lib/format";
import type { RoutePoi } from "../lib/api";
import {
  bounds,
  describeLodging,
  elevationStats,
  fuelStationsBetween,
  lodgingNear,
  pointAtKm,
  sliceLine,
  type PlanResult,
  type RouteLine,
} from "../lib/plan";
import { CUSTOM_PRESET, completePoints, routeTitle, type PlannerState } from "../state/planner";
import { presets } from "../config";
import { donate as donateConfig, donateEnabled, donateQrForPdf, type PdfQr } from "../lib/donate";
import { mapSnapshot } from "./mapSnapshot";

export interface ReportInput {
  state: PlannerState;
  result: PlanResult;
  line: RouteLine;
  dayLabels: { from: string; to: string }[];
  /** Погода по дням (C-13); null, если не получена. */
  weather?: (DayWeather | null)[];
  url: string;
  /** «Поддержать разработчика»; если не задано, берётся из data/site.json (null: не показывать). */
  donate?: { label: string; url: string; qr: PdfQr | null } | null;
  /** Для тестов: не пытаться рисовать карту через WebGL. */
  skipMapSnapshot?: boolean;
  /** АЗС и жильё вдоль маршрута (v0.3, P-07); нет без слоя POI на сервере. */
  pois?: RoutePoi[] | undefined;
  fonts?: { regular: Uint8Array; bold: Uint8Array };
  now?: Date;
}

const hex = (value: string): RGB => {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Палитра дизайн-системы (ADR-0009).
const C = {
  bg: hex("#F6EFDF"),
  surface: hex("#FFFBF2"),
  ink: hex("#2E2B25"),
  muted: hex("#6A6354"),
  line: hex("#E3D8BF"),
  primary: hex("#3C6B4B"),
  accent: hex("#E0892F"),
  /** Оранжевый для текста: контраст от 5:1 (D-02). */
  accentInk: hex("#9C520F"),
  map: hex("#DDE8CE"),
};

const A4 = { w: 595.28, h: 841.89 };
/** Источник высот для подписи (ADR-0016). */
const ELEVATION_SOURCE = "SRTM (CGIAR-CSI) и GMTED2010 (USGS) через GraphHopper";
/** Снимков карты дня не больше этого числа: дальше схема, чтобы PDF не собирался минутами. */
const MAX_DAY_SNAPSHOTS = 30;
const M = 40;

async function loadFont(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`нет шрифта ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}

class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: C.bg });
    this.y = A4.h - M;
  }

  ensure(height: number): void {
    if (this.y - height < M + 20) this.newPage();
  }

  /** Перенос строки по ширине. */
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let current = "";
      for (const word of paragraph.split(" ")) {
        const next = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && current) {
          lines.push(current);
          current = word;
        } else current = next;
      }
      lines.push(current);
    }
    return lines;
  }

  text(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: RGB;
      x?: number;
      width?: number;
      gap?: number;
    } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const x = opts.x ?? M;
    const lines = this.wrap(text, font, size, opts.width ?? A4.w - x - M);
    for (const line of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? C.ink });
      this.y -= size * 1.4;
    }
    this.y -= opts.gap ?? 0;
  }

  heading(text: string): void {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: M, y: this.y - 16, width: 4, height: 18, color: C.accent });
    this.page.drawText(text, {
      x: M + 12,
      y: this.y - 14,
      size: 15,
      font: this.bold,
      color: C.ink,
    });
    this.y -= 28;
  }
}

function drawRouteSchema(
  page: PDFPage,
  line: LonLat[],
  nights: LonLat[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: C.map,
    borderColor: C.line,
    borderWidth: 1,
  });
  const box = bounds(line);
  if (!box) return;
  const [[minX, minY], [maxX, maxY]] = box;
  const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
  const sx = (maxX - minX) * Math.cos(midLat) || 1e-6;
  const sy = maxY - minY || 1e-6;
  const scale = Math.min((w - 40) / sx, (h - 40) / sy);
  const ox = x + (w - sx * scale) / 2;
  const oy = y + (h - sy * scale) / 2;
  const project = ([lon, lat]: LonLat): [number, number] => [
    ox + (lon - minX) * Math.cos(midLat) * scale,
    oy + (lat - minY) * scale,
  ];
  const step = Math.max(1, Math.floor(line.length / 1500));
  let prev = project(line[0] as LonLat);
  for (let i = step; i < line.length; i += step) {
    const p = project(line[i] as LonLat);
    page.drawLine({
      start: { x: prev[0], y: prev[1] },
      end: { x: p[0], y: p[1] },
      thickness: 2.2,
      color: C.primary,
    });
    prev = p;
  }
  const last = project(line[line.length - 1] as LonLat);
  page.drawLine({
    start: { x: prev[0], y: prev[1] },
    end: { x: last[0], y: last[1] },
    thickness: 2.2,
    color: C.primary,
  });
  for (const n of nights) {
    const [px, py] = project(n);
    page.drawCircle({
      x: px,
      y: py,
      size: 4,
      color: C.accent,
      borderColor: C.surface,
      borderWidth: 1.5,
    });
  }
  const [sxp, syp] = project(line[0] as LonLat);
  page.drawCircle({
    x: sxp,
    y: syp,
    size: 5,
    color: C.surface,
    borderColor: C.primary,
    borderWidth: 2,
  });
  page.drawCircle({ x: last[0], y: last[1], size: 5, color: C.accent });
}

export async function buildReport(input: ReportInput): Promise<Uint8Array> {
  const { state, result, line, dayLabels } = input;
  const { plan, rubPerUsd } = result;
  const now = input.now ?? new Date();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = input.fonts ?? {
    regular: await loadFont("/fonts/Rubik-Regular.ttf"),
    bold: await loadFont("/fonts/Rubik-Bold.ttf"),
  };
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const points = completePoints(state);
  const title = routeTitle(points);
  doc.setTitle(`Путевой лист: ${title}`);
  doc.setAuthor("Верста");
  doc.setCreator("Верста");
  doc.setLanguage("ru-RU");

  const w = new Writer(doc, regular, bold);
  const cur = state.currency;
  const m = (rub: number) => money(rub, cur, rubPerUsd);

  // 1. Титул.
  w.page.drawText("Верста", { x: M, y: w.y - 22, size: 22, font: bold, color: C.primary });
  w.page.drawText("путевой лист", {
    x: M + bold.widthOfTextAtSize("Верста", 22) + 10,
    y: w.y - 20,
    size: 12,
    font: regular,
    color: C.muted,
  });
  w.y -= 44;
  w.text(title, { size: 20, bold: true, gap: 4 });
  const lastDay = plan.days[plan.days.length - 1];
  const presetName =
    state.profile.presetId === CUSTOM_PRESET
      ? "свой профиль"
      : (presets.find((p) => p.id === state.profile.presetId)?.name ?? "свой профиль");
  w.text(
    [
      `${formatDate(state.startDate)} — ${lastDay ? formatDate(lastDay.date) : ""}, ${pluralDays(plan.days.length)}${plan.restDays ? `, из них дневок: ${plan.restDays}` : ""}`,
      `Людей: ${plan.group.people}, мотоциклов: ${plan.group.motorcycles}. Мотоцикл: ${presetName}, бак ${state.profile.tankL} л, расход ${String(state.profile.consumptionLPer100Km).replace(".", ",")} л/100 км`,
      `Валюта: ${cur === "RUB" ? "рубли" : `доллары (курс ${String(rubPerUsd).replace(".", ",")} ₽ за $${result.rateEdited ? ", ваш" : ", ориентировочно"})`}. ${state.avoidUnpaved ? "Без грунтовых дорог" : "Грунтовые дороги разрешены"}${state.avoidToll ? ", избегать платных" : ""}${state.avoidMotorways ? ", избегать автомагистралей" : ""}${state.curvy ? ", извилистые дороги" : ""}${state.roundTrip ? ", с возвратом" : ""}.`,
      ...(plan.countries.length > 1
        ? [
            `Страны: ${plan.countries.map(countryName).join(" → ")}. Топливо: ${result.countryFuelPrices.map((c) => `${countryName(c.country)} ${m(c.priceRub)}/л`).join(", ")} (ориентировочно).`,
          ]
        : []),
      `Рассчитано: ${now.toLocaleDateString("ru-RU")}`,
    ].join("\n"),
    { size: 10, color: C.muted, gap: 8 },
  );

  // 2. Сводка.
  w.heading("Сводка");
  const cells: [string, string][] = [
    [formatKm(plan.distanceKm), pluralDays(plan.days.length)],
    [formatHours(plan.totalH), "в пути с остановками"],
    [formatLiters(plan.liters), `топлива, заправок ${plan.fuelStops}`],
    [
      m(plan.fuelCostRub),
      result.fuelPriceEdited ? "на топливо (ваша цена)" : "на топливо, ориентировочно",
    ],
  ];
  const cellW = (A4.w - 2 * M - 30) / 4;
  w.ensure(60);
  cells.forEach(([value, label], i) => {
    const x = M + i * (cellW + 10);
    w.page.drawRectangle({
      x,
      y: w.y - 52,
      width: cellW,
      height: 52,
      color: C.surface,
      borderColor: C.line,
      borderWidth: 1,
    });
    w.page.drawText(value, { x: x + 8, y: w.y - 22, size: 14, font: bold, color: C.ink });
    const labelLines = w.wrap(label, regular, 8, cellW - 16);
    labelLines.slice(0, 2).forEach((l, j) =>
      w.page.drawText(l, {
        x: x + 8,
        y: w.y - 36 - j * 10,
        size: 8,
        font: regular,
        color: C.muted,
      }),
    );
  });
  w.y -= 64;
  w.text(
    `Цена топлива АИ-${state.fuelType}: ${String(result.fuelPriceRub).replace(".", ",")} ₽/л${result.fuelPriceEdited ? " (изменено вами)" : " (ориентировочно)"}. Запас хода с резервом 10%: ${formatKm(plan.rangeKm)}. Ночей в пути: ${plan.nights}.`,
    { size: 9, color: C.muted },
  );
  if (plan.hasToll || plan.hasFerry) {
    w.text(
      `На маршруте есть ${[plan.hasToll && "платные участки", plan.hasFerry && "паромы"].filter(Boolean).join(" и ")}: их стоимость в расчёт не входит.`,
      { size: 9 },
    );
  }

  // 7. Бюджет: статьи, формулы и допущения (спецификация 07).
  w.heading("Бюджет");
  const { budget, budgetPrices } = result;
  const b = state.budget;
  const rooms = plan.group.people === 1 ? 1 : b.rooms;
  const edited = (flag: boolean) => (flag ? " (изменено вами)" : "");
  const budgetRows: [string, number, string][] = [
    [
      "Топливо",
      budget.fuel,
      result.countryFuelPrices.length > 1
        ? `${formatLiters(plan.liters)} по ценам стран: ${result.countryFuelPrices.map((c) => `${countryName(c.country)} ${String(c.priceRub).replace(".", ",")} ₽/л`).join(", ")}${edited(result.fuelPriceEdited)}`
        : `${formatLiters(plan.liters)} × ${String(result.fuelPriceRub).replace(".", ",")} ₽/л${edited(result.fuelPriceEdited)}`,
    ],
    [
      "Жильё",
      budget.lodging,
      `${budget.nightsPaid} ноч. × ${rooms} ном. × ${m(budgetPrices.room)} (${LODGING_LABELS[b.lodging].replace("★", " зв.")})${edited(budgetPrices.roomEdited)}`,
    ],
    [
      "Еда",
      budget.food,
      `${plan.days.length} дн. × ${plan.group.people} чел. × ${m(budgetPrices.food)} (${FOOD_LABELS[b.food].toLowerCase()})${edited(budgetPrices.foodEdited)}`,
    ],
    [
      "Кофе на заправках",
      budget.coffee,
      b.coffee
        ? `${plan.fuelStops} заправ. × ${plan.group.people} чел. × ${m(budgetPrices.coffee)}${edited(budgetPrices.coffeeEdited)}`
        : "не учитывается",
    ],
    ["Прочее", budget.other, "платные дороги, паромы и другое, вручную"],
    ["Резерв", budget.reserve, `${b.reservePct}% от суммы статей`],
  ];
  for (const [label, value, formula] of budgetRows) {
    w.ensure(16);
    w.page.drawText(label, { x: M, y: w.y - 10, size: 9.5, font: bold, color: C.ink });
    w.page.drawText(formula, { x: M + 120, y: w.y - 10, size: 8, font: regular, color: C.muted });
    const valueText = m(value);
    w.page.drawText(valueText, {
      x: A4.w - M - regular.widthOfTextAtSize(valueText, 9.5),
      y: w.y - 10,
      size: 9.5,
      font: regular,
      color: C.ink,
    });
    w.y -= 15;
    w.page.drawLine({
      start: { x: M, y: w.y + 2 },
      end: { x: A4.w - M, y: w.y + 2 },
      thickness: 0.5,
      color: C.line,
    });
  }
  w.ensure(20);
  const totalText = `Итого ${m(budget.total)}, на человека ${m(budget.perPerson)}`;
  w.page.drawText(totalText, {
    x: A4.w - M - bold.widthOfTextAtSize(totalText, 11),
    y: w.y - 12,
    size: 11,
    font: bold,
    color: C.ink,
  });
  w.y -= 20;
  w.text(
    "Жильё считается за номер, а не за человека. Все цены ориентировочные; изменённые вами помечены.",
    {
      size: 8,
      color: C.muted,
    },
  );

  // 3. Карта маршрута.
  // Дневка стоит в той же точке, что и ночь перед ней: точку не дублируем.
  const nights = plan.days
    .slice(0, -1)
    .filter((_, i) => !plan.days[i + 1]?.rest)
    .map((d) => pointAtKm(line, d.endKm));
  const mapW = A4.w - 2 * M;
  const mapH = mapW * 0.62;
  // Заголовок не должен остаться в конце страницы без карты.
  w.ensure(mapH + 60);
  w.heading("Карта маршрута");
  const snapshot = input.skipMapSnapshot ? null : await mapSnapshot(line.points, nights);
  if (snapshot) {
    const image = await doc.embedPng(snapshot.png);
    w.page.drawImage(image, { x: M, y: w.y - mapH, width: mapW, height: mapH });
    w.page.drawRectangle({
      x: M,
      y: w.y - mapH,
      width: mapW,
      height: mapH,
      borderColor: C.line,
      borderWidth: 1,
    });
  } else {
    drawRouteSchema(w.page, line.points, nights, M, w.y - mapH, mapW, mapH);
  }
  w.y -= mapH + 4;
  w.text("Оранжевые точки: ночёвки. Данные карты © участники OpenStreetMap.", {
    size: 8,
    color: C.muted,
    gap: 4,
  });

  // 4. Таблица по дням.
  w.heading("По дням");
  const cols = [
    { title: "День", w: 70 },
    { title: "Откуда — куда", w: 140 },
    { title: "Км", w: 45 },
    { title: "В пути", w: 45 },
    { title: "Старт, финиш, закат", w: 110 },
    { title: "Запр.", w: 30 },
    { title: "Топливо", w: 75 },
  ];
  const drawHeader = () => {
    w.ensure(24);
    let x = M;
    w.page.drawRectangle({ x: M, y: w.y - 18, width: A4.w - 2 * M, height: 18, color: C.primary });
    for (const col of cols) {
      w.page.drawText(col.title, {
        x: x + 4,
        y: w.y - 13,
        size: 8,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += col.w;
    }
    w.y -= 20;
  };
  drawHeader();
  plan.days.forEach((day, i) => {
    const label = dayLabels[i];
    const ele = day.rest ? null : elevationStats(line, day.startKm, day.endKm);
    const stations = day.rest ? null : fuelStationsBetween(input.pois, day.startKm, day.endKm);
    const isLastRiding = !plan.days.slice(i + 1).some((d) => !d.rest);
    const lodging = day.rest || isLastRiding ? [] : lodgingNear(input.pois, day.endKm);
    const notes = [
      ele ? `набор высоты ${Math.round(ele.ascentM)} м` : "",
      stations !== null ? `АЗС на участке: ${stations}` : "",
      lodging.length ? `ночлег у финиша: ${lodging.map(describeLodging).join("; ")}` : "",
      day.hasToll ? "платный участок" : "",
      day.hasFerry ? "паром" : "",
      day.zoneShiftH ? `пояс ${day.zoneShiftH > 0 ? "+" : ""}${day.zoneShiftH} ч` : "",
      ...day.warnings.map((x) => x.message),
    ].filter(Boolean);
    const values = day.rest
      ? [
          `${day.number}\n${formatDate(day.date)}`,
          `Дневка: ${label?.to ?? ""}`,
          "0",
          "—",
          day.sunset ? `закат ${formatLocalTime(day.sunset, day.endTimeZone)}` : "",
          "0",
          "—",
        ]
      : [
          `${day.number}\n${formatDate(day.date)}`,
          label ? `${label.from} — ${label.to}` : "",
          formatKm(day.distanceKm).replace("\u00a0км", ""),
          formatHours(day.totalH).replace("\u00a0ч", ""),
          [
            localTimeWithZone(day.departure, day.startTimeZone),
            localTimeWithZone(day.arrival, day.endTimeZone),
            day.sunset
              ? `закат ${formatLocalTime(day.sunset, day.endTimeZone)}`
              : day.polar === "day"
                ? "полярный день"
                : "",
          ]
            .filter(Boolean)
            .join("\n"),
          String(day.fuelStopsKm.length),
          `${formatLiters(day.liters)}\n${m(day.fuelCostRub)}`,
        ];
    const wrapped = values.map((v, c) => w.wrap(v, regular, 8, (cols[c]?.w ?? 50) - 8));
    const noteLines = notes.length ? w.wrap(notes.join("; "), regular, 7.5, A4.w - 2 * M - 8) : [];
    const rowH = Math.max(...wrapped.map((l) => l.length)) * 10 + noteLines.length * 9 + 8;
    if (w.y - rowH < M + 20) {
      w.newPage();
      drawHeader();
    }
    if (i % 2 === 0)
      w.page.drawRectangle({
        x: M,
        y: w.y - rowH,
        width: A4.w - 2 * M,
        height: rowH,
        color: C.surface,
      });
    let x = M;
    wrapped.forEach((lines, c) => {
      lines.forEach((l, j) =>
        w.page.drawText(l, {
          x: x + 4,
          y: w.y - 10 - j * 10,
          size: 8,
          font: c === 0 && j === 0 ? bold : regular,
          color: C.ink,
        }),
      );
      x += cols[c]?.w ?? 50;
    });
    const notesTop = w.y - Math.max(...wrapped.map((l) => l.length)) * 10 - 4;
    noteLines.forEach((l, j) =>
      w.page.drawText(l, {
        x: M + 4,
        y: notesTop - 6 - j * 9,
        size: 7.5,
        font: regular,
        color: C.accentInk,
      }),
    );
    w.y -= rowH;
  });
  w.y -= 6;
  w.text(
    "Время старта, финиша и заката местное, в скобках часовой пояс. Закат считается в точке финиша дня. «Запр.»: число заправок за день.",
    { size: 8, color: C.muted },
  );

  // 5. Карты по дням (v0.3): снимок на наших тайлах или схема без WebGL.
  const ridingDays = plan.days.flatMap((day, i) => (day.rest ? [] : [{ day, i }]));
  if (ridingDays.length > 1) {
    const gap = 12;
    const cellW = (A4.w - 2 * M - gap) / 2;
    const cellH = cellW * 0.66;
    w.ensure(cellH + 60);
    w.heading("Карты по дням");
    let daySnapshots = !input.skipMapSnapshot && snapshot !== null;
    for (let k = 0; k < ridingDays.length; k += 2) {
      w.ensure(cellH + 30);
      const top = w.y;
      for (const [col, item] of ridingDays.slice(k, k + 2).entries()) {
        const { day, i } = item;
        const x = M + col * (cellW + gap);
        const label = dayLabels[i];
        const title = `День ${day.number}: ${label ? `${label.from} — ${label.to}` : ""}, ${formatKm(day.distanceKm)}`;
        const titleLine = w.wrap(title, bold, 8.5, cellW)[0] ?? "";
        w.page.drawText(titleLine, { x, y: top - 10, size: 8.5, font: bold, color: C.ink });
        const part = sliceLine(line, day.startKm, day.endKm);
        const snapshot =
          !daySnapshots || k + col >= MAX_DAY_SNAPSHOTS
            ? null
            : await mapSnapshot(part, [], Math.round(cellW * 4), Math.round(cellH * 4), 6000);
        // Не вышло один раз (нет WebGL или тайлов): остальные дни сразу схемой.
        if (!snapshot) daySnapshots = false;
        const y = top - 16 - cellH;
        if (snapshot) {
          const image = await doc.embedPng(snapshot.png);
          w.page.drawImage(image, { x, y, width: cellW, height: cellH });
          w.page.drawRectangle({
            x,
            y,
            width: cellW,
            height: cellH,
            borderColor: C.line,
            borderWidth: 1,
          });
        } else {
          drawRouteSchema(w.page, part, [], x, y, cellW, cellH);
        }
      }
      w.y = top - cellH - 26;
    }
  }

  // Километраж по дням.
  if (plan.days.length > 1) {
    const chartH = 130;
    w.ensure(chartH + 70);
    w.heading("Километраж по дням");
    const maxKm = Math.max(...plan.days.map((d) => d.distanceKm), 1);
    const chartW = A4.w - 2 * M;
    const barW = Math.min(30, (chartW - 10) / plan.days.length - 4);
    const top = w.y;
    const limit = state.profile.dailyLimitKm;
    plan.days.forEach((d, i) => {
      const bh = (d.distanceKm / maxKm) * chartH;
      const x = M + 5 + i * (barW + 4);
      w.page.drawRectangle({
        x,
        y: top - chartH,
        width: barW,
        height: bh,
        color: d.distanceKm > limit ? C.accent : C.primary,
      });
      if (barW >= 14)
        w.page.drawText(String(d.number), {
          x: x + barW / 2 - 3,
          y: top - chartH - 11,
          size: 7,
          font: regular,
          color: C.muted,
        });
    });
    if (limit < maxKm) {
      const ly = top - chartH + (limit / maxKm) * chartH;
      w.page.drawLine({
        start: { x: M, y: ly },
        end: { x: M + chartW, y: ly },
        thickness: 0.8,
        color: C.muted,
        dashArray: [3, 3],
      });
      w.page.drawText(`лимит ${limit} км`, {
        x: M + chartW - 60,
        y: ly + 3,
        size: 7,
        font: regular,
        color: C.muted,
      });
    }
    w.y -= chartH + 22;
    w.text(`Максимум: ${formatKm(maxKm)} в день. Оранжевым: дни больше лимита.`, {
      size: 8,
      color: C.muted,
    });
  }

  // 6. Графики: профиль высоты (E-01, v0.3), если у сервера есть данные высот.
  const total = elevationStats(line, 0, plan.distanceKm);
  if (total && line.elevation) {
    const chartH = 100;
    w.ensure(chartH + 70);
    w.heading("Профиль высоты");
    const chartW = A4.w - 2 * M;
    const top = w.y;
    const span = Math.max(total.maxM - total.minM, 50);
    const base = total.minM - span * 0.1;
    const xAt = (km: number) => M + (km / Math.max(plan.distanceKm, 1e-9)) * chartW;
    const yAt = (m: number) => top - chartH + ((m - base) / (span * 1.2)) * chartH;
    w.page.drawRectangle({
      x: M,
      y: top - chartH,
      width: chartW,
      height: chartH,
      color: C.surface,
      borderColor: C.line,
      borderWidth: 0.6,
    });
    // Границы дней пунктиром.
    for (const day of plan.days.slice(0, -1)) {
      if (day.rest) continue;
      w.page.drawLine({
        start: { x: xAt(day.endKm), y: top - chartH },
        end: { x: xAt(day.endKm), y: top },
        thickness: 0.5,
        color: C.line,
        dashArray: [2, 2],
      });
    }
    const step = Math.max(1, Math.floor(line.elevation.length / 1500));
    let prev: [number, number] | null = null;
    for (let i = 0; i < line.elevation.length; i += step) {
      const p: [number, number] = [xAt(line.km[i] ?? 0), yAt(line.elevation[i] ?? 0)];
      if (prev)
        w.page.drawLine({
          start: { x: prev[0], y: prev[1] },
          end: { x: p[0], y: p[1] },
          thickness: 1.2,
          color: C.primary,
        });
      prev = p;
    }
    for (const [value, label] of [
      [total.maxM, `${Math.round(total.maxM)} м`],
      [total.minM, `${Math.round(total.minM)} м`],
    ] as const) {
      w.page.drawText(label, {
        x: M + 3,
        y: yAt(value) + 2,
        size: 7,
        font: regular,
        color: C.muted,
      });
    }
    w.y -= chartH + 14;
    w.text(
      `Набор высоты ${Math.round(total.ascentM)} м, сброс ${Math.round(total.descentM)} м, от ${Math.round(total.minM)} до ${Math.round(total.maxM)} м над уровнем моря. Пунктир: границы дней. Данные высот: ${ELEVATION_SOURCE}.`,
      { size: 8, color: C.muted },
    );
  }

  // 6. Графики: структура бюджета (v0.2).
  const parts: [string, number, RGB][] = (
    [
      ["Топливо", result.budget.fuel, C.primary],
      ["Жильё", result.budget.lodging, C.accent],
      ["Еда", result.budget.food, hex("#7A9A5B")],
      ["Кофе", result.budget.coffee, hex("#8C6A43")],
      ["Прочее", result.budget.other, hex("#B9A77E")],
      ["Резерв", result.budget.reserve, C.muted],
    ] as [string, number, RGB][]
  ).filter(([, v]) => v > 0);
  const budgetTotal = parts.reduce((sum, [, v]) => sum + v, 0);
  if (budgetTotal > 0) {
    w.ensure(110);
    w.heading("Структура бюджета");
    const barW = A4.w - 2 * M;
    let x = M;
    const top = w.y;
    for (const [, value, color] of parts) {
      const width = (value / budgetTotal) * barW;
      w.page.drawRectangle({ x, y: top - 22, width, height: 22, color });
      x += width;
    }
    let lx = M;
    let ly = top - 38;
    for (const [label, value, color] of parts) {
      const text = `${label}: ${m(value)} (${Math.round((value / budgetTotal) * 100)}%)`;
      const tw = regular.widthOfTextAtSize(text, 8) + 22;
      if (lx + tw > A4.w - M) {
        lx = M;
        ly -= 13;
      }
      w.page.drawRectangle({ x: lx, y: ly - 1, width: 8, height: 8, color });
      w.page.drawText(text, { x: lx + 12, y: ly, size: 8, font: regular, color: C.ink });
      lx += tw;
    }
    w.y = ly - 16;
  }

  // 6. Графики: уровень топлива по маршруту. Старт с полным баком, заправка до полного
  // в точках из расчёта (через запас хода с резервом 10%).
  const fullRangeKm = (state.profile.tankL / state.profile.consumptionLPer100Km) * 100;
  if (plan.distanceKm > 0 && fullRangeKm > 0) {
    const chartH = 90;
    w.ensure(chartH + 70);
    w.heading("Уровень топлива");
    const chartW = A4.w - 2 * M;
    const top = w.y;
    const xAt = (km: number) => M + (km / plan.distanceKm) * chartW;
    const yAt = (level: number) => top - chartH + level * chartH;
    w.page.drawRectangle({
      x: M,
      y: top - chartH,
      width: chartW,
      height: chartH,
      color: C.surface,
      borderColor: C.line,
      borderWidth: 0.6,
    });
    const reserve = 1 - plan.rangeKm / fullRangeKm;
    w.page.drawLine({
      start: { x: M, y: yAt(reserve) },
      end: { x: M + chartW, y: yAt(reserve) },
      thickness: 0.6,
      color: C.accentInk,
      dashArray: [3, 3],
    });
    w.page.drawText(`резерв ${Math.round(reserve * 100)}%`, {
      x: M + 4,
      y: yAt(reserve) + 3,
      size: 7,
      font: regular,
      color: C.accentInk,
    });
    const stops = plan.days.flatMap((d) => d.fuelStopsKm);
    let last = 0;
    for (const stop of [...stops, plan.distanceKm]) {
      const level = Math.max(0, 1 - (stop - last) / fullRangeKm);
      w.page.drawLine({
        start: { x: xAt(last), y: yAt(1) },
        end: { x: xAt(stop), y: yAt(level) },
        thickness: 1.2,
        color: C.primary,
      });
      if (stop < plan.distanceKm)
        w.page.drawLine({
          start: { x: xAt(stop), y: yAt(level) },
          end: { x: xAt(stop), y: yAt(1) },
          thickness: 0.8,
          color: C.primary,
        });
      last = stop;
    }
    for (const [km, align] of [
      [0, 0],
      [plan.distanceKm, 1],
    ] as const) {
      const label = formatKm(km);
      w.page.drawText(label, {
        x: xAt(km) - align * regular.widthOfTextAtSize(label, 7),
        y: top - chartH - 9,
        size: 7,
        font: regular,
        color: C.muted,
      });
    }
    w.y -= chartH + 22;
    w.text(
      `Полный бак ${state.profile.tankL} л хватает примерно на ${formatKm(fullRangeKm)}; заправок: ${stops.length}. Вертикальные линии: заправки до полного бака.`,
      { size: 8, color: C.muted },
    );
  }

  // 8. Погода: прогноз до 16 дней, дальше климатическая норма с пометкой.
  const weather = input.weather ?? [];
  if (weather.some(Boolean)) {
    w.ensure(80);
    w.heading("Погода");
    plan.days.forEach((day, i) => {
      const dw = weather[i];
      const place = dayLabels[i]?.to ?? "";
      const text = dw
        ? `${describeWeather(dw)} (${weatherSource(dw)})${weatherWarnings(dw).length ? `. ${weatherWarnings(dw).join(". ")}` : ""}`
        : "нет данных";
      w.text(`День ${day.number}, ${formatDate(day.date)}, ${place}: ${text}`, {
        size: 8.5,
        gap: 2,
      });
    });
    w.text("Погода в точке финиша дня. Источник: Open-Meteo.com, CC BY 4.0.", {
      size: 8,
      color: C.muted,
    });
  }

  // 9. Источники и оговорки.
  w.heading("Источники и оговорки");
  w.text(
    [
      "Расчёты ориентировочные: цены по умолчанию, состояние дорог, часовые пояса и правила въезда могут отличаться. Проверяйте маршрут перед выездом; за безопасность поездки отвечает водитель.",
      "Маршрут и карта: © участники OpenStreetMap, данные доступны по лицензии ODbL (openstreetmap.org/copyright). Маршрутизация: GraphHopper. Погода: Open-Meteo.com (CC BY 4.0).",
      "Время в пути считается по скоростям из профиля мотоцикла, остановкам на заправку (15 мин) и обеду (45 мин при 4 ч в пути и больше); паромы по расписанию из данных OSM.",
      `Открыть маршрут: ${input.url}`,
      `Сервис «Верста»: ${site.github}. Ошибки и вопросы: ${site.email}.`,
    ].join("\n"),
    { size: 8.5, color: C.ink },
  );

  // Поддержать разработчика: ссылка и QR-код из админки.
  const donate =
    input.donate !== undefined
      ? input.donate
      : donateEnabled
        ? { label: donateConfig.label, url: donateConfig.url, qr: await donateQrForPdf() }
        : null;
  if (donate) {
    const qrSize = 84;
    w.ensure(qrSize + 30);
    w.y -= 10;
    const top = w.y;
    w.page.drawRectangle({
      x: M,
      y: top - qrSize - 16,
      width: A4.w - 2 * M,
      height: qrSize + 16,
      color: C.surface,
      borderColor: C.line,
      borderWidth: 1,
    });
    w.page.drawText(donate.label, { x: M + 12, y: top - 24, size: 13, font: bold, color: C.ink });
    const lines = w.wrap(
      "«Верста» бесплатная и без рекламы. Если сервис помог спланировать поездку, можно поддержать разработчика: наведите камеру на QR-код или откройте ссылку.",
      regular,
      8.5,
      A4.w - 2 * M - qrSize - 40,
    );
    lines.forEach((line, i) =>
      w.page.drawText(line, {
        x: M + 12,
        y: top - 42 - i * 11,
        size: 8.5,
        font: regular,
        color: C.ink,
      }),
    );
    const urlY = top - 46 - lines.length * 11;
    w.page.drawText(donate.url, { x: M + 12, y: urlY, size: 8.5, font: regular, color: C.primary });
    // Ссылка кликабельна при просмотре PDF на экране.
    const urlWidth = regular.widthOfTextAtSize(donate.url, 8.5);
    const annotation = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [M + 12, urlY - 2, M + 12 + urlWidth, urlY + 9],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(donate.url) },
      }),
    );
    w.page.node.addAnnot(annotation);
    if (donate.qr) {
      try {
        const image =
          donate.qr.kind === "png"
            ? await doc.embedPng(donate.qr.bytes)
            : await doc.embedJpg(donate.qr.bytes);
        w.page.drawImage(image, {
          x: A4.w - M - qrSize - 8,
          y: top - qrSize - 8,
          width: qrSize,
          height: qrSize,
        });
      } catch {
        // Повреждённая картинка не должна ломать путевой лист: остаётся ссылка.
      }
    }
    w.y = top - qrSize - 16;
  }

  // Номера страниц.
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawText(`Верста · ${title} · ${i + 1} из ${pages.length}`, {
      x: M,
      y: 20,
      size: 7,
      font: regular,
      color: C.muted,
    });
  });

  return doc.save();
}
