// «Поддержать разработчика»: ссылка и QR-код из data/site.json (задаются в админке).
import QRCode from "qrcode";
import { site } from "../config";

export const donate = site.donate;

/** Блок показывается, только когда владелец указал ссылку. */
export const donateEnabled = /^https:\/\//.test(donate.url);

const QR_COLORS = { dark: "#2E2B25", light: "#FFFBF2" };

/** QR-код из ссылки, если владелец не загрузил свою картинку. */
export function generatedQrDataUrl(url = donate.url): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 360,
    color: QR_COLORS,
    errorCorrectionLevel: "M",
  });
}

/** Картинка для страницы: загруженная владельцем или собранная из ссылки. */
export async function donateQrSrc(): Promise<string | null> {
  if (!donateEnabled) return null;
  return donate.qrImage || generatedQrDataUrl();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export interface PdfQr {
  bytes: Uint8Array;
  kind: "png" | "jpg";
}

/** QR для PDF: pdf-lib встраивает только PNG и JPG, иначе собираем PNG из ссылки. */
export async function donateQrForPdf(): Promise<PdfQr | null> {
  if (!donateEnabled) return null;
  const image = donate.qrImage;
  const kind = /\.png$/i.test(image) ? "png" : /\.jpe?g$/i.test(image) ? "jpg" : null;
  if (image && kind) {
    try {
      const response = await fetch(image);
      if (response.ok) return { bytes: new Uint8Array(await response.arrayBuffer()), kind };
    } catch {
      // Картинка недоступна: соберём QR из ссылки.
    }
  }
  return { bytes: dataUrlToBytes(await generatedQrDataUrl()), kind: "png" };
}
