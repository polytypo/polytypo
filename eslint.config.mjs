import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "src/locales/**",
      "spec/fixtures/.escaped/**",
      "promo/vendor/**",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always"],
      "no-console": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs", "brand/tools/**/*.{ts,mjs}", "*.config.ts", "*.config.mjs"],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
    rules: {
      "no-console": "off",
    },
  },
);
