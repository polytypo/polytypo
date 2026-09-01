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
      "promo/assets/**",
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
    files: [
      "scripts/**/*.mjs",
      "scripts/**/*.ts",
      "brand/tools/**/*.{ts,mjs}",
      "tests/packaging/**/*.{mjs,cjs}",
      "*.config.ts",
      "*.config.mjs",
    ],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    // Client-side script for the promo site — copied verbatim to promo/assets/site.js
    // (ignored above) by brand/tools/build_promo.py, and runs in the browser, not Node.
    files: ["brand/tools/promo/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // CommonJS require() smoke test (tests/packaging/cjs-smoke.cjs): proves the "require"
    // condition of every exports subpath resolves, so require() itself is the point of the file.
    files: ["**/*.cjs"],
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
);
