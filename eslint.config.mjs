import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Brand assets are small static PNGs; plain <img> keeps views renderable outside Next.
      "@next/next/no-img-element": "off",
      // Plain <a> links keep views framework-agnostic (preview renderer, tests).
      "@next/next/no-html-link-for-pages": "off",
      // Apostrophes in JSX copy ("you'll", "can't") render correctly in React.
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  { ignores: [".next/", "preview/", "node_modules/"] },
];
