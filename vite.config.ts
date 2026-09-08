import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
  },
  staged: { "*": "vp check --fix" },
  fmt: {
    sortImports: {
      groups: [
        "type-import",
        ["value-builtin", "value-external"],
        "type-internal",
        "value-internal",
        ["type-parent", "type-sibling", "type-index"],
        ["value-parent", "value-sibling", "value-index"],
        "unknown",
      ],
    },
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "pnpm-lock.yaml",
      ".agents/*",
      "**/src/components/ui/**",
    ],
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "es5",
    printWidth: 80,
    sortTailwindcss: {
      stylesheet: "apps/web/src/styles.css",
      functions: ["cn", "cva"],
    },
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: ["**/routeTree.gen.ts", "**/src/components/ui/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error", curly: "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: { cache: true },
})
