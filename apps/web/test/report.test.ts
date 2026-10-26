import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computePlan, routeLine } from "../src/lib/plan";
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
      skipMapSnapshot: true,
      fonts: { regular: font("Rubik-Regular.ttf"), bold: font("Rubik-Bold.ttf") },
      now: new Date("2026-06-20T10:00:00Z"),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });
});
