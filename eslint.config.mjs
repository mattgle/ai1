import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.browser_modules/**",
      "**/lib/**",
      "**/dist/**",
      "**/src-gen/**",
      "**/plugins/**",
      "**/gen-webpack*.js",
      "**/webpack.config.js",
      "**/esbuild.mjs",
      "**/gen-esbuild*.mjs",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
        console: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
