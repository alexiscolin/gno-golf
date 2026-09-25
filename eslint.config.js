// Lint: the React hooks rules (the ones that catch real bugs) and the basics,
// for the web client and the node scripts in scripts/.
// It sits at the root so it reaches those; its plugins are the client's.
// Run from web/: `npm run lint` (or `npx eslint .` for the client alone).
import { createRequire } from "node:module";
const require = createRequire(new URL("./web/package.json", import.meta.url));
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

// no-unused-vars does not see a component used as <Name />: this marks it used
// (what eslint-plugin-react's jsx-uses-vars does, without the dependency)
const jsx = {
  rules: {
    "uses-vars": {
      create: (context) => ({
        JSXOpeningElement(node) {
          let n = node.name;
          while (n.type === "JSXMemberExpression") n = n.object;
          if (n.type === "JSXIdentifier") context.sourceCode.markVariableAsUsed(n.name, node);
        },
      }),
    },
  },
};

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
};

export default [
  { ignores: ["**/.next/**", "**/out/**", "**/node_modules/**"] },
  {
    files: ["web/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, process: "readonly" },
    },
    plugins: { "react-hooks": reactHooks, jsx },
    rules: {
      ...rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "jsx/uses-vars": "error",
    },
  },
  {
    files: ["web/*.mjs", "scripts/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
    rules,
  },
];
