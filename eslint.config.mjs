import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: [
          "./apps/api/tsconfig.json",
          "./infrastructure/tsconfig.json",
          "./apps/frontend/tsconfig.json",
        ],
        tsconfigRootDir: ".",
        sourceType: "module",
      },
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      ".eslintrc.js",
      "node_modules/**",
      ".turbo/**",
      "dist/**",
      "build/**",
    ],
    plugins: {
      import: importPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "parent",
            "sibling",
            "index",
            "type",
            "internal",
            "object",
          ],
          pathGroups: [
            {
              pattern: "react",
              group: "builtin",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["react"],
          distinctGroup: true,
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: false,
          },
          warnOnUnassignedImports: false,
        },
      ],
    },
  },
];
