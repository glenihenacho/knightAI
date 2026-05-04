/** Shared ESLint flat config for the surveillance-platform monorepo. */
export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/target/**", "**/node_modules/**"],
  },
  {
    rules: {
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
