import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ["scripts/**/*.js", "**/*.config.{js,ts}"], languageOptions: { globals: globals.node } },
  { files: ["apps/web/public/sw.js"], languageOptions: { globals: globals.serviceworker } },
);
