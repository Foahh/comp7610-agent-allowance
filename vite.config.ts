import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    include: ["packages/contracts/test/**/*.test.ts"],
    testTimeout: 60000,
    fileParallelism: false,
  },
  staged: { "*": "vp check --fix" },
  fmt: {
    ignorePatterns: ["**/routeTree.gen.ts", "pnpm-lock.yaml", ".agents/*"],
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
    ignorePatterns: ["**/routeTree.gen.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error", curly: "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: { cache: true },
})
