import { describe, expect, it } from "vitest";
import { normalizeGroup } from "./group.js";

describe("normalizeGroup", () => {
  it("1 человек и 2 мотоцикла → людей становится 2 (критерий приёмки C-16)", () => {
    expect(normalizeGroup({ people: 1, motorcycles: 2 })).toEqual({ people: 2, motorcycles: 2 });
  });

  it.each([
    { people: 1, motorcycles: 1 },
    { people: 2, motorcycles: 1 },
    { people: 2, motorcycles: 2 },
  ] as const)("допустимое сочетание %o не меняется", (group) => {
    expect(normalizeGroup(group)).toEqual(group);
  });
});
