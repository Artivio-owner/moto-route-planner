import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computePlan, routeLine } from "../src/lib/plan";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import QRCode from "qrcode";
import { buildReport } from "../src/pdf/report";
import { initialState, reducer } from "../src/state/planner";
import { route } from "./fixtures";

const font = (name: string) =>
  new Uint8Array(readFileSync(`${process.cwd()}/public/fonts/${name}`));

describe("PDF путевой лист", () => {
  it("собирается со шрифтом Rubik, без WebGL рисует схему маршрута", async () => {
    let s = initialState(new Date("2026-07-01T10:00:00Z"));
    s = reducer(s, { type: "addFromMap", name: "Москва", lat: 55.7, lon: 37.6 });
    s = reducer(s, { type: "addFromMap", name: "Казань", lat: 55.8, lon: 49.1 });
    s = reducer(s, { type: "addFromMap", name: "Нижний Новгород", lat: 56.3, lon: 44 });
    const result = computePlan(s, route);
    const bytes = await buildReport({
      state: s,
      result,
      line: routeLine(route),
      dayLabels: result.plan.days.map((_, i) => ({ from: `Город ${i}`, to: `Город ${i + 1}` })),
      url: "https://versta.example/plan#r=test",
      weather: result.plan.days.map((d, i) =>
        i === 1
          ? null
          : {
              kind: i === 0 ? ("forecast" as const) : ("climate" as const),
              date: d.date,
              tempMaxC: 25,
              tempMinC: 12,
              precipitationMm: 6,
              windMaxKmh: 20,
              years: 10,
            },
      ),
      skipMapSnapshot: true,
      donate: {
        label: "Поддержать разработчика",
        url: "https://example.org/donate",
        qr: {
          bytes: new Uint8Array(await QRCode.toBuffer("https://example.org/donate")),
          kind: "png",
        },
      },
      fonts: { regular: font("Rubik-Regular.ttf"), bold: font("Rubik-Bold.ttf") },
      now: new Date("2026-06-20T10:00:00Z"),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    // На последней странице кликабельная ссылка «Поддержать разработчика».
    const loaded = await PDFDocument.load(bytes);
    const last = loaded.getPages().at(-1);
    const annots = last?.node.Annots();
    const uris = (annots?.asArray() ?? []).map((ref) => {
      const annot = loaded.context.lookup(ref, PDFDict);
      const action = annot.lookup(PDFName.of("A"), PDFDict);
      return action.lookup(PDFName.of("URI"))?.toString();
    });
    expect(uris.some((u) => u?.includes("example.org/donate"))).toBe(true);
  });

  it("дневка: строка «Дневка» в таблице, PDF собирается (C-11)", async () => {
    let s = initialState(new Date("2026-07-01T10:00:00Z"));
    s = reducer(s, { type: "addFromMap", name: "Москва", lat: 55.7, lon: 37.6 });
    s = reducer(s, { type: "addFromMap", name: "Казань", lat: 55.8, lon: 49.1 });
    s = reducer(s, { type: "set", patch: { split: { mode: "days", days: 2 } } });
    s = reducer(s, { type: "toggleRest", afterDay: 1 });
    const result = computePlan(s, route);
    expect(result.plan.days.map((d) => d.rest)).toEqual([false, true, false]);
    // Дневка добавляет ночь и день еды в бюджет.
    const without = computePlan(reducer(s, { type: "toggleRest", afterDay: 1 }), route);
    expect(result.budget.nightsPaid).toBe(without.budget.nightsPaid + 1);
    expect(result.budget.food).toBeGreaterThan(without.budget.food);
    expect(result.budget.fuel).toBeCloseTo(without.budget.fuel);
    const bytes = await buildReport({
      state: s,
      result,
      line: routeLine(route),
      dayLabels: result.plan.days.map((_, i) => ({ from: `Город ${i}`, to: `Город ${i + 1}` })),
      url: "https://versta.example/plan#r=test",
      skipMapSnapshot: true,
      donate: null,
      fonts: { regular: font("Rubik-Regular.ttf"), bold: font("Rubik-Bold.ttf") },
      now: new Date("2026-06-20T10:00:00Z"),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
