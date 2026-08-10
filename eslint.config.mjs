import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `brand/` is the delivered brand kit: its patch/*.tsx files are code
    // fragments, not modules, so they must stay out of the type/lint program.
    ignores: ["node_modules/**", ".next/**", "src/generated/**", "brand/**"],
  },
];

export default eslintConfig;
