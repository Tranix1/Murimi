// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    // TypeScript/Expo resolve SDK packages and the @/* aliases using tsconfig;
    // eslint-plugin-import's Node resolver cannot resolve several Expo exports.
    // TypeScript is run separately as the authoritative import check.
    rules: { "import/no-unresolved": "off" },
  }
]);
