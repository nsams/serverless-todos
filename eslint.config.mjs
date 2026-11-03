import eslintConfigReact, { restrictedImportPaths } from "@dextinity/eslint-config/future/react.js";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores([".react-router/**", ".wrangler/**", "build/**", "worker-configuration.d.ts", "eslint.config.mjs", "wrangler.jsonc"]),
    ...eslintConfigReact,
    {
        rules: {
            // No i18n (react-intl) in this app
            "react/jsx-no-literals": "off",
            "@calm/react-intl/missing-formatted-message": "off",
            // @dextinity/admin isn't used (it requires react-router v5), so allow the MUI originals it would replace
            "no-restricted-imports": ["error", { paths: restrictedImportPaths.filter((path) => !path.message?.includes("@dextinity/admin")) }],
        },
    },
]);
