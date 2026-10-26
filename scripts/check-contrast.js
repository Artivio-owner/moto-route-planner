// Контраст пар «текст на фоне» по WCAG 2.1 для токенов дизайн-системы (D-02).
// Порог: 4,5 для обычного текста, 3 для крупного (от 19 px полужирного) и элементов интерфейса.
import { readFileSync } from "node:fs";

const tokens = JSON.parse(
  readFileSync(new URL("../docs/design/design-tokens.json", import.meta.url), "utf8"),
).color;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [текст, фон, где используется, порог]
const pairs = [
  ["ink", "bg", "основной текст на странице", 4.5],
  ["ink", "surface", "текст в карточках", 4.5],
  ["muted", "bg", "подписи на странице", 4.5],
  ["muted", "surface", "подписи в карточках", 4.5],
  ["onPrimary", "primary", "текст основной кнопки и выбранного чипа", 4.5],
  ["onAccent", "accent", "текст кнопки «Скачать PDF»", 4.5],
  ["primary", "surface", "ссылки и логотип", 4.5],
  ["primary", "bg", "ссылки на странице", 4.5],
  ["accentInk", "surface", "оранжевый текст: пометки и предупреждения", 4.5],
  ["accentInk", "bg", "оранжевый текст на странице и в PDF", 4.5],
  ["inputBorder", "surface", "границы полей ввода и чипов", 3],
  ["inputBorder", "bg", "границы полей на фоне страницы", 2.9],
];

let failed = 0;
for (const [fg, bg, where, min] of pairs) {
  const ratio = contrast(tokens[fg], tokens[bg]);
  const ok = ratio >= min;
  if (!ok) failed++;
  console.log(
    `${ok ? "ок    " : "НИЖЕ "} ${ratio.toFixed(2).padStart(5)} (нужно ${min}) ${fg} на ${bg}: ${where}`,
  );
}
if (failed) process.exit(1);
