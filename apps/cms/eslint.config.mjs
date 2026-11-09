import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "src/payload-types.ts",
      "src/app/(payload)/admin/importMap.js",
      "src/migrations/**",
    ],
  },
];

export default config;
