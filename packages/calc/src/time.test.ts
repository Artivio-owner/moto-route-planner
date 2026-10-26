import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDuration,
  formatLocalTime,
  formatUtcOffset,
  utcOffsetMinutes,
  zonedTimeToInstant,
} from "./time.js";

describe("часовые пояса", () => {
  const at = new Date("2026-07-01T00:00:00Z");

  it("Москва UTC+3, Владивосток UTC+10", () => {
    expect(utcOffsetMinutes("Europe/Moscow", at)).toBe(180);
    expect(utcOffsetMinutes("Asia/Vladivostok", at)).toBe(600);
  });

  it("8:00 в Сочи — это 5:00 UTC", () => {
    expect(zonedTimeToInstant("2026-07-01", 480, "Europe/Moscow").toISOString()).toBe(
      "2026-07-01T05:00:00.000Z",
    );
  });

  it("учитывает летнее время в Европе", () => {
    expect(zonedTimeToInstant("2026-07-01", 480, "Europe/Berlin").toISOString()).toBe(
      "2026-07-01T06:00:00.000Z",
    );
    expect(zonedTimeToInstant("2026-01-15", 480, "Europe/Berlin").toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
  });

  it("форматирует пояс и местное время", () => {
    expect(formatUtcOffset(180)).toBe("UTC+3");
    expect(formatUtcOffset(330)).toBe("UTC+5:30");
    expect(formatUtcOffset(-150)).toBe("UTC−2:30");
    expect(formatLocalTime(new Date("2026-07-01T05:00:00Z"), "Asia/Vladivostok")).toBe("15:00");
  });

  it("отклоняет дату в другом формате", () => {
    expect(() => zonedTimeToInstant("01.07.2026", 0, "UTC")).toThrow(RangeError);
  });
});

describe("даты и длительность", () => {
  it("addDays переходит через месяц", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("formatDuration", () => {
    expect(formatDuration(7.5)).toBe("7:30");
    expect(formatDuration(0.25)).toBe("0:15");
  });
});
