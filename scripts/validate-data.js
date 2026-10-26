// Проверка файлов data/*.json по схемам data/schemas/ и перекрёстных ссылок (CFG-02).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const dataDir = new URL("../data/", import.meta.url).pathname;
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const read = (name) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));
const errors = [];

const schemas = readdirSync(join(dataDir, "schemas")).filter((f) => f.endsWith(".schema.json"));
for (const schemaFile of schemas) {
  const dataFile = schemaFile.replace(".schema.json", ".json");
  const validate = ajv.compile(read(join("schemas", schemaFile)));
  if (!validate(read(dataFile))) {
    for (const e of validate.errors) errors.push(`${dataFile}${e.instancePath}: ${e.message}`);
  }
}

const dataFiles = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
for (const file of dataFiles) {
  if (!schemas.includes(file.replace(".json", ".schema.json"))) {
    errors.push(`${file}: нет схемы в data/schemas/`);
  }
}

// Осмысленность значений, которую не выразить схемой.
const presets = read("moto-presets.json").presets;
const defaults = read("trip-defaults.json");
const ids = presets.map((p) => p.id);
if (new Set(ids).size !== ids.length) errors.push("moto-presets.json: повторяются id пресетов");
if (!ids.includes(defaults.presetId)) {
  errors.push(`trip-defaults.json: пресет «${defaults.presetId}» не найден в moto-presets.json`);
}
for (const p of presets) {
  if (p.heavyDayKm < p.dailyLimitKm) {
    errors.push(`moto-presets.json: у «${p.name}» порог тяжёлого дня меньше дневного лимита`);
  }
}
const countryCodes = read("countries.json").countries.map((c) => c.code);
for (const code of Object.keys(read("fuel-prices.json").countries)) {
  if (!countryCodes.includes(code))
    errors.push(`fuel-prices.json: страны ${code} нет в countries.json`);
}
if (defaults.motorcycles === 2 && defaults.people < 2) {
  errors.push("trip-defaults.json: при двух мотоциклах людей не меньше двух");
}

if (errors.length) {
  console.error(`Ошибки в настройках (${errors.length}):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Настройки в порядке: ${dataFiles.length} файлов`);
