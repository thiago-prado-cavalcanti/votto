import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `brand/` and `patch-humanizado/` are delivered kits: their *.tsx files are
    // code fragments, not modules, so they stay out of the type/lint program.
    ignores: [
      "node_modules/**",
      ".next/**",
      "src/generated/**",
      "brand/**",
      "patch-humanizado/**",
    ],
  },
];

export default eslintConfig;
