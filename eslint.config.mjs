import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json"],
                tsconfigRootDir: __dirname,
            },
        },
    },
    {
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**"],
    },
];