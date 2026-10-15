// Code style and correctness checks: Next.js's recommended rules (React,
// hooks, accessibility, Core Web Vitals) plus its TypeScript rules.
// Run with `npm run lint`; `next build` runs it too, so an error blocks a deploy.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // A leading underscore marks a name that is unused on purpose.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    ignores: [
      "node_modules/**", ".next/**", "out/**", "next-env.d.ts", "public/**",
      // Not the app: agent skills, the demo-video project, a personal tool, marketing assets.
      ".agents/**", "demo-video/**", "phone-agent/**", "marketing/**",
    ],
  },
];

export default eslintConfig;
