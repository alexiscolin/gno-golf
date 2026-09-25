// Lint: typescript-eslint's type-checked rules and the React hooks rules for
// the web client, and the basics for the node scripts that drive it
// (scripts/). It sits at the root so it reaches those; its plugins are the
// client's. Run from web/: `npm run lint` (or `npx eslint .` for the client alone).
import { createRequire } from "node:module";
const require = createRequire(new URL("./web/package.json", import.meta.url));
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

const web = new URL("./web/", import.meta.url).pathname;

export default tseslint.config(
  { ignores: ["**/.next/**", "**/out/**", "**/node_modules/**", "web/next-env.d.ts"] },
  {
    files: ["web/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: web },
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // the client's own style: short statements joined as expressions
      // ("(a = 1), (b = 2)", "x && f()"), which this rule reads as dead code
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["scripts/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: new URL("./scripts/", import.meta.url).pathname },
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["web/*.mjs", "scripts/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
);
