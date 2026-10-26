import { describe, expect, it } from "vitest";
import {
  drivingTimeH,
  sliceSegments,
  totalDistanceKm,
  type Segment,
  type Speeds,
} from "./roads.js";

const speeds: Speeds = { motorway: 100, trunk: 80, regional: 70, local: 50 };

describe("drivingTimeH", () => {
  it("время зависит от скоростей по классам дорог (P0-3)", () => {
    const segments: Segment[] = [
      { distanceKm: 200, roadClass: "motorway" },
      { distanceKm: 80, roadClass: "trunk" },
      { distanceKm: 50, roadClass: "local" },
    ];
    expect(drivingTimeH(segments, speeds)).toBeCloseTo(2 + 1 + 1);
  });

  it("для парома берёт фиксированное время", () => {
    expect(
      drivingTimeH(
        [{ distanceKm: 30, roadClass: "local", ferry: true, fixedDurationH: 1.5 }],
        speeds,
      ),
    ).toBe(1.5);
  });

  it("отклоняет нулевую скорость", () => {
    expect(() => drivingTimeH([], { ...speeds, local: 0 })).toThrow(RangeError);
  });
});

describe("sliceSegments", () => {
  const segments: Segment[] = [
    { distanceKm: 100, roadClass: "motorway" },
    { distanceKm: 100, roadClass: "local" },
  ];

  it("режет участок на границе", () => {
    const part = sliceSegments(segments, 50, 150);
    expect(part).toEqual([
      { distanceKm: 50, roadClass: "motorway" },
      { distanceKm: 50, roadClass: "local" },
    ]);
    expect(totalDistanceKm(part)).toBe(100);
  });

  it("делит время парома пропорционально", () => {
    const [piece] = sliceSegments(
      [{ distanceKm: 40, roadClass: "local", fixedDurationH: 2 }],
      0,
      10,
    );
    expect(piece?.fixedDurationH).toBeCloseTo(0.5);
  });
});
