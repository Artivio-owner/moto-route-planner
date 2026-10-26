// Копирует Sveltia CMS из npm в apps/web/public/admin/vendor/ (не хранится в репозитории).
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
// Пакет не экспортирует package.json: корень находим от главного файла (npm/index.js).
const source = join(dirname(dirname(require.resolve("@sveltia/cms"))), "dist");
const target = new URL("../apps/web/public/admin/vendor/", import.meta.url).pathname;
mkdirSync(target, { recursive: true });
cpSync(join(source, "sveltia-cms.js"), join(target, "sveltia-cms.js"));
cpSync(join(source, "chunks"), join(target, "chunks"), { recursive: true });
console.log(`Sveltia CMS скопирована в ${target}`);
