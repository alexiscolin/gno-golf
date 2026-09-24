// Lint: the React hooks rules (the ones that catch real bugs) and the basics.
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: [".next/**", "out/**", "node_modules/**"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, process: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-undef": "error",
      // components are used in JSX, which this rule does not see
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^[A-Z]" }],
    },
  },
];
