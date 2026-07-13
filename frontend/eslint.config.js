const js = require('../node_modules/@eslint/js');
const tsParser = require('../node_modules/@typescript-eslint/parser/dist/index.js');
const tsPlugin = require('../node_modules/@typescript-eslint/eslint-plugin/dist/index.js');

module.exports = [
  {
    ignores: ['.next/**', 'node_modules/**', 'eslint.config.js', 'next-env.d.ts', 'next.config.js', 'postcss.config.js', 'tailwind.config.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2021,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
