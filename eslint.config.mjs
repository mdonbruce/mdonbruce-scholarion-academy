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
    },
  },
  { ignores: [".next/", "preview/", "node_modules/"] },
];
