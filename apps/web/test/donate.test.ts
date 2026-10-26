import { describe, expect, it } from "vitest";
import { donateEnabled, generatedQrDataUrl } from "../src/lib/donate";

describe("поддержать разработчика", () => {
  it("без ссылки в data/site.json блок выключен", () => {
    expect(donateEnabled).toBe(false);
  });

  it("QR-код собирается из ссылки в PNG", async () => {
    expect(await generatedQrDataUrl("https://example.org/donate")).toMatch(
      /^data:image\/png;base64,/,
    );
  });
});
