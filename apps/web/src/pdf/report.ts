// PDF путевой лист, базовая версия v0.1 (ADR-0012): титул, сводка, карта, таблица по дням,
// километраж по дням, источники. Спецификация: docs/11-pdf-report-spec.md.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { site } from "../config";
import type { LonLat } from "../lib/api";
import {
  formatDate,
  formatHours,
  formatKm,
  formatLiters,
  localTimeWithZone,
  money,
  pluralDays,
} from "../lib/format";
import { bounds, pointAtKm, type PlanResult } from "../lib/plan";
import { CUSTOM_PRESET, completePoints, routeTitle, type PlannerState } from "../state/planner";
import { presets } from "../config";
import { mapSnapshot } from "./mapSnapshot";

export interface ReportInput {
  state: PlannerState;
  result: PlanResult;
  line: { points: LonLat[]; km: number[] };
  dayLabels: { from: string; to: string }[];
  url: string;
  /** Для тестов: не пытаться рисовать карту через WebGL. */
  skipMapSnapshot?: boolean;
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
      `${formatDate(state.startDate)} — ${lastDay ? formatDate(lastDay.date) : ""}, ${pluralDays(plan.days.length)}`,
      `Людей: ${plan.group.people}, мотоциклов: ${plan.group.motorcycles}. Мотоцикл: ${presetName}, бак ${state.profile.tankL} л, расход ${String(state.profile.consumptionLPer100Km).replace(".", ",")} л/100 км`,
      `Валюта: ${cur === "RUB" ? "рубли" : `доллары (курс ${String(rubPerUsd).replace(".", ",")} ₽ за $${result.rateEdited ? ", ваш" : ", ориентировочно"})`}. ${state.avoidUnpaved ? "Без грунтовых дорог" : "Грунтовые дороги разрешены"}${state.roundTrip ? ", с возвратом" : ""}.`,
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

  // 3. Карта маршрута.
  w.heading("Карта маршрута");
  const nights = plan.days.slice(0, -1).map((d) => pointAtKm(line, d.endKm));
  const mapW = A4.w - 2 * M;
  const mapH = mapW * 0.62;
  w.ensure(mapH + 20);
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
    { title: "Старт — финиш (местное)", w: 110 },
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
    const notes = [
      day.hasToll ? "платный участок" : "",
      day.hasFerry ? "паром" : "",
      day.zoneShiftH ? `пояс ${day.zoneShiftH > 0 ? "+" : ""}${day.zoneShiftH} ч` : "",
      ...day.warnings.map((x) => x.message),
    ].filter(Boolean);
    const values = [
      `${day.number}\n${formatDate(day.date)}`,
      label ? `${label.from} — ${label.to}` : "",
      formatKm(day.distanceKm).replace("\u00a0км", ""),
      formatHours(day.totalH).replace("\u00a0ч", ""),
      `${localTimeWithZone(day.departure, day.startTimeZone)}\n${localTimeWithZone(day.arrival, day.endTimeZone)}`,
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
    "Время старта и финиша местное, в скобках часовой пояс. «Запр.»: число заправок за день.",
    { size: 8, color: C.muted },
  );

  // Километраж по дням.
  if (plan.days.length > 1) {
    w.heading("Километраж по дням");
    const chartH = 130;
    w.ensure(chartH + 30);
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

  // 9. Источники и оговорки.
  w.heading("Источники и оговорки");
  w.text(
    [
      "Расчёты ориентировочные: цены по умолчанию, состояние дорог, часовые пояса и правила въезда могут отличаться. Проверяйте маршрут перед выездом; за безопасность поездки отвечает водитель.",
      "Маршрут и карта: © участники OpenStreetMap, данные доступны по лицензии ODbL (openstreetmap.org/copyright). Маршрутизация: GraphHopper.",
      "Время в пути считается по скоростям из профиля мотоцикла, остановкам на заправку (15 мин) и обеду (45 мин при 4 ч в пути и больше); паромы по расписанию из данных OSM.",
      `Открыть маршрут: ${input.url}`,
      `Сервис «Верста»: ${site.github}. Ошибки и вопросы: ${site.email}.`,
    ].join("\n"),
    { size: 8.5, color: C.ink },
  );

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
